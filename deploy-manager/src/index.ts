import { Hono } from 'hono'
import { logger as honoLogger } from 'hono/logger'
import { deployQueue, startDeployWorker } from './queue/deploy-queue'
import { getAppDetails } from './services/coolify'
import { db } from './lib/db'
import { logger } from './lib/logger'
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
app.post('/deployments/:id/retry', async (c) => {
  const id = c.req.param('id')
  const { rows } = await db.query(
    `SELECT id, app_id, github_repo, github_branch, subdomain
     FROM deployments.deployments WHERE id = $1 AND status = 'failed'`,
    [id]
  )
  if (rows.length === 0) return c.json({ error: 'Not found or not failed' }, 404)
  const d = rows[0]
  await deployQueue.add('deploy', {
    deploymentId: d.id,
    appId: d.app_id,
    githubRepo: d.github_repo,
    branch: d.github_branch,
    subdomain: d.subdomain,
  })
  logger.info({ msg: 'deploy_retry_queued', deploymentId: id })
  return c.json({ queued: true })
})
const port = parseInt(process.env.PORT ?? '3002', 10)
startDeployWorker()
logger.info({ msg: 'deploy_manager_started', port })
export default { port, fetch: app.fetch }
