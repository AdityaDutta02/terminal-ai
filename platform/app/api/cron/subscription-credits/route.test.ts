import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: { query: vi.fn() },
  withTransaction: vi.fn(),
}))
vi.mock('@/lib/credits', () => ({ grantCredits: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))

import { db, withTransaction } from '@/lib/db'
import { grantCredits } from '@/lib/credits'
import { GET } from './route'
import { NextRequest } from 'next/server'

const mockDb = vi.mocked(db.query)
const mockGrant = vi.mocked(grantCredits)
const mockWithTransaction = vi.mocked(withTransaction)

function makeRequest(token = 'test_secret') {
  return new NextRequest('http://localhost/api/cron/subscription-credits', {
    headers: { Authorization: `Bearer ${token}` },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'test_secret'
  // Default: withTransaction executes the callback with a mock client
  mockWithTransaction.mockImplementation(async (fn) => {
    const mockClient = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    return fn(mockClient)
  })
})

describe('GET /api/cron/subscription-credits', () => {
  it('returns 401 for missing/wrong secret', async () => {
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

  it('processes subscriptions and returns count', async () => {
    mockDb
      .mockResolvedValueOnce({ rows: [] } as any)  // INSERT cron_run
      .mockResolvedValueOnce({ rows: [{ pg_try_advisory_lock: true }] } as any)  // advisory lock
      .mockResolvedValueOnce({
        rows: [
          { user_id: 'u1', plan_id: 'starter', credits_per_month: 250, razorpay_subscription_id: 'sub_1' },
        ],
      } as any)  // SELECT subscriptions
      .mockResolvedValueOnce({ rows: [] } as any)  // UPDATE cron_run completed
      .mockResolvedValueOnce({ rows: [] } as any)  // advisory unlock

    mockGrant.mockResolvedValueOnce(250)

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.processed).toBe(1)
    expect(mockWithTransaction).toHaveBeenCalledOnce()
  })

  it('returns 500 and marks run failed if withTransaction throws', async () => {
    mockDb
      .mockResolvedValueOnce({ rows: [] } as any)  // INSERT cron_run
      .mockResolvedValueOnce({ rows: [{ pg_try_advisory_lock: true }] } as any)  // advisory lock
      .mockResolvedValueOnce({
        rows: [
          { user_id: 'u1', plan_id: 'starter', credits_per_month: 250, razorpay_subscription_id: 'sub_1' },
        ],
      } as any)  // SELECT subscriptions
      .mockResolvedValueOnce({ rows: [] } as any)  // UPDATE cron_run failed
      .mockResolvedValueOnce({ rows: [] } as any)  // advisory unlock

    // withTransaction propagates the error thrown by grantCredits
    mockWithTransaction.mockRejectedValueOnce(new Error('DB error'))

    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    expect(mockDb).toHaveBeenCalledWith(
      expect.stringContaining("status = 'failed'"),
      expect.arrayContaining([expect.anything()]),
    )
  })
})
