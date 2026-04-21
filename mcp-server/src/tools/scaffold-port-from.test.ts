import { describe, it, expect } from 'vitest'
import { buildPortFromFiles } from './scaffold'

describe('buildPortFromFiles', () => {
  it('generates supabase-compat.ts with gateway URL usage', () => {
    const files = buildPortFromFiles({ provider: 'supabase', detectedTables: ['posts', 'profiles'] })
    const compatFile = files.find((f) => f.path === 'lib/supabase-compat.ts')
    expect(compatFile).toBeDefined()
    expect(compatFile!.content).toContain('TERMINAL_AI_GATEWAY_URL')
    expect(compatFile!.content).toContain('/compat/supabase')
  })

  it('generates use-supabase-session.ts hook', () => {
    const files = buildPortFromFiles({ provider: 'supabase', detectedTables: [] })
    const hookFile = files.find((f) => f.path === 'hooks/use-supabase-session.ts')
    expect(hookFile).toBeDefined()
    expect(hookFile!.content).toContain('useEmbedToken')
    expect(hookFile!.content).toContain('initSupabaseSession')
  })

  it('generates db-migrations.sql with CREATE TABLE stubs for each detected table', () => {
    const files = buildPortFromFiles({ provider: 'supabase', detectedTables: ['posts', 'profiles'] })
    const migFile = files.find((f) => f.path === 'db-migrations.sql')
    expect(migFile).toBeDefined()
    expect(migFile!.content).toContain('posts')
    expect(migFile!.content).toContain('profiles')
    expect(migFile!.content).toContain('CREATE TABLE IF NOT EXISTS')
  })

  it('generates PORTING.md with env var swap instructions', () => {
    const files = buildPortFromFiles({ provider: 'supabase', detectedTables: ['posts'] })
    const portingMd = files.find((f) => f.path === 'PORTING.md')
    expect(portingMd).toBeDefined()
    expect(portingMd!.content).toContain('NEXT_PUBLIC_SUPABASE_URL')
    expect(portingMd!.content).toContain('TERMINAL_AI_GATEWAY_URL')
    expect(portingMd!.content).toContain('RLS')
  })
})
