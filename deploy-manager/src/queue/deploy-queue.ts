import { Queue, Worker } from 'bullmq'
import { readFile, rm } from 'fs/promises'
import { randomBytes } from 'crypto'
import pg from 'pg'
import { scanForSecrets } from '../services/gitleaks'
import { createApp, triggerDeploy, getAppDetails, waitForHealthy, updateAppFqdn } from '../services/coolify'
import { createSubdomain } from '../services/dns'
import { db } from '../lib/db'
import { logger } from '../lib/logger'
import { emitEvent, ERROR_MESSAGES } from '../lib/deployment-events'
import { decryptValue } from '../lib/env-crypto'

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

async function failDeployment(deploymentId: string, errorCode: string, messageOverride?: string): Promise<void> {
  const message = messageOverride ?? ERROR_MESSAGES[errorCode] ?? errorCode
  await updateDeployment(deploymentId, { status: 'failed', error_message: message, error_code: errorCode, completed_at: new Date() })
    .catch((err: unknown) => logger.error({ msg: 'failed_to_update_deployment_status', deploymentId, err: String(err) }))
  await emitEvent(deploymentId, 'failed', message, { error_code: errorCode })
}

/** Provision a Postgres schema and role for an app. Idempotent — skips if already provisioned. */
async function provisionAppDb(appId: string): Promise<{ schemaName: string; roleName: string; rolePassword: string }> {
  const shortId = appId.replaceAll('-', '_')
  const schemaName = `app_data_${shortId}`
  const roleName = `app_${shortId}`

  const { rows } = await db.query<{ app_id: string; role_password: string | null }>(
    `SELECT app_id, role_password FROM deployments.app_db_provisions WHERE app_id = $1`,
    [appId],
  )
  if (rows[0]) {
    logger.info({ msg: 'app_db_already_provisioned', appId, schemaName })
    // role_password may be NULL for provisions created before migration 016.
    // In that case generate and persist a new password so migrations can use the scoped role.
    if (rows[0].role_password) {
      // Ensure CREATE privilege exists (backfill for provisions created before this fix)
      const fixPool = new pg.Pool({ connectionString: process.env.DATABASE_URL! })
      const fixClient = await fixPool.connect()
      try {
        await fixClient.query(`GRANT CREATE ON SCHEMA "${schemaName}" TO "${roleName}"`)
      } catch (grantErr) {
        logger.warn({ msg: 'grant_create_backfill_failed', schemaName, roleName, err: String(grantErr) })
      } finally {
        fixClient.release()
        await fixPool.end()
      }
      return { schemaName, roleName, rolePassword: rows[0].role_password }
    }
    const freshPassword = randomBytes(24).toString('base64url')
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! })
    const client = await pool.connect()
    try {
      await client.query(`ALTER ROLE "${roleName}" PASSWORD '${freshPassword}'`)
      // Ensure CREATE privilege exists (backfill for provisions created before this fix)
      await client.query(`GRANT CREATE ON SCHEMA "${schemaName}" TO "${roleName}"`)
      await db.query(
        `UPDATE deployments.app_db_provisions SET role_password = $2 WHERE app_id = $1`,
        [appId, freshPassword],
      )
    } finally {
      client.release()
      await pool.end()
    }
    logger.info({ msg: 'app_db_password_backfilled', appId, schemaName, roleName })
    return { schemaName, roleName, rolePassword: freshPassword }
  }

  const password = randomBytes(24).toString('base64url')
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! })
  const client = await pool.connect()
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${roleName}') THEN
          CREATE ROLE "${roleName}" LOGIN PASSWORD '${password}';
        END IF;
      END
      $$;
    `)
    await client.query(`GRANT USAGE ON SCHEMA "${schemaName}" TO "${roleName}"`)
    await client.query(`GRANT CREATE ON SCHEMA "${schemaName}" TO "${roleName}"`)
    await client.query(`
      ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}"
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${roleName}"
    `)
    await client.query(
      `INSERT INTO deployments.app_db_provisions (app_id, schema_name, role_name, role_password)
       VALUES ($1, $2, $3, $4) ON CONFLICT (app_id) DO NOTHING`,
      [appId, schemaName, roleName, password],
    )
  } finally {
    client.release()
    await pool.end()
  }

  logger.info({ msg: 'app_db_provisioned', appId, schemaName, roleName })
  return { schemaName, roleName, rolePassword: password }
}

/**
 * Build a connection string for the scoped app role by re-using the host/port/dbname
 * from DATABASE_URL but substituting the app role credentials.
 */
function buildScopedConnectionString(roleName: string, rolePassword: string): string {
  const base = new URL(process.env.DATABASE_URL!)
  const scoped = new URL(base.href)
  scoped.username = roleName
  scoped.password = rolePassword
  return scoped.toString()
}

async function fetchCreatorEnvVars(appId: string): Promise<Record<string, string>> {
  const { rows } = await db.query<{ key: string; value_enc: string; iv: string }>(
    `SELECT key, value_enc, iv FROM deployments.app_env_vars WHERE app_id = $1`,
    [appId],
  )
  const result: Record<string, string> = {}
  for (const row of rows) {
    try {
      result[row.key] = decryptValue(row.value_enc, row.iv)
    } catch (err) {
      logger.warn({ msg: 'env_var_decrypt_failed', appId, key: row.key, err: String(err) })
    }
  }
  return result
}

/** Run db-migrations.sql from the cloned repo against the app's schema.
 *  Connects as the scoped app role (not the privileged DATABASE_URL user).
 *  The migration runs inside a single transaction — rolled back on any error.
 *  No-op if db-migrations.sql is absent. */
async function runMigrations(
  repoPath: string,
  schemaName: string,
  roleName: string,
  rolePassword: string,
): Promise<void> {
  let sql: string
  try {
    sql = await readFile(`${repoPath}/db-migrations.sql`, 'utf-8')
  } catch {
    // File absent — nothing to migrate
    return
  }

  const connectionString = buildScopedConnectionString(roleName, rolePassword)
  const pool = new pg.Pool({ connectionString })
  const client = await pool.connect()
  try {
    // Belt-and-suspenders: restrict search_path even though the role only has
    // USAGE on its own schema. This prevents accidental cross-schema references.
    await client.query(`SET search_path TO "${schemaName}"`)
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')
    logger.info({ msg: 'migrations_applied', schemaName })
  } catch (err) {
    await client.query('ROLLBACK').catch((rollbackErr: unknown) =>
      logger.warn({ msg: 'migration_rollback_failed', schemaName, err: String(rollbackErr) })
    )
    logger.error({ msg: 'migration_failed', schemaName, err: String(err) })
    const detail = err instanceof Error ? err.message : String(err)
    throw Object.assign(new Error(`MIGRATION_FAILED: ${detail}`), { code: 'MIGRATION_FAILED', detail })
  } finally {
    client.release()
    await pool.end()
  }
}

function resolveUrl(subdomain: string | undefined, fqdn: string | null): string {
  // Wildcard DNS *.apps.terminalai.studioionique.com is pre-configured in Cloudflare.
  // We only need VPS2_IP to know the DNS target exists — no API token needed for URL resolution.
  if (process.env.VPS2_IP && subdomain) {
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
        const findingLines = scan.findings.slice(0, 15).join('\n') || 'No detail available'
        await emitEvent(
          deploymentId,
          'secrets_scan_failed',
          `Secrets detected in repository — remove committed credentials and redeploy.\n\nFindings:\n${findingLines}`,
        )
        await failDeployment(deploymentId, 'SECRETS_DETECTED')
        throw new Error('Secrets detected in repository')
      }

      // Provision app DB schema and run migrations
      await emitEvent(deploymentId, 'provisioning', 'Setting up app database...')
      const { schemaName, roleName, rolePassword } = await provisionAppDb(appId).catch(async (err) => {
        logger.error({ msg: 'provision_failed', deploymentId, err: String(err) })
        await failDeployment(deploymentId, 'PROVISION_FAILED')
        throw err
      })

      await emitEvent(deploymentId, 'migrating', 'Running database migrations...')
      await runMigrations(tmpPath, schemaName, roleName, rolePassword).catch(async (err) => {
        const detail = (err as { detail?: string }).detail
        const baseMessage = ERROR_MESSAGES['MIGRATION_FAILED'] ?? 'Database migration failed.'
        const message = detail ? `${baseMessage} ${detail}` : baseMessage
        await failDeployment(deploymentId, 'MIGRATION_FAILED', message)
        throw err
      })

      // Read port from the app's own config (3000 for Next.js, 8000 for Python/Streamlit)
      const appPort = await readAppPort(tmpPath)

      // DNS record creation is optional — wildcard *.apps.terminalai.studioionique.com handles routing.
      // Only create individual records if Cloudflare API is fully configured.
      const cloudflareApiConfigured = !!(process.env.CLOUDFLARE_TOKEN && process.env.CLOUDFLARE_ZONE_ID && process.env.VPS2_IP)
      if (cloudflareApiConfigured) {
        const dnsRecordId = await createSubdomain(subdomain)
        await db.query(
          `UPDATE deployments.deployments SET dns_record_id = $2, updated_at = NOW() WHERE id = $1`,
          [deploymentId, dnsRecordId]
        )
      } else {
        logger.info({ msg: 'dns_record_skipped', deploymentId, reason: 'Wildcard DNS handles routing; Cloudflare API not configured for individual records' })
      }

      // Fetch creator-defined env vars (system vars always win)
      const creatorEnvVars = await fetchCreatorEnvVars(appId).catch((err: unknown) => {
        logger.warn({ msg: 'creator_env_vars_fetch_failed', appId, err: String(err) })
        return {}
      })

      const envVars = {
        ...creatorEnvVars,  // creator vars first (lower priority)
        TERMINAL_AI_GATEWAY_URL: process.env.GATEWAY_PUBLIC_URL || process.env.GATEWAY_URL!,
        TERMINAL_AI_APP_ID: appId,
        APP_DB_SCHEMA: schemaName,
        TERMINAL_AI_STORAGE_PREFIX: `apps/${appId}/`,
      }

      await emitEvent(deploymentId, 'creating_app', 'Creating app in Coolify')
      const { uuid: coolifyId, domain: coolifyDomain } = await createApp({
        name: subdomain,
        githubRepo,
        branch,
        port: appPort,
        envVars,
        resourceClass: 'micro',
      })

      // Always prefer the proper HTTPS subdomain when VPS2 is configured (wildcard DNS handles it).
      // Fall back to sslip.io only if VPS2_IP is not set at all.
      let finalUrl: string = resolveUrl(subdomain, coolifyDomain)
      if (!finalUrl) {
        const details = await getAppDetails(coolifyId)
        finalUrl = resolveUrl(subdomain, details.fqdn)
      }
      if (!finalUrl) {
        throw new Error('No domain returned by Coolify — cannot determine app URL')
      }

      // Update Coolify's FQDN so Traefik routes the proper domain to this container
      if (process.env.VPS2_IP && subdomain) {
        await updateAppFqdn(coolifyId, `https://${subdomain}.apps.terminalai.studioionique.com`)
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
