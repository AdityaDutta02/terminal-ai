import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

vi.mock('../db.js', () => ({ db: { query: vi.fn() } }))
vi.mock('../lib/logger.js', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))
vi.mock('../services/minio.js', () => ({
  storageUpload: vi.fn(),
  storageGet: vi.fn(),
  storageList: vi.fn(),
  storageDelete: vi.fn(),
}))
vi.mock('../lib/db-validator.js', () => ({
  validateTable: vi.fn(),
  validateColumns: vi.fn(),
  toSchemaName: vi.fn((appId: string) => `app_data_${appId.replace(/-/g, '_')}`),
  assertIdentifier: vi.fn(),
  ValidationError: class ValidationError extends Error {
    constructor(public status: number, message: string) { super(message) }
  },
}))

import { db } from '../db.js'
import { storageUpload, storageGet, storageList, storageDelete } from '../services/minio.js'
import { validateTable, validateColumns } from '../lib/db-validator.js'
import { compatSupabaseRouter } from './compat-supabase.js'

function makeApp() {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('embedToken', {
      appId: 'app-abc',
      userId: 'user-1',
      sessionId: 'sess-1',
      isAnon: false,
      isFree: false,
      creditsPerCall: 1,
    })
    await next()
  })
  app.route('/compat/supabase', compatSupabaseRouter)
  return app
}

describe('GET /auth/v1/user', () => {
  it('returns synthetic user from embed token', async () => {
    const res = await makeApp().request('/compat/supabase/auth/v1/user')
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.id).toBe('user-1')
    expect(body.email).toBeNull()
    expect(body.role).toBe('authenticated')
    expect(body.is_anonymous).toBe(false)
  })

  it('uses sessionId when userId is null', async () => {
    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('embedToken', { appId: 'app-abc', userId: null, sessionId: 'sess-anon', isAnon: true, isFree: false, creditsPerCall: 1 })
      await next()
    })
    app.route('/compat/supabase', compatSupabaseRouter)
    const res = await app.request('/compat/supabase/auth/v1/user')
    const body = await res.json() as Record<string, unknown>
    expect(body.id).toBe('sess-anon')
    expect(body.is_anonymous).toBe(true)
  })
})

describe('POST /auth/v1/token (signIn no-op)', () => {
  it('returns 200', async () => {
    const res = await makeApp().request('/compat/supabase/auth/v1/token', { method: 'POST' })
    expect(res.status).toBe(200)
  })
})

describe('POST /auth/v1/logout (signOut no-op)', () => {
  it('returns 200', async () => {
    const res = await makeApp().request('/compat/supabase/auth/v1/logout', { method: 'POST' })
    expect(res.status).toBe(200)
  })
})

describe('GET /rest/v1/ (introspection block)', () => {
  it('returns 404', async () => {
    const res = await makeApp().request('/compat/supabase/rest/v1/')
    expect(res.status).toBe(404)
  })
})

describe('GET /rest/v1/:table', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(validateTable).mockResolvedValue(undefined)
    vi.mocked(validateColumns).mockResolvedValue(undefined)
    vi.mocked(db.query).mockResolvedValue({ rows: [{ id: '1', name: 'Alice' }] } as never)
  })

  it('returns rows for valid table', async () => {
    const res = await makeApp().request('/compat/supabase/rest/v1/profiles?select=*')
    expect(res.status).toBe(200)
    const body = await res.json() as unknown[]
    expect(Array.isArray(body)).toBe(true)
  })

  it('filters with eq param', async () => {
    const res = await makeApp().request('/compat/supabase/rest/v1/profiles?status=eq.active')
    expect(res.status).toBe(200)
    const call = vi.mocked(db.query).mock.calls[0]
    expect(call[0]).toContain('WHERE')
    expect(call[1]).toContain('active')
  })

  it('returns 400 on unsupported operator', async () => {
    const res = await makeApp().request('/compat/supabase/rest/v1/profiles?x=contains.foo')
    expect(res.status).toBe(400)
  })
})

describe('POST /rest/v1/:table (insert)', () => {
  beforeEach(() => {
    vi.mocked(validateTable).mockResolvedValue(undefined)
    vi.mocked(db.query).mockResolvedValue({ rows: [{ id: '2' }] } as never)
  })

  it('inserts and returns row', async () => {
    const res = await makeApp().request('/compat/supabase/rest/v1/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Hello' }),
    })
    expect(res.status).toBe(201)
  })
})

describe('Storage routes', () => {
  it('PUT uploads file', async () => {
    vi.mocked(storageUpload).mockResolvedValue(undefined)
    const res = await makeApp().request('/compat/supabase/storage/v1/object/avatars/img.png', {
      method: 'PUT',
      body: new Uint8Array([1, 2, 3]),
      headers: { 'Content-Type': 'image/png' },
    })
    expect(res.status).toBe(200)
    expect(storageUpload).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'avatars/img.png', appId: 'app-abc' })
    )
  })

  it('GET retrieves file', async () => {
    vi.mocked(storageGet).mockResolvedValue({ buffer: Buffer.from([1, 2, 3]), contentType: 'application/octet-stream' } as never)
    const res = await makeApp().request('/compat/supabase/storage/v1/object/avatars/img.png')
    expect(res.status).toBe(200)
  })

  it('GET list returns array', async () => {
    vi.mocked(storageList).mockResolvedValue([{ key: 'avatars/img.png', size: 3, lastModified: '' }] as never)
    const res = await makeApp().request('/compat/supabase/storage/v1/object/list/avatars')
    expect(res.status).toBe(200)
    const body = await res.json() as unknown[]
    expect(Array.isArray(body)).toBe(true)
  })

  it('DELETE removes file', async () => {
    vi.mocked(storageDelete).mockResolvedValue(undefined)
    const res = await makeApp().request('/compat/supabase/storage/v1/object/avatars/img.png', {
      method: 'DELETE',
    })
    expect(res.status).toBe(200)
  })
})

describe('Cross-app table access prevention', () => {
  it('returns 403 when validateTable throws ValidationError with status 403', async () => {
    const { ValidationError } = await import('../lib/db-validator.js')
    vi.mocked(validateTable).mockRejectedValue(new ValidationError(403, 'Table not in app schema'))
    const res = await makeApp().request('/compat/supabase/rest/v1/other_app_table')
    expect(res.status).toBe(403)
  })
})
