import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: { query: vi.fn() } }))
vi.mock('@/lib/credits', () => ({ grantCredits: vi.fn() }))

import { db } from '@/lib/db'
import { grantCredits } from '@/lib/credits'
import { POST } from './route'
import { NextRequest } from 'next/server'
import crypto from 'crypto'

const mockDb = vi.mocked(db.query)
const mockGrant = vi.mocked(grantCredits)

function makeWebhookRequest(event: object, secret = 'test_secret') {
  const body = JSON.stringify(event)
  const signature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex')
  return new NextRequest('http://localhost/api/webhooks/razorpay', {
    method: 'POST',
    headers: { 'x-razorpay-signature': signature },
    body,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.RAZORPAY_WEBHOOK_SECRET = 'test_secret'
})

describe('POST /api/webhooks/razorpay', () => {
  it('grants credits on payment.captured for credit pack', async () => {
    mockDb.mockResolvedValueOnce({
      rows: [{ user_id: 'user1', credits: 100, pack_id: 'pack_100' }],
    } as any)
    mockDb.mockResolvedValueOnce({ rows: [] } as any)  // update status
    mockGrant.mockResolvedValueOnce(120)

    const res = await POST(makeWebhookRequest({
      event: 'payment.captured',
      payload: {
        payment: { entity: { id: 'pay_123', order_id: 'order_abc', status: 'captured' } },
      },
    }))
    expect(res.status).toBe(200)
    expect(mockGrant).toHaveBeenCalledWith('user1', 100, 'credit_pack_pack_100')
  })

  it('grants credits on subscription.charged', async () => {
    mockDb.mockResolvedValueOnce({
      rows: [{ user_id: 'user1', plan_id: 'starter', credits_per_month: 250 }],
    } as any)
    mockDb.mockResolvedValueOnce({ rows: [] } as any)  // update subscription
    mockGrant.mockResolvedValueOnce(370)

    const res = await POST(makeWebhookRequest({
      event: 'subscription.charged',
      payload: {
        subscription: { entity: { id: 'sub_123', current_start: 1743379200, current_end: 1746057600 } },
        payment: { entity: { id: 'pay_456', status: 'captured' } },
      },
    }))
    expect(res.status).toBe(200)
    expect(mockGrant).toHaveBeenCalledWith('user1', 250, 'subscription_renewal_starter')
  })
})
