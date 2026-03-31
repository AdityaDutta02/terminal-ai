import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: { query: vi.fn() } }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { GET, POST } from './route'
import { NextRequest } from 'next/server'

const mockDb = vi.mocked(db.query)
const mockAuth = vi.mocked(auth.api.getSession)

beforeEach(() => vi.clearAllMocks())

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
})
