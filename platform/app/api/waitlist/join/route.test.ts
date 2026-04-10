import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  db: {
    query: vi.fn(),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock('@/lib/email', () => ({
  sendWaitlistConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}))

import { db } from '@/lib/db'
import { sendWaitlistConfirmationEmail } from '@/lib/email'
import { POST } from './route'

const mockDb = db as { query: ReturnType<typeof vi.fn> }

function makeRequest(body: unknown, ip = '1.2.3.4'): NextRequest {
  return new NextRequest('http://localhost/api/waitlist/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}

describe('POST /api/waitlist/join', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 for invalid email', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email' }))
    expect(res.status).toBe(400)
    const data = await res.json() as { error: string }
    expect(data.error).toBe('Invalid email address')
  })

  it('returns 400 for missing email', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('inserts email and returns joined:true for new signup', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'uuid-123' }] })
    const res = await POST(makeRequest({ email: 'test@example.com' }))
    expect(res.status).toBe(200)
    const data = await res.json() as { joined: boolean }
    expect(data.joined).toBe(true)
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO platform.waitlist'),
      ['test@example.com', null],
    )
  })

  it('returns joined:true even for duplicate email (no enumeration)', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }) // ON CONFLICT DO NOTHING
    const res = await POST(makeRequest({ email: 'existing@example.com' }))
    expect(res.status).toBe(200)
    const data = await res.json() as { joined: boolean }
    expect(data.joined).toBe(true)
  })

  it('sends confirmation email only for new signups', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'uuid-456' }] })
    await POST(makeRequest({ email: 'new@example.com' }))
    // Give fire-and-forget a tick to run
    await new Promise((r) => setTimeout(r, 10))
    expect(sendWaitlistConfirmationEmail).toHaveBeenCalledWith('new@example.com')
  })

  it('does not send email for duplicate signup', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] })
    await POST(makeRequest({ email: 'dup@example.com' }))
    await new Promise((r) => setTimeout(r, 10))
    expect(sendWaitlistConfirmationEmail).not.toHaveBeenCalled()
  })
})
