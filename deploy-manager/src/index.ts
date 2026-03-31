import { Hono } from 'hono'
import { logger as honoLogger } from 'hono/logger'
import { deployQueue, startDeployWorker, startPollWorker } from './queue/deploy-queue'
import { getAppDetails, deleteApp, getDeploymentLogs, triggerDeploy } from './services/coolify'
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

async function buildLogResponse(row: DeploymentLogRow, includeBuildLogs = false): Promise<Record<string, unknown>> {
  const extra = await fetchCoolifyExtra(row.coolify_app_id)
  const response: Record<string, unknown> = {
    deploymentId: row.id, appName: row.app_name, status: row.status,
    startedAt: row.created_at, completedAt: row.completed_at ?? null,
    error: row.error_message ?? null, ...extra,
  }
  if (includeBuildLogs && row.coolify_app_id) {
    response.buildLogs = await getDeploymentLogs(row.coolify_app_id)
  }
  return response
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
    `SELECT d.id, d.app_id, d.status, d.error_message, d.coolify_app_id, d.created_at, d.completed_at, d.subdomain, a.name as app_name
     FROM deployments.deployments d
     JOIN marketplace.apps a ON a.id = d.app_id
     WHERE d.id = $1`,
    [id]
  )
  if (rows.length === 0) return c.json({ error: 'Not found' }, 404)
  const row = rows[0] as DeploymentLogRow & { app_id: string; subdomain: string }

  // Issue #4 fix: auto-correct stuck "failed" status if Coolify reports healthy
  if (row.status === 'failed' && row.coolify_app_id) {
    try {
      const { status: liveStatus, fqdn } = await getAppDetails(row.coolify_app_id)
      if (liveStatus === 'running' || liveStatus.startsWith('running:')) {
        const cloudflareConfigured = !!(process.env.CLOUDFLARE_TOKEN && process.env.CLOUDFLARE_ZONE_ID && process.env.VPS2_IP)
        let recoveredUrl: string
        if (cloudflareConfigured && row.subdomain) {
          recoveredUrl = `https://${row.subdomain}.apps.terminalai.app`
        } else {
          const rawFqdn = (fqdn ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '')
          recoveredUrl = rawFqdn ? `http://${rawFqdn}` : ''
        }
        if (recoveredUrl) {
          await db.query(
            `UPDATE deployments.deployments SET status = 'live', url = $2, error_message = NULL, completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [id, recoveredUrl]
          )
          await db.query(
            `UPDATE marketplace.apps SET iframe_url = $2 WHERE id = $1`,
            [row.app_id, recoveredUrl]
          )
          row.status = 'live'
          row.error_message = null
          logger.info({ msg: 'status_auto_corrected', deploymentId: id, url: recoveredUrl })
        }
      }
    } catch {
      // non-fatal — just return current status
    }
  }

  return c.json(await buildLogResponse(row, true))
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
      // Create a new deployment record for tracking
      const depResult = await db.query<{ id: string }>(
        `INSERT INTO deployments.deployments (app_id, subdomain, github_repo, github_branch, coolify_app_id, status)
         VALUES ($1, $2, $3, $4, $5, 'building')
         RETURNING id`,
        [appId, prev.subdomain, prev.github_repo, prev.github_branch, prev.coolify_app_id]
      )
      const newDeploymentId = depResult.rows[0].id
      // Queue the polling/health-check phase (reuses existing Coolify app)
      await deployQueue.add('poll-existing', {
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

  // No Coolify app — fall back to full deploy
  const depResult = await db.query<{ id: string }>(
    `INSERT INTO deployments.deployments (app_id, subdomain, github_repo, github_branch)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [appId, prev.subdomain, prev.github_repo, prev.github_branch]
  )
  const newDeploymentId = depResult.rows[0].id
  await deployQueue.add('deploy', {
    deploymentId: newDeploymentId,
    appId,
    githubRepo: prev.github_repo,
    branch: prev.github_branch,
    subdomain: prev.subdomain,
  })
  logger.info({ msg: 'redeploy_full_queued', appId, deploymentId: newDeploymentId })
  return c.json({ deploymentId: newDeploymentId, redeployed: true })
})
const port = parseInt(process.env.PORT ?? '3002', 10)
startDeployWorker()
startPollWorker()
logger.info({ msg: 'deploy_manager_started', port })
export default { port, fetch: app.fetch }
