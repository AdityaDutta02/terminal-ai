import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: { query: vi.fn() } }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))

import { db } from '@/lib/db'
import { GET } from './route'
import { NextRequest } from 'next/server'

const mockDb = vi.mocked(db.query)

function makeRequest(token = 'test_secret') {
  return new NextRequest('http://localhost/api/cron/creator-revenue', {
    headers: { Authorization: `Bearer ${token}` },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'test_secret'
})

describe('GET /api/cron/creator-revenue', () => {
  it('returns 401 for wrong secret', async () => {
    const res = await GET(makeRequest('wrong'))
    expect(res.status).toBe(401)
  })

  it('returns skipped when advisory lock cannot be acquired', async () => {
    mockDb
      .mockResolvedValueOnce({ rows: [] } as any)  // INSERT cron_run
      .mockResolvedValueOnce({ rows: [{ pg_try_advisory_lock: false }] } as any)  // advisory lock

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skipped).toBe(true)
  })

  it('updates creator balances and returns count', async () => {
    mockDb
      .mockResolvedValueOnce({ rows: [] } as any)  // INSERT cron_run
      .mockResolvedValueOnce({ rows: [{ pg_try_advisory_lock: true }] } as any)  // advisory lock
      .mockResolvedValueOnce({
        rows: [{ channel_id: 'ch_1', credits_spent: 200 }],
      } as any)  // SELECT channel revenue
      .mockResolvedValueOnce({ rows: [] } as any)  // UPDATE creator_balance
      .mockResolvedValueOnce({ rows: [] } as any)  // UPDATE cron_run completed
      .mockResolvedValueOnce({ rows: [] } as any)  // advisory unlock

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.channels_updated).toBe(1)
    // Verify creator share (50% of 200 = 100)
    expect(mockDb).toHaveBeenCalledWith(
      expect.stringContaining('creator_balance = creator_balance + $1'),
      [100, 'ch_1'],
    )
  })

  it('skips channels where creator share rounds to zero', async () => {
    mockDb
      .mockResolvedValueOnce({ rows: [] } as any)  // INSERT cron_run
      .mockResolvedValueOnce({ rows: [{ pg_try_advisory_lock: true }] } as any)  // advisory lock
      .mockResolvedValueOnce({
        rows: [{ channel_id: 'ch_1', credits_spent: 1 }],  // floor(1 * 0.5) = 0
      } as any)  // SELECT channel revenue
      .mockResolvedValueOnce({ rows: [] } as any)  // UPDATE cron_run completed
      .mockResolvedValueOnce({ rows: [] } as any)  // advisory unlock

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.channels_updated).toBe(0)
  })
})
