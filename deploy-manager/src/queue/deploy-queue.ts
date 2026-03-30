import { Queue, Worker } from 'bullmq'
import { readFile, rm } from 'fs/promises'
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

/** Read the app port from terminal-ai.config.json if present; default to 3000. */
async function readAppPort(repoPath: string): Promise<number> {
  try {
    const raw = await readFile(`${repoPath}/terminal-ai.config.json`, 'utf-8')
    const config = JSON.parse(raw) as { port?: number }
    if (typeof config.port === 'number' && config.port > 0) return config.port
  } catch {
    // file absent or malformed — use default
  }
  return 3000
}

async function updateDeployment(deploymentId: string, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields)
  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ')
  const values = Object.values(fields)
  await db.query(
    `UPDATE deployments.deployments SET ${setClauses}, updated_at = NOW() WHERE id = $1`,
    [deploymentId, ...values]
  )
}

async function failDeployment(deploymentId: string, message: string): Promise<void> {
  await updateDeployment(deploymentId, { status: 'failed', error_message: message })
    .catch((err: unknown) => logger.error({ msg: 'failed_to_update_deployment_status', deploymentId, err: String(err) }))
}

/** Poll Coolify every 30s until the app container is running or a terminal failure status is reached. */
async function pollCoolifyUntilRunning(coolifyId: string, deploymentId: string): Promise<void> {
  const deadline = Date.now() + COOLIFY_POLL_TIMEOUT_MS
  let unhealthyCount = 0

  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, COOLIFY_POLL_INTERVAL_MS))
    const { status } = await getAppDetails(coolifyId)
    logger.info({ msg: 'coolify_poll', deploymentId, coolifyId, coolifyStatus: status })

    // running:unknown means container is up but no health check configured — treat as success
    if (status === 'running' || status.startsWith('running:')) return
    // exited:unhealthy can be transient during container startup — allow 3 retries
    if (status === 'exited:unhealthy') {
      unhealthyCount++
      if (unhealthyCount >= 3) throw new Error(`Coolify deployment failed with status: ${status}`)
      continue
    }
    const isTerminalFailure = ['exited', 'failed', 'error', 'degraded'].some(
      (s) => status === s || status.startsWith(s + ':')
    )
    if (isTerminalFailure) {
      throw new Error(`Coolify deployment failed with status: ${status}`)
    }
    // 'stopped', 'starting', and 'restarting' are transient — keep polling
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

    const tmpPath = `/tmp/deploy-${deploymentId}`

    try {
      await db.query(
        `UPDATE deployments.deployments SET status = 'building', updated_at = NOW() WHERE id = $1`,
        [deploymentId]
      )

      await cloneRepo(githubRepo, tmpPath)

      const scan = await scanForSecrets(tmpPath)
      if (!scan.clean) {
        await failDeployment(deploymentId, `Secret detected: ${scan.findings[0]}`)
        throw new Error('Secrets detected in repository')
      }

      // Read port from the app's own config (3000 for Next.js, 8000 for Python/Streamlit)
      const appPort = await readAppPort(tmpPath)

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

      const { uuid: coolifyId, domain: coolifyDomain } = await createApp({
        name: subdomain,
        githubRepo,
        branch,
        port: appPort,
        envVars: {
          TERMINAL_AI_GATEWAY_URL: process.env.GATEWAY_URL!,
          TERMINAL_AI_APP_ID: appId,
        },
      })

      // Prefer Cloudflare subdomain when DNS is configured; otherwise use the
      // sslip.io domain Coolify auto-generated and returned.
      const finalUrl = cloudflareConfigured
        ? `https://${subdomain}.apps.terminalai.app`
        : coolifyDomain

      // Store Coolify app ID immediately so status checks can reference it
      await db.query(
        `UPDATE deployments.deployments SET coolify_app_id = $2, updated_at = NOW() WHERE id = $1`,
        [deploymentId, coolifyId]
      )

      await triggerDeploy(coolifyId)

      // Wait for Coolify to finish building and start the container
      await pollCoolifyUntilRunning(coolifyId, deploymentId)

      await db.query(
        `UPDATE deployments.deployments SET status = 'live', url = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [deploymentId, finalUrl]
      )
      await db.query(
        `UPDATE marketplace.apps SET iframe_url = $2 WHERE id = $1`,
        [appId, finalUrl]
      )

      logger.info({ msg: 'deploy_complete', deploymentId, subdomain, url: finalUrl })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error({ msg: 'deploy_failed', deploymentId, err: message })
      await failDeployment(deploymentId, message)
      throw err
    } finally {
      // Always clean up the cloned repo to avoid filling disk
      await rm(tmpPath, { recursive: true, force: true }).catch(() => undefined)
    }
  }, { connection: redisConnection, concurrency: 3 })
}
