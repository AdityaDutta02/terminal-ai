import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db', () => ({
  db: {
    query: vi.fn(),
  },
}))

// Mock jose SignJWT
vi.mock('jose', () => ({
  SignJWT: class MockSignJWT {
    setProtectedHeader() { return this }
    setExpirationTime() { return this }
    async sign() { return 'mock-task-jwt' }
  },
}))

// Mock cron-utils
vi.mock('../lib/cron-utils', () => ({
  getNextRunAt: vi.fn().mockReturnValue('2026-04-10T08:00:00.000Z'),
}))

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { db } from '../db'
import { executeDueTasks } from './task-runner'

const mockQuery = db.query as ReturnType<typeof vi.fn>

// Set env before tests
process.env.EMBED_TOKEN_SECRET = 'test-secret-key-for-jwt-signing-1234'

describe('executeDueTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('picks up due tasks and POSTs to callback URL', async () => {
    // Mock: query due tasks
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'task-1',
        app_id: 'app-1',
        user_id: 'user-1',
        schedule: '0 8 * * *',
        callback_path: '/api/cron/report',
        payload: { market: 'NIFTY50' },
        timezone: 'UTC',
      }],
    })
    // Mock: resolve deployment URL
    mockQuery.mockResolvedValueOnce({
      rows: [{ url: 'https://daily-market.apps.terminalai.studioionique.com' }],
    })
    // Mock: callback response
    mockFetch.mockResolvedValueOnce(new Response('OK', { status: 200 }))
    // Mock: insert execution log
    mockQuery.mockResolvedValueOnce({ rows: [] })
    // Mock: update task next_run_at
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await executeDueTasks()

    // Verify callback was called
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://daily-market.apps.terminalai.studioionique.com/api/cron/report')
    expect(options.method).toBe('POST')
    expect(options.headers.Authorization).toBe('Bearer mock-task-jwt')
    expect(JSON.parse(options.body)).toEqual({ market: 'NIFTY50' })
  })

  it('does nothing when no tasks are due', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await executeDueTasks()

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('logs failure when callback returns 500', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'task-1',
        app_id: 'app-1',
        user_id: 'user-1',
        schedule: '0 8 * * *',
        callback_path: '/api/cron/report',
        payload: {},
        timezone: 'UTC',
      }],
    })
    mockQuery.mockResolvedValueOnce({
      rows: [{ url: 'https://daily-market.apps.terminalai.studioionique.com' }],
    })
    // Callback fails
    mockFetch.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }))
    // Mock: insert execution log (failed)
    mockQuery.mockResolvedValueOnce({ rows: [] })
    // Mock: update task next_run_at
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await executeDueTasks()

    // Check that execution log was written with 'failed' status
    const insertCall = mockQuery.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('task_executions'),
    )
    expect(insertCall).toBeDefined()
    // The status param should be 'failed'
    expect(insertCall![1]).toContain('failed')
  })
})
