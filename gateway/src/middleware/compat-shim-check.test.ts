import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

// Mock db module
vi.mock('../db', () => ({
  db: { query: vi.fn() },
}))
// Mock logger
vi.mock('../lib/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

import { db } from '../db'
import { compatShimCheck } from './compat-shim-check'

function makeApp(shimEnabled: boolean | null) {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('embedToken', { appId: 'app-123', userId: 'u1', sessionId: 's1', isAnon: false, isFree: false, creditsPerCall: 1 })
    await next()
  })
  app.use('*', compatShimCheck)
  app.get('/test', (c) => c.json({ ok: true }))

  vi.mocked(db.query).mockResolvedValue({
    rows: shimEnabled === null ? [] : [{ compat_shim_enabled: shimEnabled }],
    rowCount: shimEnabled === null ? 0 : 1,
    command: '',
    oid: 0,
    fields: [],
  } as never)

  return app
}

describe('compatShimCheck', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes when compat_shim_enabled = true', async () => {
    const app = makeApp(true)
    const res = await app.request('/test')
    expect(res.status).toBe(200)
  })

  it('returns 404 when compat_shim_enabled = false', async () => {
    const app = makeApp(false)
    const res = await app.request('/test')
    expect(res.status).toBe(404)
  })

  it('returns 404 when app row not found', async () => {
    const app = makeApp(null)
    const res = await app.request('/test')
    expect(res.status).toBe(404)
  })

  it('rejects service_role token with 403', async () => {
    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('embedToken', { appId: 'app-123', userId: 'u1', sessionId: 's1', isAnon: false, isFree: false, creditsPerCall: 1, role: 'service_role' })
      await next()
    })
    app.use('*', compatShimCheck)
    app.get('/test', (c) => c.json({ ok: true }))
    vi.mocked(db.query).mockResolvedValue({ rows: [{ compat_shim_enabled: true }] } as never)
    const res = await app.request('/test')
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('service role')
  })
})
