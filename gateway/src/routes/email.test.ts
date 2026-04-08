import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { emailRouter } from './email'

// Mock db
vi.mock('../db', () => ({
  db: {
    query: vi.fn(),
  },
}))

// Mock email provider
vi.mock('../services/email-provider', () => ({
  ResendEmailProvider: class MockResend {
    send = vi.fn().mockResolvedValue({ messageId: 'msg-test-123' })
  },
}))

// Mock rate-limit Redis check
vi.mock('../lib/email-rate-limit', () => ({
  checkEmailRateLimit: vi.fn().mockResolvedValue(true),
}))

import { db } from '../db'

const mockQuery = db.query as ReturnType<typeof vi.fn>

// Helper: create a test app with mocked auth
function createTestApp(tokenPayload: Record<string, unknown>) {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('embedToken', {
      userId: 'user-1',
      appId: 'app-1',
      sessionId: 'sess-1',
      creditsPerCall: 1,
      isFree: false,
      isAnon: false,
      ...tokenPayload,
    })
    await next()
  })
  app.route('/email', emailRouter)
  return app
}

describe('POST /email/send', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends email when recipient matches user email', async () => {
    const app = createTestApp({})
    // Mock: user email lookup
    mockQuery.mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] })
    // Mock: credit balance check
    mockQuery.mockResolvedValueOnce({ rows: [{ balance: 10 }] })
    // Mock: credit deduction
    mockQuery.mockResolvedValueOnce({ rows: [] })
    // Mock: audit log insert
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const res = await app.request('/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'user@example.com',
        subject: 'Test Report',
        html: '<p>Hello</p>',
      }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sent).toBe(true)
    expect(body.messageId).toBe('msg-test-123')
  })

  it('rejects when recipient does not match user email', async () => {
    const app = createTestApp({})
    // Mock: user email lookup returns different email
    mockQuery.mockResolvedValueOnce({ rows: [{ email: 'real@example.com' }] })

    const res = await app.request('/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'someone-else@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
      }),
    })

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toContain('authenticated user')
  })

  it('returns 402 when insufficient credits', async () => {
    const app = createTestApp({})
    // Mock: user email lookup
    mockQuery.mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] })
    // Mock: credit balance = 0
    mockQuery.mockResolvedValueOnce({ rows: [{ balance: 0 }] })

    const res = await app.request('/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
      }),
    })

    expect(res.status).toBe(402)
  })

  it('returns 400 when required fields missing', async () => {
    const app = createTestApp({})

    const res = await app.request('/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: 'user@example.com' }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('subject')
  })

  it('skips credit deduction for free apps', async () => {
    const app = createTestApp({ isFree: true })
    // Mock: user email lookup
    mockQuery.mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] })
    // Mock: audit log insert (no credit queries)
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const res = await app.request('/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'user@example.com',
        subject: 'Free Report',
        html: '<p>Free</p>',
      }),
    })

    expect(res.status).toBe(200)
  })
})
