import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: { query: vi.fn() } }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/pricing', () => ({
  PLANS: {
    starter: { priceInr: 149, credits: 250, name: 'Starter', razorpayPlanId: 'plan_starter_test' },
    creator: { priceInr: 299, credits: 650, name: 'Creator', razorpayPlanId: 'plan_creator_test' },
    pro:     { priceInr: 599, credits: 1400, name: 'Pro',     razorpayPlanId: 'plan_pro_test' },
  },
}))

// Mock global fetch used by createSubscription / cancelSubscription helpers
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { GET, POST, DELETE } from './route'
import { NextRequest } from 'next/server'

const mockDb = vi.mocked(db.query)
const mockAuth = vi.mocked(auth.api.getSession)

beforeEach(() => {
  vi.clearAllMocks()
  process.env.RAZORPAY_KEY_ID = 'test_key_id'
  process.env.RAZORPAY_KEY_SECRET = 'test_key_secret'
})

describe('GET /api/subscriptions', () => {
  it('returns 401 when not logged in', async () => {
    mockAuth.mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/subscriptions')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns subscription status for logged in user', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user1' } } as any)
    mockDb.mockResolvedValueOnce({
      rows: [{ plan_id: 'starter', status: 'active', current_period_end: '2026-04-30' }],
    } as any)
    const req = new NextRequest('http://localhost/api/subscriptions')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.subscription.plan_id).toBe('starter')
  })
})

describe('POST /api/subscriptions', () => {
  it('returns 400 for invalid plan', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user1' } } as any)
    const req = new NextRequest('http://localhost/api/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ planId: 'invalid_plan' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('creates subscription successfully', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user1' } } as any)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'sub_abc123', short_url: 'https://rzp.io/l/abc' }),
    } as any)
    mockDb.mockResolvedValueOnce({ rows: [] } as any)

    const req = new NextRequest('http://localhost/api/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ planId: 'starter' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.subscriptionId).toBe('sub_abc123')
    expect(body.shortUrl).toBe('https://rzp.io/l/abc')
  })
})

describe('DELETE /api/subscriptions', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/subscriptions', { method: 'DELETE' })
    const res = await DELETE(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('DELETE returns 500 when Razorpay cancel succeeds but DB update fails', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'user-1' } } as any)
    // First db.query: SELECT returns a subscription
    mockDb.mockResolvedValueOnce({
      rows: [{ razorpay_subscription_id: 'sub_test_123', status: 'active' }],
    } as any)
    // Razorpay cancel succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'sub_test_123', status: 'cancelled' }),
    } as any)
    // Second db.query: UPDATE throws
    mockDb.mockRejectedValueOnce(new Error('DB connection lost'))

    const req = new NextRequest('http://localhost/api/subscriptions', { method: 'DELETE' })
    const res = await DELETE(req)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/local state update failed/i)
  })
})
