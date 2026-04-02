import { Queue, Worker } from 'bullmq'
import { readFile, rm } from 'fs/promises'
import { scanForSecrets } from '../services/gitleaks'
import { createApp, triggerDeploy, getAppDetails, waitForHealthy } from '../services/coolify'
import { createSubdomain } from '../services/dns'
import { db } from '../lib/db'
import { logger } from '../lib/logger'
import { emitEvent, ERROR_MESSAGES } from '../lib/deployment-events'

const redisConnection = {
  host: process.env.REDIS_HOST ?? 'redis',
  port: 6379,
  ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
}

export const deployQueue = new Queue('deploys', { connection: redisConnection })

type JobOptions = { attempts: number; backoff: { type: 'exponential'; delay: number }; removeOnComplete: boolean; removeOnFail: boolean }
export const JOB_OPTIONS: JobOptions = Object.freeze({ attempts: 3, backoff: { type: 'exponential' as const, delay: 10_000 }, removeOnComplete: false, removeOnFail: false })

const GITHUB_REPO_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/
const COOLIFY_POLL_INTERVAL_MS = 30_000
const COOLIFY_POLL_TIMEOUT_MS = 20 * 60 * 1000
const MAX_UNHEALTHY_RETRIES = 10

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

async function failDeployment(deploymentId: string, errorCode: string): Promise<void> {
  const message = ERROR_MESSAGES[errorCode] ?? errorCode
  await updateDeployment(deploymentId, { status: 'failed', error_message: message, error_code: errorCode, completed_at: new Date() })
    .catch((err: unknown) => logger.error({ msg: 'failed_to_update_deployment_status', deploymentId, err: String(err) }))
  await emitEvent(deploymentId, 'failed', message, { error_code: errorCode })
}

function resolveUrl(subdomain: string | undefined, fqdn: string | null): string {
  const cloudflareConfigured = !!(process.env.CLOUDFLARE_TOKEN && process.env.CLOUDFLARE_ZONE_ID && process.env.VPS2_IP)
  if (cloudflareConfigured && subdomain) {
    return `https://${subdomain}.apps.terminalai.studioionique.com`
  }
  const rawFqdn = (fqdn ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '')
  return rawFqdn ? `http://${rawFqdn}` : ''
}

/** Check if Coolify reports the app as running, and if so mark it live in the DB. Returns true if recovered. */
async function tryRecoverDeployment(
  deploymentId: string, appId: string, coolifyId: string, subdomain: string | undefined
): Promise<boolean> {
  try {
    const { status, fqdn } = await getAppDetails(coolifyId)
    if (status !== 'running' && !status.startsWith('running:')) return false
    const url = resolveUrl(subdomain, fqdn)
    if (!url) return false
    await db.query(
      `UPDATE deployments.deployments SET status = 'live', url = $2, error_message = NULL, completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [deploymentId, url]
    )
    await db.query(`UPDATE marketplace.apps SET iframe_url = $2 WHERE id = $1`, [appId, url])
    logger.info({ msg: 'deploy_recovered', deploymentId, url })
    return true
  } catch (err) {
    logger.warn({ msg: 'deploy_recovery_check_failed', deploymentId, err: String(err) })
    return false
  }
}

/** Poll Coolify every 30s until the app container is running or a terminal failure status is reached. */
async function pollCoolifyUntilRunning(coolifyId: string, deploymentId: string): Promise<void> {
  const deadline = Date.now() + COOLIFY_POLL_TIMEOUT_MS
  const startMs = Date.now()
  let unhealthyCount = 0

  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, COOLIFY_POLL_INTERVAL_MS))
    const { status } = await getAppDetails(coolifyId)
    const elapsed = Math.round((Date.now() - startMs) / 1000)
    logger.info({ msg: 'coolify_poll', deploymentId, coolifyId, coolifyStatus: status })
    await emitEvent(deploymentId, 'build_running', `Build running… ${elapsed}s elapsed`)

    // running:unknown means container is up but no health check configured — treat as success
    if (status === 'running' || status.startsWith('running:')) return
    // exited:unhealthy is common during container startup (health check runs before app is ready)
    // Allow up to 10 retries (5 minutes at 30s intervals) before giving up
    if (status === 'exited:unhealthy') {
      unhealthyCount++
      logger.info({ msg: 'coolify_unhealthy_retry', deploymentId, coolifyId, attempt: unhealthyCount, maxRetries: MAX_UNHEALTHY_RETRIES })
      if (unhealthyCount >= MAX_UNHEALTHY_RETRIES) throw new Error(`Coolify deployment failed with status: ${status}`)
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

export async function preflightCheck(gatewayUrl: string, appId: string): Promise<void> {
  // Validate GATEWAY_URL
  if (!gatewayUrl || gatewayUrl === 'undefined') {
    throw Object.assign(new Error('TERMINAL_AI_GATEWAY_URL is not set or is "undefined"'), {
      code: 'PREFLIGHT_FAILED',
    })
  }

  // Validate APP_ID is UUID format
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_PATTERN.test(appId)) {
    throw Object.assign(new Error(`Invalid TERMINAL_AI_APP_ID format: ${appId}`), {
      code: 'PREFLIGHT_FAILED',
    })
  }

  // Gateway health check
  let res: Response
  try {
    res = await fetch(`${gatewayUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    throw Object.assign(new Error(`Gateway unreachable at ${gatewayUrl}`), {
      code: 'GATEWAY_UNREACHABLE',
    })
  }

  if (!res.ok) {
    throw Object.assign(new Error(`Gateway health check failed: HTTP ${res.status}`), {
      code: 'GATEWAY_UNREACHABLE',
    })
  }
}

/** Shared: run health check, mark live, emit events. */
async function finalizeDeploy(deploymentId: string, appId: string, finalUrl: string): Promise<void> {
  await emitEvent(deploymentId, 'health_check_start', `Checking ${finalUrl}/health`)
  await waitForHealthy(finalUrl)
  await emitEvent(deploymentId, 'health_check_ok', 'Health check passed')

  await db.query(
    `UPDATE deployments.deployments SET status = 'live', url = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [deploymentId, finalUrl]
  )
  await db.query(`UPDATE marketplace.apps SET iframe_url = $2 WHERE id = $1`, [appId, finalUrl])
  await emitEvent(deploymentId, 'deployed', `App is live at ${finalUrl}`)
}

/** Shared: handle deploy/redeploy errors with recovery attempt. */
async function handleDeployError(
  err: unknown, deploymentId: string, appId: string, coolifyId: string | null, subdomain: string | undefined
): Promise<void> {
  const code = (err as { code?: string }).code
  const message = err instanceof Error ? err.message : String(err)
  logger.error({ msg: 'deploy_failed', deploymentId, errorCode: code, err: message })

  if (coolifyId) {
    const recovered = await tryRecoverDeployment(deploymentId, appId, coolifyId, subdomain)
    if (recovered) return
  }

  await failDeployment(deploymentId, code ?? 'COOLIFY_ERROR')
  throw err
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
      await updateDeployment(deploymentId, { status: 'building', started_at: new Date(), retry_count: job.attemptsMade })
      await emitEvent(deploymentId, 'queued', 'Deployment picked up by worker')

      await emitEvent(deploymentId, 'preflight_start', 'Running pre-deployment checks')
      const gatewayUrl = process.env.GATEWAY_URL!
      await preflightCheck(gatewayUrl, appId)
      await emitEvent(deploymentId, 'preflight_ok', 'All pre-deployment checks passed')

      await cloneRepo(githubRepo, tmpPath)

      const scan = await scanForSecrets(tmpPath)
      if (!scan.clean) {
        await failDeployment(deploymentId, 'SECRETS_DETECTED')
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

      await emitEvent(deploymentId, 'creating_app', 'Creating app in Coolify')
      const { uuid: coolifyId, domain: coolifyDomain } = await createApp({
        name: subdomain,
        githubRepo,
        branch,
        port: appPort,
        envVars: {
          TERMINAL_AI_GATEWAY_URL: process.env.GATEWAY_URL!,
          TERMINAL_AI_APP_ID: appId,
        },
        resourceClass: 'micro',
      })

      // Prefer Cloudflare subdomain when DNS is configured; otherwise use the
      // sslip.io domain Coolify auto-generated and returned.
      let finalUrl: string
      if (cloudflareConfigured) {
        finalUrl = `https://${subdomain}.apps.terminalai.studioionique.com`
      } else {
        // Coolify returns fqdn as "http://..." — normalize to ensure it has a protocol
        const rawDomain = coolifyDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
        // sslip.io domains use HTTP by default (Coolify doesn't provision SSL for them)
        finalUrl = rawDomain ? `http://${rawDomain}` : ''
        if (!finalUrl) {
          // Fetch the domain from Coolify API as a fallback
          const details = await getAppDetails(coolifyId)
          const fqdn = details.fqdn?.replace(/^https?:\/\//, '').replace(/\/$/, '')
          finalUrl = fqdn ? `http://${fqdn}` : ''
        }
        if (!finalUrl) {
          throw new Error('No domain returned by Coolify — cannot determine app URL')
        }
      }

      // Store Coolify app ID immediately so status checks can reference it
      await db.query(
        `UPDATE deployments.deployments SET coolify_app_id = $2, updated_at = NOW() WHERE id = $1`,
        [deploymentId, coolifyId]
      )

      await emitEvent(deploymentId, 'build_start', 'Triggering build in Coolify')
      await triggerDeploy(coolifyId)

      // Wait for Coolify to finish building and start the container
      await pollCoolifyUntilRunning(coolifyId, deploymentId)
      await emitEvent(deploymentId, 'build_ok', 'Build completed successfully')

      await finalizeDeploy(deploymentId, appId, finalUrl)
      logger.info({ msg: 'deploy_complete', deploymentId, subdomain, url: finalUrl })
    } catch (err: unknown) {
      const coolifyAppRow = await db.query<{ coolify_app_id: string | null; subdomain: string }>(
        `SELECT coolify_app_id, subdomain FROM deployments.deployments WHERE id = $1`,
        [deploymentId]
      )
      await handleDeployError(err, deploymentId, appId, coolifyAppRow.rows[0]?.coolify_app_id ?? null, coolifyAppRow.rows[0]?.subdomain)
    } finally {
      // Always clean up the cloned repo to avoid filling disk
      await rm(tmpPath, { recursive: true, force: true }).catch(() => undefined)
    }
  }, { connection: redisConnection, concurrency: 3 })
}

/** Worker that polls an existing Coolify app after a redeploy trigger. */
export function startPollWorker(): Worker {
  return new Worker('poll-existing', async (job) => {
    const { deploymentId, appId, coolifyId, subdomain } = job.data as {
      deploymentId: string; appId: string; coolifyId: string; subdomain: string
    }

    try {
      await emitEvent(deploymentId, 'build_start', 'Redeploy triggered, waiting for build')
      await pollCoolifyUntilRunning(coolifyId, deploymentId)
      await emitEvent(deploymentId, 'build_ok', 'Build completed successfully')

      const details = await getAppDetails(coolifyId)
      const finalUrl = resolveUrl(subdomain, details.fqdn)
      if (!finalUrl) throw new Error('No domain found for redeployed app')

      await finalizeDeploy(deploymentId, appId, finalUrl)
      logger.info({ msg: 'redeploy_complete', deploymentId, url: finalUrl })
    } catch (err: unknown) {
      await handleDeployError(err, deploymentId, appId, coolifyId, subdomain)
    }
  }, { connection: redisConnection, concurrency: 3 })
}
