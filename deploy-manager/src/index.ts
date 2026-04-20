import { Hono } from 'hono'
import { logger as honoLogger } from 'hono/logger'
import pg from 'pg'
import { deployQueue, pollQueue, startDeployWorker, startPollWorker, JOB_OPTIONS } from './queue/deploy-queue'
import { getAppDetails, deleteApp, getDeploymentLogs, triggerDeploy } from './services/coolify'
import { storageDeletePrefix } from './services/storage-cleanup'
import { db } from './lib/db'
import { logger } from './lib/logger'
import { ERROR_MESSAGES } from './lib/deployment-events'

function getRequiredEnvKeys(): readonly string[] {
  return 'GATEWAY_URL,COOLIFY_URL,COOLIFY_TOKEN,COOLIFY_PROJECT_UUID,COOLIFY_SERVER_UUID,DATABASE_URL,REDIS_PASSWORD'.split(',')
}

for (const key of getRequiredEnvKeys()) {
  if (!process.env[key] || process.env[key] === 'undefined') {
    logger.error({ msg: 'missing_required_env', key })
    process.exit(1)
  }
}

logger.info({ msg: 'env_validation_passed' })

interface DeploymentLogRow {
  id: string
  status: string
  error_message: string | null
  coolify_app_id: string | null
  created_at: string
  completed_at: string | null
  app_name: string
}

async function fetchCoolifyExtra(coolifyAppId: string | null): Promise<Record<string, string>> {
  if (!coolifyAppId) return {}
  try {
    const { status, fqdn } = await getAppDetails(coolifyAppId)
    return fqdn ? { coolifyStatus: status, url: fqdn } : { coolifyStatus: status }
  } catch {
    // non-fatal — Coolify may have deleted the app already
    return {}
  }
}

function mapRowToBase(row: DeploymentLogRow): Record<string, unknown> {
  return {
    deploymentId: row.id,
    appName: row.app_name,
    status: row.status,
    startedAt: row.created_at,
    completedAt: row.completed_at ?? null,
    error: row.error_message ?? null,
  }
}

async function buildLogResponse(row: DeploymentLogRow, includeBuildLogs = false): Promise<Record<string, unknown>> {
  const extra = await fetchCoolifyExtra(row.coolify_app_id)
  const response = { ...mapRowToBase(row), ...extra }
  if (includeBuildLogs && row.coolify_app_id) {
    response.buildLogs = await getDeploymentLogs(row.coolify_app_id)
  }
  return response
}

const app = new Hono()
app.use('*', honoLogger())

// Internal auth middleware — protect all mutation routes
app.use('/deploy', async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token || token !== process.env.INTERNAL_SERVICE_TOKEN) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  await next()
})
app.use('/apps/*', async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token || token !== process.env.INTERNAL_SERVICE_TOKEN) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  await next()
})
app.use('/deployments/*/retry', async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token || token !== process.env.INTERNAL_SERVICE_TOKEN) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  await next()
})

app.get('/health', (c) => c.json({ status: 'ok' }))
app.get('/deployments/:id', async (c) => {
  const id = c.req.param('id')
  const { rows } = await db.query(
    `SELECT id, app_id, status, subdomain, coolify_app_id, error_message, created_at
     FROM deployments.deployments WHERE id = $1`,
    [id]
  )
  if (rows.length === 0) return c.json({ error: 'Not found' }, 404)
  const deployment = rows[0]
  if (deployment.coolify_app_id && deployment.status === 'live') {
    try {
      const { status: liveStatus } = await getAppDetails(deployment.coolify_app_id as string)
      return c.json({ ...deployment, live_status: liveStatus })
    } catch {
      return c.json(deployment)
    }
  }
  return c.json(deployment)
})
app.post('/deploy', async (c) => {
  const body = await c.req.json() as { deploymentId: string; appId: string; githubRepo: string; branch: string; subdomain: string }
  await deployQueue.add('deploy', body, JOB_OPTIONS)
  logger.info({ msg: 'deploy_queued', deploymentId: body.deploymentId })
  return c.json({ queued: true })
})
app.get('/deployments/:id/logs', async (c) => {
  const id = c.req.param('id')
  const { rows: depRows } = await db.query(
    `SELECT d.id, d.status, d.error_code, d.error_message, d.started_at, d.completed_at, d.retry_count,
            a.name as app_name
     FROM deployments.deployments d
     JOIN marketplace.apps a ON a.id = d.app_id
     WHERE d.id = $1`,
    [id]
  )
  if (depRows.length === 0) return c.json({ error: 'Not found' }, 404)
  const dep = depRows[0] as Record<string, unknown>

  const { rows: eventRows } = await db.query(
    `SELECT id, event_type, message, metadata, created_at
     FROM deployments.deployment_events
     WHERE deployment_id = $1
     ORDER BY created_at ASC`,
    [id]
  )

  const errorMessage = dep['error_code']
    ? (ERROR_MESSAGES[dep['error_code'] as string] ?? dep['error_message'])
    : null

  return c.json({
    deployment: {
      id: dep['id'],
      status: dep['status'],
      error_code: dep['error_code'] ?? null,
      error_message: errorMessage,
      started_at: dep['started_at'],
      completed_at: dep['completed_at'],
      retry_count: dep['retry_count'],
      app_name: dep['app_name'],
    },
    events: eventRows,
  })
})

app.get('/deployments/:id/logs/stream', async (c) => {
  const id = c.req.param('id')
  const { rows } = await db.query(
    `SELECT id, status FROM deployments.deployments WHERE id = $1`, [id]
  )
  if (rows.length === 0) return c.json({ error: 'Not found' }, 404)

  const stream = new ReadableStream({
    async start(controller) {
      let lastEventId: string | null = null
      const encoder = new TextEncoder()
      let finished = false

      const send = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`))
      }

      while (!finished) {
        const query = lastEventId
          ? `SELECT id, event_type, message, metadata, created_at
             FROM deployments.deployment_events
             WHERE deployment_id = $1 AND created_at > (SELECT created_at FROM deployments.deployment_events WHERE id = $2)
             ORDER BY created_at ASC`
          : `SELECT id, event_type, message, metadata, created_at
             FROM deployments.deployment_events
             WHERE deployment_id = $1
             ORDER BY created_at ASC`

        const params = lastEventId ? [id, lastEventId] : [id]
        const { rows: newEvents } = await db.query(query, params)

        for (const event of newEvents as Array<Record<string, unknown>>) {
          send(JSON.stringify(event))
          lastEventId = event['id'] as string
          if (event['event_type'] === 'deployed' || event['event_type'] === 'failed') {
            finished = true
          }
        }

        if (!finished) {
          const { rows: depRows } = await db.query(
            `SELECT status FROM deployments.deployments WHERE id = $1`, [id]
          )
          if (depRows.length > 0) {
            const status = (depRows[0] as Record<string, unknown>)['status'] as string
            if (status === 'live' || status === 'failed') finished = true
          }
        }

        if (!finished) await new Promise<void>((r) => setTimeout(r, 2_000))
      }

      controller.close()
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
})

app.delete('/apps/:appId', async (c) => {
  const appId = c.req.param('appId')
  // Fetch all deployments for this app to get Coolify IDs to clean up
  const { rows } = await db.query(
    `SELECT coolify_app_id FROM deployments.deployments WHERE app_id = $1 AND coolify_app_id IS NOT NULL`,
    [appId]
  )
  const coolifyIds = (rows as { coolify_app_id: string }[]).map((r) => r.coolify_app_id)
  const errors: string[] = []
  for (const cid of coolifyIds) {
    try {
      await deleteApp(cid)
      logger.info({ msg: 'coolify_app_deleted', coolifyAppId: cid, appId })
    } catch (err) {
      errors.push(String(err))
      logger.warn({ msg: 'coolify_delete_failed', coolifyAppId: cid, appId, err: String(err) })
    }
  }
  // Delete DB records regardless of Coolify cleanup outcome
  // Must delete in FK order: embed_tokens → credit_ledger refs → deployments → apps
  try {
    await db.query(`DELETE FROM gateway.embed_tokens WHERE app_id = $1`, [appId])
    await db.query(`DELETE FROM gateway.api_calls WHERE app_id = $1`, [appId])
    await db.query(`DELETE FROM subscriptions.credit_ledger WHERE app_id = $1`, [appId])
    await db.query(`DELETE FROM deployments.deployment_events WHERE deployment_id IN (SELECT id FROM deployments.deployments WHERE app_id = $1)`, [appId])
    await db.query(`DELETE FROM deployments.deployments WHERE app_id = $1`, [appId])
    await db.query(`DELETE FROM marketplace.apps WHERE id = $1`, [appId])
  } catch (dbErr) {
    logger.error({ msg: 'app_db_delete_failed', appId, err: String(dbErr) })
    return c.json({ error: `Database cleanup failed: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}` }, 500)
  }

  // Drop app DB schema and role
  const provResult = await db.query<{ schema_name: string; role_name: string }>(
    `SELECT schema_name, role_name FROM deployments.app_db_provisions WHERE app_id = $1`,
    [appId],
  )
  if (provResult.rows[0]) {
    const { schema_name: schemaName, role_name: roleName } = provResult.rows[0]
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! })
    const client = await pool.connect()
    try {
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
      await client.query(`DROP ROLE IF EXISTS "${roleName}"`)
    } finally {
      client.release()
      await pool.end()
    }
    await db.query(`DELETE FROM deployments.app_db_provisions WHERE app_id = $1`, [appId])
    logger.info({ msg: 'app_db_dropped', appId, schemaName })
  }

  // Delete storage prefix
  await storageDeletePrefix(appId).catch((err: unknown) => {
    logger.warn({ msg: 'storage_prefix_delete_failed', appId, err: String(err) })
  })

  logger.info({ msg: 'app_deleted', appId, coolifyAppsDeleted: coolifyIds.length })
  return c.json({ deleted: true, coolifyAppsDeleted: coolifyIds.length, warnings: errors })
})

app.post('/deployments/:id/retry', async (c) => {
  const id = c.req.param('id')
  const { rows } = await db.query(
    `SELECT id, app_id, github_repo, github_branch, subdomain
     FROM deployments.deployments WHERE id = $1 AND status = 'failed'`,
    [id]
  )
  if (rows.length === 0) return c.json({ error: 'Not found or not failed' }, 404)
  const row = rows[0]
  await deployQueue.add('deploy', {
    deploymentId: row.id,
    appId: row.app_id,
    githubRepo: row.github_repo,
    branch: row.github_branch,
    subdomain: row.subdomain,
  }, JOB_OPTIONS)
  logger.info({ msg: 'deploy_retry_queued', deploymentId: id })
  return c.json({ queued: true })
})

// Issue #3 fix: redeploy an existing app without deleting it
app.post('/apps/:appId/redeploy', async (c) => {
  const appId = c.req.param('appId')

  // Find the latest deployment for this app
  const { rows } = await db.query<{
    id: string; coolify_app_id: string | null; subdomain: string
    github_repo: string; github_branch: string
  }>(
    `SELECT id, coolify_app_id, subdomain, github_repo, github_branch
     FROM deployments.deployments WHERE app_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [appId]
  )
  if (rows.length === 0) return c.json({ error: 'No deployment found for this app' }, 404)
  const prev = rows[0]

  // If Coolify app exists, trigger a redeploy directly on Coolify (rebuilds from latest git)
  if (prev.coolify_app_id) {
    try {
      await triggerDeploy(prev.coolify_app_id)
      // Update the existing deployment record (subdomain is unique, so reuse it)
      const depResult = await db.query<{ id: string }>(
        `UPDATE deployments.deployments
         SET status = 'building', updated_at = NOW(), completed_at = NULL, error_message = NULL
         WHERE id = $1
         RETURNING id`,
        [prev.id]
      )
      const newDeploymentId = depResult.rows[0].id
      // Queue the polling/health-check phase (reuses existing Coolify app)
      await pollQueue.add('poll-existing', {
        deploymentId: newDeploymentId,
        appId,
        coolifyId: prev.coolify_app_id,
        subdomain: prev.subdomain,
      })
      logger.info({ msg: 'redeploy_triggered', appId, deploymentId: newDeploymentId, coolifyId: prev.coolify_app_id })
      return c.json({ deploymentId: newDeploymentId, redeployed: true })
    } catch (err) {
      return c.json({ error: `Coolify redeploy failed: ${err instanceof Error ? err.message : String(err)}` }, 500)
    }
  }

  // No Coolify app — fall back to full deploy (reuse existing deployment row)
  const depResult = await db.query<{ id: string }>(
    `UPDATE deployments.deployments
     SET status = 'pending', updated_at = NOW(), completed_at = NULL, error_message = NULL
     WHERE id = $1
     RETURNING id`,
    [prev.id]
  )
  const newDeploymentId = depResult.rows[0].id
  await deployQueue.add('deploy', {
    deploymentId: newDeploymentId,
    appId,
    githubRepo: prev.github_repo,
    branch: prev.github_branch,
    subdomain: prev.subdomain,
  }, JOB_OPTIONS)
  logger.info({ msg: 'redeploy_full_queued', appId, deploymentId: newDeploymentId })
  return c.json({ deploymentId: newDeploymentId, redeployed: true })
})
const port = parseInt(process.env.PORT ?? '3002', 10)
startDeployWorker()
startPollWorker()
logger.info({ msg: 'deploy_manager_started', port })
export default { port, fetch: app.fetch }
