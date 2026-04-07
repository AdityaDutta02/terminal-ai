import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('ensureIndex', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.resetModules()
    process.env.MEILISEARCH_URL = 'http://localhost:7700'
    process.env.MEILI_MASTER_KEY = 'test-key'
  })

  it('creates index and configures settings when index does not exist', async () => {
    // GET /indexes/apps → 404 (index missing)
    mockFetch
      .mockResolvedValueOnce({ status: 404, ok: false })             // GET check
      .mockResolvedValueOnce({ ok: true, text: async () => '' })     // POST create
      .mockResolvedValueOnce({ ok: true })                           // PATCH settings

    const { ensureIndex } = await import('./search')
    await expect(ensureIndex()).resolves.toBeUndefined()
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('does nothing when index already exists', async () => {
    mockFetch.mockResolvedValueOnce({ status: 200, ok: true })  // GET check — exists

    const { ensureIndex } = await import('./search')
    await expect(ensureIndex()).resolves.toBeUndefined()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('throws when index creation POST fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ status: 404, ok: false })                      // GET check
      .mockResolvedValueOnce({ ok: false, text: async () => 'Unauthorized' }) // POST fails

    const { ensureIndex } = await import('./search')
    await expect(ensureIndex()).rejects.toThrow('Meilisearch create index error: Unauthorized')
  })
})
