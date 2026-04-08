import { Hono } from 'hono'
import { db } from '../db.js'
import { logger } from '../lib/logger.js'
import { validateCronSchedule, getNextRunAt } from '../lib/cron-utils.js'
import type { EmbedTokenPayload } from '../middleware/auth.js'

const MAX_TASKS_PER_APP = 5
const MAX_PAYLOAD_BYTES = 10_240 // 10KB

export const taskRouter = new Hono()

// POST /tasks — create a scheduled task
taskRouter.post('/', async (c) => {
  const { userId, appId }: EmbedTokenPayload = c.get('embedToken')

  if (!userId) {
    return c.json({ error: 'Anonymous users cannot create tasks' }, 403)
  }

  const body = await c.req.json<{
    name?: string
    schedule?: string
    callbackPath?: string
    payload?: Record<string, unknown>
    timezone?: string
    enabled?: boolean
  }>()

  if (!body.name) return c.json({ error: 'Missing required field: name' }, 400)
  if (!body.schedule) return c.json({ error: 'Missing required field: schedule' }, 400)
  if (!body.callbackPath) return c.json({ error: 'Missing required field: callbackPath' }, 400)
  if (!body.callbackPath.startsWith('/')) return c.json({ error: 'callbackPath must start with /' }, 400)
  if (body.name.length > 100) return c.json({ error: 'name must be 100 characters or less' }, 400)

  // Validate cron schedule
  const validation = validateCronSchedule(body.schedule)
  if (!validation.valid) {
    return c.json({ error: validation.error }, 400)
  }

  // Validate payload size
  const payloadStr = JSON.stringify(body.payload ?? {})
  if (Buffer.byteLength(payloadStr, 'utf8') > MAX_PAYLOAD_BYTES) {
    return c.json({ error: 'payload exceeds maximum size of 10KB' }, 400)
  }

  // Check task limit
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM gateway.scheduled_tasks WHERE app_id = $1`,
    [appId],
  )
  if (parseInt(countResult.rows[0].count, 10) >= MAX_TASKS_PER_APP) {
    return c.json({ error: `Maximum of ${MAX_TASKS_PER_APP} tasks per app reached` }, 409)
  }

  // Resolve app's deployed URL
  const deployResult = await db.query<{ subdomain: string }>(
    `SELECT subdomain FROM deployments.deployments
     WHERE app_id = $1 AND status = 'live'
     ORDER BY created_at DESC LIMIT 1`,
    [appId],
  )
  if (!deployResult.rows[0]) {
    return c.json({ error: 'App has no live deployment — cannot register tasks' }, 400)
  }

  const timezone = body.timezone ?? 'UTC'
  const nextRunAt = getNextRunAt(body.schedule, timezone)

  const result = await db.query<{
    id: string
    app_id: string
    name: string
    schedule: string
    callback_path: string
    payload: Record<string, unknown>
    timezone: string
    enabled: boolean
    next_run_at: string
    created_at: string
  }>(
    `INSERT INTO gateway.scheduled_tasks
       (app_id, user_id, name, schedule, callback_path, payload, timezone, enabled, next_run_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [appId, userId, body.name, body.schedule, body.callbackPath, body.payload ?? {}, timezone, body.enabled ?? true, nextRunAt],
  )

  const task = result.rows[0]
  const subdomain = deployResult.rows[0].subdomain
  const callbackUrl = `https://${subdomain}.apps.terminalai.app${task.callback_path}`

  return c.json({
    id: task.id,
    name: task.name,
    schedule: task.schedule,
    callbackPath: task.callback_path,
    callbackUrl,
    timezone: task.timezone,
    enabled: task.enabled,
    nextRunAt: task.next_run_at,
    createdAt: task.created_at,
  }, 201)
})

// GET /tasks — list tasks for this app
taskRouter.get('/', async (c) => {
  const { appId }: EmbedTokenPayload = c.get('embedToken')

  const result = await db.query<{
    id: string; name: string; schedule: string; callback_path: string;
    timezone: string; enabled: boolean; next_run_at: string | null;
    last_run_at: string | null; last_run_status: string | null
  }>(
    `SELECT id, name, schedule, callback_path, timezone, enabled, next_run_at, last_run_at, last_run_status
     FROM gateway.scheduled_tasks WHERE app_id = $1 ORDER BY created_at`,
    [appId],
  )

  return c.json(result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    schedule: row.schedule,
    callbackPath: row.callback_path,
    timezone: row.timezone,
    enabled: row.enabled,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    lastRunStatus: row.last_run_status,
  })))
})

// GET /tasks/:id — get task with execution history
taskRouter.get('/:id', async (c) => {
  const { appId }: EmbedTokenPayload = c.get('embedToken')
  const taskId = c.req.param('id')

  const taskResult = await db.query<{
    id: string; name: string; schedule: string; callback_path: string;
    payload: Record<string, unknown>; timezone: string; enabled: boolean;
    next_run_at: string | null; last_run_at: string | null; last_run_status: string | null
  }>(
    `SELECT * FROM gateway.scheduled_tasks WHERE id = $1 AND app_id = $2`,
    [taskId, appId],
  )
  if (!taskResult.rows[0]) return c.json({ error: 'Task not found' }, 404)

  const execResult = await db.query<{
    id: string; fired_at: string; status: string; response_code: number | null;
    latency_ms: number | null; retry_count: number
  }>(
    `SELECT id, fired_at, status, response_code, latency_ms, retry_count
     FROM gateway.task_executions WHERE task_id = $1 ORDER BY fired_at DESC LIMIT 20`,
    [taskId],
  )

  const task = taskResult.rows[0]
  return c.json({
    id: task.id,
    name: task.name,
    schedule: task.schedule,
    callbackPath: task.callback_path,
    payload: task.payload,
    timezone: task.timezone,
    enabled: task.enabled,
    nextRunAt: task.next_run_at,
    lastRunAt: task.last_run_at,
    lastRunStatus: task.last_run_status,
    executions: execResult.rows.map((row) => ({
      id: row.id,
      firedAt: row.fired_at,
      status: row.status,
      responseCode: row.response_code,
      latencyMs: row.latency_ms,
      retryCount: row.retry_count,
    })),
  })
})

// PATCH /tasks/:id — update task
taskRouter.patch('/:id', async (c) => {
  const { appId }: EmbedTokenPayload = c.get('embedToken')
  const taskId = c.req.param('id')

  const body = await c.req.json<{
    name?: string; schedule?: string; callbackPath?: string;
    payload?: Record<string, unknown>; timezone?: string; enabled?: boolean
  }>()

  // Validate schedule if provided
  if (body.schedule) {
    const validation = validateCronSchedule(body.schedule)
    if (!validation.valid) return c.json({ error: validation.error }, 400)
  }

  if (body.payload) {
    const payloadStr = JSON.stringify(body.payload)
    if (Buffer.byteLength(payloadStr, 'utf8') > MAX_PAYLOAD_BYTES) {
      return c.json({ error: 'payload exceeds maximum size of 10KB' }, 400)
    }
  }

  if (body.callbackPath && !body.callbackPath.startsWith('/')) {
    return c.json({ error: 'callbackPath must start with /' }, 400)
  }

  // Build dynamic SET clause
  const sets: string[] = ['updated_at = now()']
  const values: unknown[] = []
  let paramIndex = 1

  if (body.name !== undefined) { sets.push(`name = $${paramIndex++}`); values.push(body.name) }
  if (body.schedule !== undefined) { sets.push(`schedule = $${paramIndex++}`); values.push(body.schedule) }
  if (body.callbackPath !== undefined) { sets.push(`callback_path = $${paramIndex++}`); values.push(body.callbackPath) }
  if (body.payload !== undefined) { sets.push(`payload = $${paramIndex++}`); values.push(JSON.stringify(body.payload)) }
  if (body.timezone !== undefined) { sets.push(`timezone = $${paramIndex++}`); values.push(body.timezone) }
  if (body.enabled !== undefined) { sets.push(`enabled = $${paramIndex++}`); values.push(body.enabled) }

  // Recalculate next_run_at if schedule or timezone changed
  if (body.schedule || body.timezone) {
    // Need current task to get the other value
    const current = await db.query<{ schedule: string; timezone: string }>(
      `SELECT schedule, timezone FROM gateway.scheduled_tasks WHERE id = $1 AND app_id = $2`,
      [taskId, appId],
    )
    if (!current.rows[0]) return c.json({ error: 'Task not found' }, 404)

    const schedule = body.schedule ?? current.rows[0].schedule
    const timezone = body.timezone ?? current.rows[0].timezone
    const nextRunAt = getNextRunAt(schedule, timezone)
    sets.push(`next_run_at = $${paramIndex++}`)
    values.push(nextRunAt)
  }

  values.push(taskId, appId)
  const result = await db.query(
    `UPDATE gateway.scheduled_tasks SET ${sets.join(', ')}
     WHERE id = $${paramIndex++} AND app_id = $${paramIndex}
     RETURNING id`,
    values,
  )

  if (result.rowCount === 0) return c.json({ error: 'Task not found' }, 404)
  return c.json({ updated: true })
})

// DELETE /tasks/:id — delete task
taskRouter.delete('/:id', async (c) => {
  const { appId }: EmbedTokenPayload = c.get('embedToken')
  const taskId = c.req.param('id')

  const result = await db.query(
    `DELETE FROM gateway.scheduled_tasks WHERE id = $1 AND app_id = $2`,
    [taskId, appId],
  )

  if (result.rowCount === 0) return c.json({ error: 'Task not found' }, 404)
  return c.json({ deleted: true })
})
