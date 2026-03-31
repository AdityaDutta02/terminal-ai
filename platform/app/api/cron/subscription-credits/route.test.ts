import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: { query: vi.fn() } }))
vi.mock('@/lib/credits', () => ({ grantCredits: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))

import { db } from '@/lib/db'
import { grantCredits } from '@/lib/credits'
import { GET } from './route'
import { NextRequest } from 'next/server'

const mockDb = vi.mocked(db.query)
const mockGrant = vi.mocked(grantCredits)

function makeRequest(token = 'test_secret') {
  return new NextRequest('http://localhost/api/cron/subscription-credits', {
    headers: { Authorization: `Bearer ${token}` },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'test_secret'
})

describe('GET /api/cron/subscription-credits', () => {
  it('returns 401 for missing/wrong secret', async () => {
    const res = await GET(makeRequest('wrong'))
    expect(res.status).toBe(401)
  })

  it('processes subscriptions and returns count', async () => {
    mockDb
      .mockResolvedValueOnce({ rows: [] } as any)  // INSERT cron_run
      .mockResolvedValueOnce({
        rows: [
          { user_id: 'u1', plan_id: 'starter', credits_per_month: 250, razorpay_subscription_id: 'sub_1' },
        ],
      } as any)  // SELECT subscriptions
      .mockResolvedValueOnce({ rows: [] } as any)  // UPDATE credits_granted_at
      .mockResolvedValueOnce({ rows: [] } as any)  // UPDATE cron_run completed

    mockGrant.mockResolvedValueOnce(250)

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.processed).toBe(1)
    expect(mockGrant).toHaveBeenCalledWith('u1', 250, 'subscription_renewal_starter')
  })
})
