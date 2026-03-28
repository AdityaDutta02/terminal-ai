import { Queue, Worker } from 'bullmq'
import { scanForSecrets } from '../services/gitleaks'
import { createApp, triggerDeploy } from '../services/coolify'
import { createSubdomain } from '../services/dns'
import { db } from '../lib/db'
import { logger } from '../lib/logger'
const redisConnection = { host: process.env.REDIS_HOST ?? 'redis', port: 6379 }
export const deployQueue = new Queue('deploys', { connection: redisConnection })
async function cloneRepo(githubRepo: string, dest: string): Promise<void> {
  const { execFile } = await import('child_process')
  const { promisify } = await import('util')
  const execFileAsync = promisify(execFile)
  await execFileAsync('git', ['clone', '--depth=1', `https://github.com/${githubRepo}`, dest])
}
export function startDeployWorker(): Worker {
  return new Worker('deploys', async (job) => {
    const { deploymentId, appId, githubRepo, branch, subdomain } = job.data as {
      deploymentId: string
      appId: string
      githubRepo: string
      branch: string
      subdomain: string
    }
    await db.query(
      `UPDATE deployments.deployments SET status = 'building' WHERE id = $1`,
      [deploymentId]
    )
    const tmpPath = `/tmp/deploy-${deploymentId}`
    await cloneRepo(githubRepo, tmpPath)
    const scan = await scanForSecrets(tmpPath)
    if (!scan.clean) {
      await db.query(
        `UPDATE deployments.deployments SET status = 'failed', error_message = $2 WHERE id = $1`,
        [deploymentId, `Secret detected: ${scan.findings[0]}`]
      )
      throw new Error('Secrets detected in repository')
    }
    const dnsRecordId = await createSubdomain(subdomain)
    await db.query(
      `UPDATE deployments.deployments SET dns_record_id = $2 WHERE id = $1`,
      [deploymentId, dnsRecordId]
    )
    const coolifyId = await createApp({
      name: subdomain,
      githubRepo,
      branch,
      port: 3000,
      envVars: {
        TERMINAL_AI_GATEWAY_URL: process.env.GATEWAY_URL!,
        TERMINAL_AI_APP_ID: appId,
      },
    })
    await triggerDeploy(coolifyId)
    const appUrl = `https://${subdomain}.apps.terminalai.app`
    await db.query(
      `UPDATE deployments.deployments SET status = 'live', coolify_app_id = $2, url = $3, completed_at = NOW() WHERE id = $1`,
      [deploymentId, coolifyId, appUrl]
    )
    logger.info({ msg: 'deploy_complete', deploymentId, subdomain, url: appUrl })
  }, { connection: redisConnection, concurrency: 3 })
}
