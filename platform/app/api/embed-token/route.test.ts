import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub env before module load so getSecret() does not throw in tests
vi.stubEnv('EMBED_TOKEN_SECRET', 'x'.repeat(32))

// Mock DB and auth
vi.mock('@/lib/db', () => ({
  db: {
    query: vi.fn(),
  },
}))
vi.mock('@/lib/auth', () => ({
  auth: {
    api: { getSession: vi.fn() },
  },
}))
vi.mock('@/lib/credits', () => ({
  deductCredits: vi.fn(),
}))
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}))
vi.mock('jose', () => {
  class MockSignJWT {
    setProtectedHeader() { return this }
    setIssuedAt() { return this }
    setExpirationTime() { return this }
    sign() { return Promise.resolve('mock.jwt.token') }
  }
  return { SignJWT: MockSignJWT }
})

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { deductCredits } from '@/lib/credits'
import { POST } from './route'
import { NextRequest } from 'next/server'

const mockDb = vi.mocked(db.query)
const mockAuth = vi.mocked(auth.api.getSession)
const mockDeduct = vi.mocked(deductCredits)

function makeRequest(body: object, authHeader?: string) {
  return new NextRequest('http://localhost/api/embed-token', {
    method: 'POST',
    headers: authHeader ? { Authorization: authHeader } : {},
    body: JSON.stringify(body),
  })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/embed-token', () => {
  it('returns 400 when appId missing', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user1' } } as any)
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 404 when app not found', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user1' } } as any)
    mockDb.mockResolvedValueOnce({ rows: [] } as any)  // app lookup
    const res = await POST(makeRequest({ appId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }))
    expect(res.status).toBe(404)
  })

  it('returns 402 when insufficient credits for paid app', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user1' } } as any)
    // App: paid, 4 credits/session
    mockDb.mockResolvedValueOnce({
      rows: [{ id: 'app1', credits_per_session: 4, is_free: false, is_superadmin_channel: false, creator_balance: 0 }],
    } as any)
    // Balance check
    mockDeduct.mockRejectedValueOnce(new Error('Insufficient credits'))
    const res = await POST(makeRequest({ appId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }))
    expect(res.status).toBe(402)
  })

  it('returns token when credits sufficient', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user1' } } as any)
    mockDb.mockResolvedValueOnce({
      rows: [{ id: 'app1', credits_per_session: 1, is_free: false, is_superadmin_channel: false, creator_balance: 0 }],
    } as any)
    mockDeduct.mockResolvedValueOnce(99)
    // Token insert
    mockDb.mockResolvedValueOnce({ rows: [] } as any)
    const res = await POST(makeRequest({ appId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.token).toBeDefined()
    expect(body.sessionId).toBeDefined()
  })
})
