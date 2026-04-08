import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

vi.mock('../db.js', () => ({ db: { query: vi.fn() } }))
vi.mock('../middleware/auth.js', () => ({
  embedTokenAuth: vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set('embedToken', { appId: '550e8400-e29b-41d4-a716-446655440000', userId: 'u1', sessionId: 's1', creditsPerCall: 0, isFree: false, isAnon: false })
    await next()
  }),
}))
vi.mock('../lib/db-validator.js', () => ({
  toSchemaName: (id: string) => `app_data_${id.replaceAll('-', '_')}`,
  validateTable: vi.fn(),
  validateColumns: vi.fn(),
  ValidationError: class ValidationError extends Error {
    constructor(public status: number, message: string) { super(message) }
  },
}))

import { db } from '../db.js'
import { validateTable, validateColumns, ValidationError } from '../lib/db-validator.js'
const mockDb = vi.mocked(db)
const mockValidateTable = vi.mocked(validateTable)
const mockValidateColumns = vi.mocked(validateColumns)

const SCHEMA = 'app_data_550e8400_e29b_41d4_a716_446655440000'

async function makeRequest(method: string, path: string, body?: unknown) {
  const { dbRouter } = await import('./db.js')
  const app = new Hono()
  app.route('/db', dbRouter)
  return app.request(`/db${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockValidateTable.mockResolvedValue(undefined)
  mockValidateColumns.mockResolvedValue(undefined)
})

describe('GET /db/:table', () => {
  it('returns rows from the app schema', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: '1', name: 'foo' }] } as never)
    const res = await makeRequest('GET', '/items')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ id: '1', name: 'foo' }])
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining(SCHEMA),
      [],
    )
  })
  it('returns 404 when table not found', async () => {
    mockValidateTable.mockRejectedValueOnce(new ValidationError(404, "Table 'ghost' not found"))
    const res = await makeRequest('GET', '/ghost')
    expect(res.status).toBe(404)
    expect((await res.json() as { error: string }).error).toBe("Table 'ghost' not found")
  })
})

describe('GET /db/:table/:id', () => {
  it('returns a single row', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'abc' }] } as never)
    const res = await makeRequest('GET', '/items/abc')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'abc' })
  })
  it('returns 404 when row not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] } as never)
    const res = await makeRequest('GET', '/items/missing')
    expect(res.status).toBe(404)
  })
})

describe('POST /db/:table', () => {
  it('inserts a row and returns it', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'new', name: 'bar' }] } as never)
    const res = await makeRequest('POST', '/items', { name: 'bar' })
    expect(res.status).toBe(201)
    expect((await res.json() as { name: string }).name).toBe('bar')
  })
  it('returns 400 for unknown column', async () => {
    mockValidateColumns.mockRejectedValueOnce(new ValidationError(400, "Unknown column: 'evil'"))
    const res = await makeRequest('POST', '/items', { evil: 'x' })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /db/:table/:id', () => {
  it('updates a row and returns it', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'abc', name: 'updated' }] } as never)
    const res = await makeRequest('PATCH', '/items/abc', { name: 'updated' })
    expect(res.status).toBe(200)
    expect((await res.json() as { name: string }).name).toBe('updated')
  })
  it('returns 400 when body is empty', async () => {
    const res = await makeRequest('PATCH', '/items/abc', {})
    expect(res.status).toBe(400)
  })
  it('returns 404 when row not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] } as never)
    const res = await makeRequest('PATCH', '/items/missing', { name: 'x' })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /db/:table/:id', () => {
  it('deletes a row and returns { deleted: true }', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'abc' }] } as never)
    const res = await makeRequest('DELETE', '/items/abc')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: true })
  })
  it('returns 404 when row not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] } as never)
    const res = await makeRequest('DELETE', '/items/missing')
    expect(res.status).toBe(404)
  })
})
