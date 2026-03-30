import { Queue, Worker } from 'bullmq'
import { scanForSecrets } from '../services/gitleaks'
import { createApp, triggerDeploy, getAppDetails } from '../services/coolify'
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
const COOLIFY_POLL_INTERVAL_MS = 30_000
const COOLIFY_POLL_TIMEOUT_MS = 20 * 60 * 1000

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

/**
 * Poll Coolify every 30s until the app reaches 'running' status or times out.
 * Returns the Coolify-assigned FQDN/URL, or null if Coolify didn't provide one.
 */
async function pollCoolifyUntilRunning(coolifyId: string, deploymentId: string): Promise<string | null> {
  const deadline = Date.now() + COOLIFY_POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, COOLIFY_POLL_INTERVAL_MS))
    const details = await getAppDetails(coolifyId)
    logger.info({ msg: 'coolify_poll', deploymentId, coolifyId, coolifyStatus: details.status })

    if (details.status === 'running') return details.fqdn ?? null

    if (['exited', 'failed', 'error', 'degraded'].includes(details.status)) {
      throw new Error(`Coolify deployment failed with status: ${details.status}`)
    }
  }

  throw new Error('Coolify deployment timed out after 20 minutes')
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

      // Store Coolify app ID immediately so status checks can reference it
      await db.query(
        `UPDATE deployments.deployments SET coolify_app_id = $2, updated_at = NOW() WHERE id = $1`,
        [deploymentId, coolifyId]
      )

      await triggerDeploy(coolifyId)

      // Poll Coolify until the app is running; get its assigned URL
      const coolifyUrl = await pollCoolifyUntilRunning(coolifyId, deploymentId)

      // Prefer Cloudflare subdomain URL when DNS is configured; otherwise use Coolify's URL
      const finalUrl = cloudflareConfigured
        ? `https://${subdomain}.apps.terminalai.app`
        : coolifyUrl

      await db.query(
        `UPDATE deployments.deployments SET status = 'live', url = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [deploymentId, finalUrl]
      )

      // Update the app's iframe_url so the viewer can load it
      if (finalUrl) {
        await db.query(
          `UPDATE marketplace.apps SET iframe_url = $2 WHERE id = $1`,
          [appId, finalUrl]
        )
      }

      logger.info({ msg: 'deploy_complete', deploymentId, subdomain, url: finalUrl })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error({ msg: 'deploy_failed', deploymentId, err: message })
      await failDeployment(deploymentId, message)
      throw err
    }
  }, { connection: redisConnection, concurrency: 3 })
}
