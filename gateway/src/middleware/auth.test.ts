import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { SignJWT } from 'jose'

vi.mock('../db', () => ({
  db: {
    query: vi.fn(),
  },
}))

import { db } from '../db'

const mockQuery = db.query as ReturnType<typeof vi.fn>

// Set the secret before importing auth middleware
const SECRET_STRING = 'test-secret-key-for-jwt-signing-1234'
process.env.EMBED_TOKEN_SECRET = SECRET_STRING
const SECRET = new TextEncoder().encode(SECRET_STRING)

// Import after env is set
const { embedTokenAuth } = await import('./auth')

function createTestApp() {
  const app = new Hono()
  app.use('*', embedTokenAuth)
  app.get('/test', (c) => {
    const token = c.get('embedToken')
    return c.json(token)
  })
  return app
}

describe('embedTokenAuth — task execution tokens', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts a task_execution token without DB lookup', async () => {
    const app = createTestApp()

    const jwt = await new SignJWT({
      appId: 'app-1',
      taskId: 'task-1',
      userId: 'user-1',
      type: 'task_execution',
      isFree: false,
      creditsPerCall: 1,
      sessionId: 'task-exec-1',
      isAnon: false,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('2m')
      .sign(SECRET)

    // Mock: channel suspension check — not suspended
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${jwt}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.appId).toBe('app-1')
    expect(body.userId).toBe('user-1')
    // Should NOT have queried embed_tokens table (only suspension check)
    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(mockQuery.mock.calls[0][0]).toContain('channel_suspensions')
  })

  it('rejects task_execution token for suspended channel', async () => {
    const app = createTestApp()

    const jwt = await new SignJWT({
      appId: 'app-1',
      taskId: 'task-1',
      userId: 'user-1',
      type: 'task_execution',
      isFree: false,
      creditsPerCall: 1,
      sessionId: 'task-exec-1',
      isAnon: false,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('2m')
      .sign(SECRET)

    // Mock: channel IS suspended
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'susp-1' }] })

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${jwt}` },
    })

    expect(res.status).toBe(403)
  })
})
