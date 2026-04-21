import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { analyzeRepo } from './analyze-repo'

function makeTreeResponse(files: string[]) {
  return {
    ok: true,
    json: () => Promise.resolve({
      tree: files.map((path) => ({ path, type: 'blob' })),
    }),
  }
}

function makeFileResponse(content: string) {
  return { ok: true, text: () => Promise.resolve(content) }
}

describe('analyzeRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns clean result for repo with no Supabase usage', async () => {
    mockFetch
      .mockResolvedValueOnce(makeTreeResponse(['src/index.ts']))
      .mockResolvedValueOnce(makeFileResponse('const x = 1'))

    const result = await analyzeRepo('https://github.com/acme/clean-app', 'main')
    expect(result.risk_flags).toHaveLength(0)
    expect(result.compat_shim_coverage).toBe(1)
    expect(result.halted_on_critical).toBe(false)
  })

  it('halts on critical: SUPABASE_SERVICE_ROLE_KEY detected', async () => {
    mockFetch
      .mockResolvedValueOnce(makeTreeResponse(['lib/supabase.ts']))
      .mockResolvedValueOnce(makeFileResponse('const key = process.env.SUPABASE_SERVICE_ROLE_KEY'))

    const result = await analyzeRepo('https://github.com/acme/bad-app', 'main')
    expect(result.halted_on_critical).toBe(true)
    expect(result.risk_flags.some((f) => f.severity === 'critical')).toBe(true)
    expect(result.migration_checklist).toHaveLength(0)
  })

  it('detects auth patterns with high severity', async () => {
    mockFetch
      .mockResolvedValueOnce(makeTreeResponse(['src/auth.ts']))
      .mockResolvedValueOnce(makeFileResponse('const user = await supabase.auth.getUser()'))

    const result = await analyzeRepo('https://github.com/acme/auth-app', 'main')
    expect(result.halted_on_critical).toBe(false)
    expect(result.risk_flags.some((f) => f.severity === 'high')).toBe(true)
    expect(result.migration_checklist.some((c) => c.category === 'auth')).toBe(true)
  })

  it('detects realtime as unsupported', async () => {
    mockFetch
      .mockResolvedValueOnce(makeTreeResponse(['src/realtime.ts']))
      .mockResolvedValueOnce(makeFileResponse('supabase.channel("room1").subscribe()'))

    const result = await analyzeRepo('https://github.com/acme/rt-app', 'main')
    expect(result.migration_checklist.some((c) => c.category === 'unsupported')).toBe(true)
  })

  it('compat_shim_coverage below 0.5 when unsupported calls dominate', async () => {
    const content = Array(10).fill('supabase.channel("room").subscribe()').join('\n') +
      '\n' + Array(2).fill('supabase.from("t").select()').join('\n')
    mockFetch
      .mockResolvedValueOnce(makeTreeResponse(['src/app.ts']))
      .mockResolvedValueOnce(makeFileResponse(content))

    const result = await analyzeRepo('https://github.com/acme/heavy-rt', 'main')
    expect(result.compat_shim_coverage).toBeLessThan(0.5)
  })

  it('includes env_vars_to_add and env_vars_to_remove', async () => {
    mockFetch
      .mockResolvedValueOnce(makeTreeResponse(['src/index.ts']))
      .mockResolvedValueOnce(makeFileResponse('supabase.from("posts").select()'))

    const result = await analyzeRepo('https://github.com/acme/app', 'main')
    expect(result.env_vars_to_add).toContain('TERMINAL_AI_GATEWAY_URL')
    expect(result.env_vars_to_remove).toContain('SUPABASE_URL')
  })
})
