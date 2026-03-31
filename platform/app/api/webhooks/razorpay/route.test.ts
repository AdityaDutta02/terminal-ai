import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: { query: vi.fn() },
  withTransaction: vi.fn(),
}))
vi.mock('@/lib/credits', () => ({ grantCredits: vi.fn() }))

import { db, withTransaction } from '@/lib/db'
import { grantCredits } from '@/lib/credits'
import { POST } from './route'
import { NextRequest } from 'next/server'
import crypto from 'crypto'

const mockDb = vi.mocked(db.query)
const mockWithTransaction = vi.mocked(withTransaction)
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
    const mockClient = { query: vi.fn() }

    mockWithTransaction.mockImplementationOnce(async (fn) => {
      return fn(mockClient as any)
    })

    mockClient.query
      .mockResolvedValueOnce({ rows: [{ user_id: 'user1', credits: 100, pack_id: 'pack_100' }] })  // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [] })  // UPDATE status

    mockGrant.mockResolvedValueOnce(120)

    const res = await POST(makeWebhookRequest({
      event: 'payment.captured',
      payload: {
        payment: { entity: { id: 'pay_123', order_id: 'order_abc', status: 'captured' } },
      },
    }))
    expect(res.status).toBe(200)
    expect(mockGrant).toHaveBeenCalledWith('user1', 100, 'credit_pack_pack_100', mockClient)
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'completed'"),
      expect.arrayContaining(['pay_123', 'order_abc']),
    )
  })

  it('grants credits on subscription.charged', async () => {
    const mockClient = { query: vi.fn() }

    mockWithTransaction.mockImplementationOnce(async (fn) => {
      return fn(mockClient as any)
    })

    mockClient.query
      .mockResolvedValueOnce({ rows: [{ user_id: 'user1', plan_id: 'starter', credits_per_month: 250 }] })  // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [] })  // UPDATE period

    mockGrant.mockResolvedValueOnce(370)

    const res = await POST(makeWebhookRequest({
      event: 'subscription.charged',
      payload: {
        subscription: { entity: { id: 'sub_123', current_start: 1743379200, current_end: 1746057600 } },
        payment: { entity: { id: 'pay_456', status: 'captured' } },
      },
    }))
    expect(res.status).toBe(200)
    expect(mockGrant).toHaveBeenCalledWith('user1', 250, 'subscription_renewal_starter', mockClient)
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('current_period_start'),
      expect.arrayContaining(['sub_123']),
    )
  })

  it('returns 400 for invalid signature', async () => {
    const body = JSON.stringify({ event: 'payment.captured', payload: {} })
    const req = new NextRequest('http://localhost/api/webhooks/razorpay', {
      method: 'POST',
      headers: { 'x-razorpay-signature': 'bad_signature' },
      body,
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid signature')
  })

  it('is a no-op for payment.captured when no pending pack found', async () => {
    const mockClient = { query: vi.fn() }

    mockWithTransaction.mockImplementationOnce(async (fn) => {
      return fn(mockClient as any)
    })

    mockClient.query.mockResolvedValueOnce({ rows: [] })  // SELECT FOR UPDATE — no row

    const res = await POST(makeWebhookRequest({
      event: 'payment.captured',
      payload: {
        payment: { entity: { id: 'pay_123', order_id: 'order_abc', status: 'captured' } },
      },
    }))
    expect(res.status).toBe(200)
    expect(mockGrant).not.toHaveBeenCalled()
    // Only the SELECT was called; no UPDATE
    expect(mockClient.query).toHaveBeenCalledTimes(1)
  })

  it('does not call withTransaction for non-captured payment status', async () => {
    const res = await POST(makeWebhookRequest({
      event: 'payment.captured',
      payload: {
        payment: { entity: { id: 'pay_123', order_id: 'order_abc', status: 'failed' } },
      },
    }))
    expect(res.status).toBe(200)
    expect(mockWithTransaction).not.toHaveBeenCalled()
    expect(mockGrant).not.toHaveBeenCalled()
  })

  it('cancels subscription on subscription.cancelled', async () => {
    mockDb.mockResolvedValueOnce({ rows: [] } as any)

    const res = await POST(makeWebhookRequest({
      event: 'subscription.cancelled',
      payload: {
        subscription: { entity: { id: 'sub_123' } },
      },
    }))
    expect(res.status).toBe(200)
    expect(mockDb).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'cancelled'"),
      ['sub_123'],
    )
  })

  it('pauses subscription on subscription.halted', async () => {
    mockDb.mockResolvedValueOnce({ rows: [] } as any)

    const res = await POST(makeWebhookRequest({
      event: 'subscription.halted',
      payload: {
        subscription: { entity: { id: 'sub_456' } },
      },
    }))
    expect(res.status).toBe(200)
    expect(mockDb).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'paused'"),
      ['sub_456'],
    )
  })
})
