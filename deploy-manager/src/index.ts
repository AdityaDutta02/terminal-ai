import { Hono } from 'hono'
import { logger as honoLogger } from 'hono/logger'
import { deployQueue, startDeployWorker } from './queue/deploy-queue'
import { getAppDetails, deleteApp } from './services/coolify'
import { db } from './lib/db'
import { logger } from './lib/logger'

const REQUIRED_ENV = [
  'GATEWAY_URL',
  'COOLIFY_URL',
  'COOLIFY_TOKEN',
  'COOLIFY_PROJECT_UUID',
  'COOLIFY_SERVER_UUID',
  'DATABASE_URL',
  'REDIS_PASSWORD',
] as const

for (const key of REQUIRED_ENV) {
  if (!process.env[key] || process.env[key] === 'undefined') {
    console.error(`FATAL: Missing required env var: ${key}`)
    process.exit(1)
  }
}

console.log('Env validation passed. Starting deploy-manager...')

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

async function buildLogResponse(row: DeploymentLogRow): Promise<Record<string, unknown>> {
  const extra = await fetchCoolifyExtra(row.coolify_app_id)
  return { deploymentId: row.id, appName: row.app_name, status: row.status, startedAt: row.created_at, completedAt: row.completed_at ?? null, error: row.error_message ?? null, ...extra }
}

const app = new Hono()
app.use('*', honoLogger())
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
  await deployQueue.add('deploy', body)
  logger.info({ msg: 'deploy_queued', deploymentId: body.deploymentId })
  return c.json({ queued: true })
})
app.get('/deployments/:id/logs', async (c) => {
  const id = c.req.param('id')
  const { rows } = await db.query(
    `SELECT d.id, d.status, d.error_message, d.coolify_app_id, d.created_at, d.completed_at, a.name as app_name
     FROM deployments.deployments d
     JOIN marketplace.apps a ON a.id = d.app_id
     WHERE d.id = $1`,
    [id]
  )
  if (rows.length === 0) return c.json({ error: 'Not found' }, 404)
  return c.json(await buildLogResponse(rows[0] as DeploymentLogRow))
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
  await db.query(`DELETE FROM deployments.deployments WHERE app_id = $1`, [appId])
  await db.query(`DELETE FROM marketplace.apps WHERE id = $1`, [appId])
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
  })
  logger.info({ msg: 'deploy_retry_queued', deploymentId: id })
  return c.json({ queued: true })
})
const port = parseInt(process.env.PORT ?? '3002', 10)
startDeployWorker()
logger.info({ msg: 'deploy_manager_started', port })
export default { port, fetch: app.fetch }
