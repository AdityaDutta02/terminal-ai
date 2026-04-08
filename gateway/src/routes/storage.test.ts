import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

vi.mock('../middleware/auth.js', () => ({
  embedTokenAuth: vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set('embedToken', { appId: 'app-123', userId: 'u1', sessionId: 's1', creditsPerCall: 0, isFree: false, isAnon: false })
    await next()
  }),
}))
vi.mock('../services/minio.js', () => ({
  storageUpload: vi.fn(),
  storageGet: vi.fn(),
  storageList: vi.fn(),
  storageDelete: vi.fn(),
}))
vi.mock('../services/clamav.js', () => ({
  scanBuffer: vi.fn().mockResolvedValue({ clean: true }),
}))

import { storageUpload, storageGet, storageList, storageDelete } from '../services/minio.js'
import { scanBuffer } from '../services/clamav.js'
const mockUpload = vi.mocked(storageUpload)
const mockGet = vi.mocked(storageGet)
const mockList = vi.mocked(storageList)
const mockDelete = vi.mocked(storageDelete)
const mockScan = vi.mocked(scanBuffer)

async function makeRequest(method: string, path: string, body?: Buffer, headers?: Record<string, string>) {
  const { storageRouter } = await import('./storage.js')
  const app = new Hono()
  app.route('/storage', storageRouter)
  return app.request(`/storage${path}`, {
    method,
    headers: { Authorization: 'Bearer token', ...headers },
    body: body ?? undefined,
  })
}

beforeEach(() => vi.clearAllMocks())

describe('PUT /storage/:key — upload', () => {
  it('uploads a file and returns 201', async () => {
    mockUpload.mockResolvedValueOnce(undefined)
    const res = await makeRequest('PUT', '/report.pdf', Buffer.from('data'), {
      'Content-Type': 'application/pdf',
      'Content-Length': '4',
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ key: 'report.pdf', uploaded: true })
    expect(mockUpload).toHaveBeenCalledWith({ appId: 'app-123', key: 'report.pdf', buffer: expect.any(Buffer), contentType: 'application/pdf' })
  })
  it('returns 413 when Content-Length exceeds 50MB', async () => {
    const res = await makeRequest('PUT', '/big.bin', undefined, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(51 * 1024 * 1024),
    })
    expect(res.status).toBe(413)
    expect(mockUpload).not.toHaveBeenCalled()
  })
  it('returns 422 when virus scan fails', async () => {
    mockScan.mockResolvedValueOnce({ clean: false, virusName: 'EICAR' })
    const res = await makeRequest('PUT', '/virus.exe', Buffer.from('X'), {
      'Content-Type': 'application/octet-stream',
      'Content-Length': '1',
    })
    expect(res.status).toBe(422)
    expect(mockUpload).not.toHaveBeenCalled()
  })
})

describe('GET /storage — list', () => {
  it('returns file list', async () => {
    mockList.mockResolvedValueOnce([{ key: 'a.pdf', size: 100, lastModified: '2026-04-07T00:00:00Z' }])
    const res = await makeRequest('GET', '')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ key: 'a.pdf', size: 100, lastModified: '2026-04-07T00:00:00Z' }])
  })
})

describe('GET /storage/:key — download', () => {
  it('streams file bytes with correct content-type', async () => {
    mockGet.mockResolvedValueOnce({ buffer: Buffer.from('hello'), contentType: 'text/plain' })
    const res = await makeRequest('GET', '/hello.txt')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/plain')
    expect(await res.text()).toBe('hello')
  })
  it('returns 404 when file not found', async () => {
    mockGet.mockRejectedValueOnce(Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' }))
    const res = await makeRequest('GET', '/missing.txt')
    expect(res.status).toBe(404)
  })
})

describe('DELETE /storage/:key', () => {
  it('deletes file and returns { deleted: true }', async () => {
    mockDelete.mockResolvedValueOnce(undefined)
    const res = await makeRequest('DELETE', '/old.pdf')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: true })
  })
  it('returns 404 when file not found', async () => {
    mockDelete.mockRejectedValueOnce(Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' }))
    const res = await makeRequest('DELETE', '/missing.pdf')
    expect(res.status).toBe(404)
  })
})
