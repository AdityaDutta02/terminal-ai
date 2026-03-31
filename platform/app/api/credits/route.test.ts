import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: { query: vi.fn() } }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/credits', () => ({ getBalance: vi.fn() }))
vi.mock('@/lib/razorpay', () => ({ createOrder: vi.fn() }))

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { getBalance } from '@/lib/credits'
import { createOrder } from '@/lib/razorpay'
import { GET, POST } from './route'
import { NextRequest } from 'next/server'

const mockDb = vi.mocked(db.query)
const mockAuth = vi.mocked(auth.api.getSession)
const mockGetBalance = vi.mocked(getBalance)
const mockCreateOrder = vi.mocked(createOrder)

beforeEach(() => vi.clearAllMocks())

describe('GET /api/credits', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/credits')
    const res = await GET(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns balance and ledger entries when authenticated', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user1' } } as any)
    mockGetBalance.mockResolvedValue(150)
    mockDb.mockResolvedValueOnce({
      rows: [
        { delta: -1, balance_after: 149, reason: 'api_call', created_at: '2026-03-31T00:00:00Z' },
        { delta: 100, balance_after: 150, reason: 'purchase', created_at: '2026-03-30T00:00:00Z' },
      ],
    } as any)

    const req = new NextRequest('http://localhost/api/credits')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.balance).toBe(150)
    expect(body.history).toHaveLength(2)
    expect(body.history[0].reason).toBe('api_call')
  })
})

describe('POST /api/credits', () => {
  const originalKeyId = process.env.RAZORPAY_KEY_ID

  afterEach(() => {
    if (originalKeyId !== undefined) {
      process.env.RAZORPAY_KEY_ID = originalKeyId
    } else {
      delete process.env.RAZORPAY_KEY_ID
    }
  })

  it('returns 503 when RAZORPAY_KEY_ID is not set', async () => {
    delete process.env.RAZORPAY_KEY_ID

    const req = new NextRequest('http://localhost/api/credits', {
      method: 'POST',
      body: JSON.stringify({ packId: 'pack_100' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('Payment not configured')
  })

  it('returns 400 for invalid pack ID', async () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key'
    mockAuth.mockResolvedValue({ user: { id: 'user1' } } as any)

    const req = new NextRequest('http://localhost/api/credits', {
      method: 'POST',
      body: JSON.stringify({ packId: 'pack_invalid' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid pack')
  })

  it('creates order and returns keyId from env when all valid', async () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key'
    mockAuth.mockResolvedValue({ user: { id: 'user1' } } as any)
    mockCreateOrder.mockResolvedValue({ id: 'order_abc123' } as any)
    mockDb.mockResolvedValueOnce({ rows: [] } as any)

    const req = new NextRequest('http://localhost/api/credits', {
      method: 'POST',
      body: JSON.stringify({ packId: 'pack_100' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.orderId).toBe('order_abc123')
    expect(body.keyId).toBe('rzp_test_key')
  })
})
