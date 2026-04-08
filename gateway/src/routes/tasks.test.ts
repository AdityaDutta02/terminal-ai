import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { taskRouter } from './tasks'

vi.mock('../db', () => ({
  db: {
    query: vi.fn(),
  },
}))

vi.mock('../lib/cron-utils', () => ({
  validateCronSchedule: vi.fn().mockReturnValue({ valid: true }),
  getNextRunAt: vi.fn().mockReturnValue('2026-04-09T02:30:00.000Z'),
}))

import { db } from '../db'
import { validateCronSchedule } from '../lib/cron-utils'

const mockQuery = db.query as ReturnType<typeof vi.fn>

function createTestApp() {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('embedToken', {
      userId: 'user-1',
      appId: 'app-1',
      sessionId: 'sess-1',
      creditsPerCall: 1,
      isFree: false,
      isAnon: false,
    })
    await next()
  })
  app.route('/tasks', taskRouter)
  return app
}

describe('POST /tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(validateCronSchedule as ReturnType<typeof vi.fn>).mockReturnValue({ valid: true })
  })

  it('creates a task and returns it with nextRunAt', async () => {
    const app = createTestApp()
    // Mock: count existing tasks = 0
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] })
    // Mock: resolve app URL
    mockQuery.mockResolvedValueOnce({ rows: [{ subdomain: 'daily-market' }] })
    // Mock: insert task
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'task-1',
        app_id: 'app-1',
        name: 'daily-report',
        schedule: '0 8 * * *',
        callback_path: '/api/cron/report',
        payload: {},
        timezone: 'Asia/Kolkata',
        enabled: true,
        next_run_at: '2026-04-09T02:30:00.000Z',
        created_at: '2026-04-08T12:00:00.000Z',
      }],
    })

    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'daily-report',
        schedule: '0 8 * * *',
        callbackPath: '/api/cron/report',
        timezone: 'Asia/Kolkata',
      }),
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('task-1')
    expect(body.nextRunAt).toBe('2026-04-09T02:30:00.000Z')
  })

  it('rejects when 5 tasks already exist', async () => {
    const app = createTestApp()
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '5' }] })

    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'sixth-task',
        schedule: '0 8 * * *',
        callbackPath: '/api/cron/sixth',
      }),
    })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('5')
  })

  it('rejects sub-hour cron schedule', async () => {
    const app = createTestApp()
    ;(validateCronSchedule as ReturnType<typeof vi.fn>).mockReturnValue({
      valid: false,
      error: 'Minimum schedule interval is 1 hour',
    })

    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'too-frequent',
        schedule: '*/5 * * * *',
        callbackPath: '/api/cron/fast',
      }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('1 hour')
  })

  it('rejects payload over 10KB', async () => {
    const app = createTestApp()

    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'big-payload',
        schedule: '0 8 * * *',
        callbackPath: '/api/cron/big',
        payload: { data: 'x'.repeat(11_000) },
      }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('10KB')
  })

  it('rejects callbackPath not starting with /', async () => {
    const app = createTestApp()

    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'bad-path',
        schedule: '0 8 * * *',
        callbackPath: 'api/cron/report',
      }),
    })

    expect(res.status).toBe(400)
  })
})

describe('GET /tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns tasks scoped to appId', async () => {
    const app = createTestApp()
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'task-1', name: 'daily-report', schedule: '0 8 * * *', callback_path: '/api/cron/report', timezone: 'UTC', enabled: true, next_run_at: '2026-04-09T08:00:00Z', last_run_at: null, last_run_status: null },
      ],
    })

    const res = await app.request('/tasks', { method: 'GET' })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].name).toBe('daily-report')
  })
})

describe('DELETE /tasks/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes a task owned by the app', async () => {
    const app = createTestApp()
    mockQuery.mockResolvedValueOnce({ rowCount: 1 })

    const res = await app.request('/tasks/task-1', { method: 'DELETE' })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deleted).toBe(true)
  })

  it('returns 404 for task not owned by app', async () => {
    const app = createTestApp()
    mockQuery.mockResolvedValueOnce({ rowCount: 0 })

    const res = await app.request('/tasks/other-task', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})
