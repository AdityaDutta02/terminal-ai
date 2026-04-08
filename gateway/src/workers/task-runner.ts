import { SignJWT } from 'jose'
import { db } from '../db.js'
import { logger } from '../lib/logger.js'
import { getNextRunAt } from '../lib/cron-utils.js'

const SECRET = new TextEncoder().encode(process.env.EMBED_TOKEN_SECRET!)
const CALLBACK_TIMEOUT_MS = 30_000

interface DueTask {
  id: string
  app_id: string
  user_id: string
  schedule: string
  callback_path: string
  payload: Record<string, unknown>
  timezone: string
}

async function mintExecutionToken(task: DueTask): Promise<string> {
  return new SignJWT({
    appId: task.app_id,
    taskId: task.id,
    userId: task.user_id,
    type: 'task_execution',
    isFree: false,
    creditsPerCall: 1,
    sessionId: `task-exec-${task.id}`,
    isAnon: false,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('2m')
    .sign(SECRET)
}

async function resolveCallbackUrl(task: DueTask): Promise<string | null> {
  const result = await db.query<{ url: string }>(
    `SELECT url FROM deployments.deployments
     WHERE app_id = $1 AND status = 'live'
     ORDER BY created_at DESC LIMIT 1`,
    [task.app_id],
  )
  if (!result.rows[0] || !result.rows[0].url) return null
  return `${result.rows[0].url}${task.callback_path}`
}

async function executeTask(task: DueTask): Promise<void> {
  const startedAt = Date.now()
  let status = 'success'
  let responseCode: number | null = null
  let errorMessage: string | null = null

  try {
    const callbackUrl = await resolveCallbackUrl(task)
    if (!callbackUrl) {
      status = 'failed'
      errorMessage = 'No live deployment found'
      logger.warn({ msg: 'task_no_deployment', taskId: task.id, appId: task.app_id })
      return
    }

    const token = await mintExecutionToken(task)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), CALLBACK_TIMEOUT_MS)

    try {
      const response = await fetch(callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(task.payload),
        signal: controller.signal,
      })

      responseCode = response.status

      if (!response.ok) {
        status = 'failed'
        errorMessage = `Callback returned ${response.status}`
        logger.warn({ msg: 'task_callback_failed', taskId: task.id, status: response.status })
      }
    } finally {
      clearTimeout(timeout)
    }
  } catch (err) {
    status = 'failed'
    errorMessage = err instanceof Error ? err.message : String(err)
    logger.error({ msg: 'task_execution_error', taskId: task.id, err: errorMessage })
  } finally {
    const latencyMs = Date.now() - startedAt

    // Log execution
    await db.query(
      `INSERT INTO gateway.task_executions (task_id, status, response_code, latency_ms, error_message)
       VALUES ($1, $2, $3, $4, $5)`,
      [task.id, status, responseCode, latencyMs, errorMessage],
    )

    // Update task: next_run_at, last_run_at, last_run_status
    const nextRunAt = getNextRunAt(task.schedule, task.timezone)
    await db.query(
      `UPDATE gateway.scheduled_tasks
       SET next_run_at = $1, last_run_at = now(), last_run_status = $2, updated_at = now()
       WHERE id = $3`,
      [nextRunAt, status, task.id],
    )
  }
}

export async function executeDueTasks(): Promise<void> {
  const result = await db.query<DueTask>(
    `SELECT id, app_id, user_id, schedule, callback_path, payload, timezone
     FROM gateway.scheduled_tasks
     WHERE enabled = true AND next_run_at <= NOW()`,
  )

  if (result.rows.length === 0) return

  logger.info({ msg: 'task_runner_tick', dueCount: result.rows.length })

  // Execute tasks sequentially to avoid thundering herd on shared resources
  for (const task of result.rows) {
    await executeTask(task)
  }
}
