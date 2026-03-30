import { Queue, Worker } from 'bullmq'
import { scanForSecrets } from '../services/gitleaks'
import { createApp, triggerDeploy } from '../services/coolify'
import { createSubdomain } from '../services/dns'
import { db } from '../lib/db'
import { logger } from '../lib/logger'

const redisConnection = {
  host: process.env.REDIS_HOST ?? 'redis',
  port: 6379,
  ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
}

export const deployQueue = new Queue('deploys', { connection: redisConnection })

const GITHUB_REPO_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/

async function cloneRepo(githubRepo: string, dest: string): Promise<void> {
  if (!GITHUB_REPO_RE.test(githubRepo)) throw new Error(`Invalid githubRepo format: ${githubRepo}`)
  const { execFile } = await import('child_process')
  const { promisify } = await import('util')
  const execFileAsync = promisify(execFile)
  await execFileAsync('git', ['clone', '--depth=1', `https://github.com/${githubRepo}`, dest])
}

async function failDeployment(deploymentId: string, message: string): Promise<void> {
  await db.query(
    `UPDATE deployments.deployments SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1`,
    [deploymentId, message]
  ).catch((err: unknown) => logger.error({ msg: 'failed_to_update_deployment_status', deploymentId, err: String(err) }))
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

    try {
      await db.query(
        `UPDATE deployments.deployments SET status = 'building', updated_at = NOW() WHERE id = $1`,
        [deploymentId]
      )

      const tmpPath = `/tmp/deploy-${deploymentId}`
      await cloneRepo(githubRepo, tmpPath)

      const scan = await scanForSecrets(tmpPath)
      if (!scan.clean) {
        await failDeployment(deploymentId, `Secret detected: ${scan.findings[0]}`)
        throw new Error('Secrets detected in repository')
      }

      // DNS is optional — skip if Cloudflare is not configured
      const cloudflareConfigured = !!(process.env.CLOUDFLARE_TOKEN && process.env.CLOUDFLARE_ZONE_ID && process.env.VPS2_IP)
      if (cloudflareConfigured) {
        const dnsRecordId = await createSubdomain(subdomain)
        await db.query(
          `UPDATE deployments.deployments SET dns_record_id = $2, updated_at = NOW() WHERE id = $1`,
          [deploymentId, dnsRecordId]
        )
      } else {
        logger.warn({ msg: 'dns_skipped', deploymentId, reason: 'Cloudflare not configured' })
      }

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

      // URL is only set once the app is actually live — DNS required for the subdomain URL
      const appUrl = cloudflareConfigured
        ? `https://${subdomain}.apps.terminalai.app`
        : null

      await db.query(
        `UPDATE deployments.deployments SET status = 'live', coolify_app_id = $2, url = $3, completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [deploymentId, coolifyId, appUrl]
      )
      logger.info({ msg: 'deploy_complete', deploymentId, subdomain, url: appUrl })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error({ msg: 'deploy_failed', deploymentId, err: message })
      await failDeployment(deploymentId, message)
      throw err
    }
  }, { connection: redisConnection, concurrency: 3 })
}
