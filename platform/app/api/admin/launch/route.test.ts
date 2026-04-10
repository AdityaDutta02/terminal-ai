import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

vi.mock('@/lib/db', () => ({
  db: { query: vi.fn() },
}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))
vi.mock('@/lib/credits', () => ({
  grantCredits: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/email', () => ({
  sendWaitlistLaunchEmail: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/waitlist-config', () => ({
  invalidateWaitlistCache: vi.fn(),
}))
vi.mock('@/lib/middleware/require-admin', () => ({
  requireAdmin: vi.fn(),
}))

import { db } from '@/lib/db'
import { grantCredits } from '@/lib/credits'
import { sendWaitlistLaunchEmail } from '@/lib/email'
import { requireAdmin } from '@/lib/middleware/require-admin'
import { POST } from './route'
import { NextRequest } from 'next/server'

const mockDb = db as { query: ReturnType<typeof vi.fn> }
const mockRequireAdmin = requireAdmin as ReturnType<typeof vi.fn>

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/admin/launch', { method: 'POST' })
}

describe('POST /api/admin/launch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    )
    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 403 when not admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    )
    const res = await POST(makeRequest())
    expect(res.status).toBe(403)
  })

  it('launches platform: flips flag, grants credits, sends emails', async () => {
    mockRequireAdmin.mockResolvedValueOnce({
      session: { user: { id: 'admin1', role: 'admin' } },
    })
    // UPDATE config
    mockDb.query.mockResolvedValueOnce({ rows: [] })
    // SELECT waitlist
    mockDb.query.mockResolvedValueOnce({
      rows: [
        { email: 'a@example.com', user_id: 'uid1' },
        { email: 'b@example.com', user_id: null },
      ],
    })
    // alreadyGranted check for uid1
    mockDb.query.mockResolvedValueOnce({ rows: [] })
    // UPDATE notified_at
    mockDb.query.mockResolvedValueOnce({ rows: [] })

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const data = await res.json() as { launched: boolean; emailsSent: number; creditsGranted: number }
    expect(data.launched).toBe(true)
    expect(data.emailsSent).toBe(2)
    expect(data.creditsGranted).toBe(1)
    expect(grantCredits).toHaveBeenCalledWith('uid1', 10, 'waitlist_launch')
    expect(sendWaitlistLaunchEmail).toHaveBeenCalledWith('a@example.com', true)
    expect(sendWaitlistLaunchEmail).toHaveBeenCalledWith('b@example.com', false)
  })
})
