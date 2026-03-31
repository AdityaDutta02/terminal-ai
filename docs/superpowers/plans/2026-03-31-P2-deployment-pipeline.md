# P2 — Deployment Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the deployment pipeline with structured event logging, retry/backoff, resource limits, and health checks; then build a Vercel-class deployment management UX.

**Architecture:** Two phases — P2 adds a `deployments.deployment_events` table and rewrites the BullMQ worker to emit structured lifecycle events; P2.5 adds the creator-facing deployment list/detail pages with real-time SSE streaming.

**Tech Stack:** Hono (deploy-manager), BullMQ, PostgreSQL (`deployments` schema), Next.js 15 App Router (platform frontend), SSE for real-time logs.

---

### Task 1: Migration — deployment_events table + new columns

**Files:**
- Create: `platform/lib/db/migrations/012_deployments_v2.sql`

- [ ] **Step 1: Write the migration**

```sql
-- platform/lib/db/migrations/012_deployments_v2.sql

-- Extend deployments.deployments with new tracking columns
ALTER TABLE deployments.deployments
  ADD COLUMN IF NOT EXISTS log_lines JSONB[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS resource_class TEXT NOT NULL DEFAULT 'micro';

-- Deployment events timeline
CREATE TABLE IF NOT EXISTS deployments.deployment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID NOT NULL REFERENCES deployments.deployments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  -- queued, preflight_start, preflight_ok, preflight_failed,
  -- build_start, build_ok, build_failed,
  -- health_check_start, health_check_ok, health_check_failed,
  -- deployed, failed, retrying, cancelled
  message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS deployment_events_deployment_id_idx
  ON deployments.deployment_events(deployment_id, created_at);
```

- [ ] **Step 2: Apply the migration**

```bash
psql $DATABASE_URL -f platform/lib/db/migrations/012_deployments_v2.sql
```

Expected output: `ALTER TABLE`, `CREATE TABLE`, `CREATE INDEX` (no errors).

- [ ] **Step 3: Commit**

```bash
git add platform/lib/db/migrations/012_deployments_v2.sql
git commit -m "feat(db): add deployment_events table and tracking columns (P2)"
```

---

### Task 2: deploy-manager — emitEvent helper + error constants

**Files:**
- Create: `deploy-manager/src/lib/deployment-events.ts`

- [ ] **Step 1: Write the failing test**

Create `deploy-manager/src/lib/deployment-events.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/db', () => ({
  db: { query: vi.fn().mockResolvedValue({ rows: [] }) }
}))

import { emitEvent, ERROR_MESSAGES } from './deployment-events'
import { db } from '../lib/db'

describe('emitEvent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('inserts into deployment_events and updates log_lines', async () => {
    await emitEvent('dep-123', 'queued', 'Deployment queued')
    expect(db.query).toHaveBeenCalledTimes(2)
    const [firstCall] = (db.query as ReturnType<typeof vi.fn>).mock.calls
    expect(firstCall[0]).toContain('INSERT INTO deployments.deployment_events')
    expect(firstCall[1]).toContain('dep-123')
    expect(firstCall[1]).toContain('queued')
  })

  it('includes metadata when provided', async () => {
    await emitEvent('dep-123', 'build_failed', 'Build error', { code: 'BUILD_FAILED' })
    const [firstCall] = (db.query as ReturnType<typeof vi.fn>).mock.calls
    expect(firstCall[1][3]).toContain('BUILD_FAILED')
  })
})

describe('ERROR_MESSAGES', () => {
  it('has entries for all expected error codes', () => {
    const codes = ['PREFLIGHT_FAILED', 'BUILD_FAILED', 'HEALTH_CHECK_FAILED', 'GATEWAY_UNREACHABLE', 'COOLIFY_ERROR', 'TIMEOUT', 'SECRETS_DETECTED']
    for (const code of codes) {
      expect(ERROR_MESSAGES[code]).toBeTruthy()
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd deploy-manager && npx vitest run src/lib/deployment-events.test.ts
```

Expected: FAIL — cannot find module `./deployment-events`.

- [ ] **Step 3: Implement deployment-events.ts**

```typescript
// deploy-manager/src/lib/deployment-events.ts
import { db } from './db'
import { logger } from './logger'

export const ERROR_MESSAGES: Record<string, string> = {
  PREFLIGHT_FAILED: 'Pre-deployment checks failed. Check GATEWAY_URL configuration.',
  BUILD_FAILED: 'Application build failed. Check your Dockerfile or build command.',
  HEALTH_CHECK_FAILED: 'App deployed but did not pass health check within 2 minutes.',
  GATEWAY_UNREACHABLE: 'Terminal AI gateway is unreachable. Platform issue.',
  COOLIFY_ERROR: 'Coolify API returned an error. See logs for details.',
  TIMEOUT: 'Deployment timed out after 5 minutes.',
  SECRETS_DETECTED: 'Secret credentials detected in repository. Remove them before deploying.',
}

export async function emitEvent(
  deploymentId: string,
  eventType: string,
  message: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO deployments.deployment_events (deployment_id, event_type, message, metadata)
       VALUES ($1, $2, $3, $4)`,
      [deploymentId, eventType, message, metadata ? JSON.stringify(metadata) : null]
    )
    await db.query(
      `UPDATE deployments.deployments
       SET log_lines = log_lines || $2::jsonb, updated_at = NOW()
       WHERE id = $1`,
      [deploymentId, JSON.stringify({ ts: new Date().toISOString(), level: 'info', msg: message })]
    )
  } catch (err) {
    // Non-fatal — log but don't interrupt the deploy
    logger.warn({ msg: 'emit_event_failed', deploymentId, eventType, err: String(err) })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd deploy-manager && npx vitest run src/lib/deployment-events.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add deploy-manager/src/lib/deployment-events.ts deploy-manager/src/lib/deployment-events.test.ts
git commit -m "feat(deploy-manager): add emitEvent helper and error constants"
```

---

### Task 3: deploy-manager — update createApp with resource limits

**Files:**
- Modify: `deploy-manager/src/services/coolify.ts`

- [ ] **Step 1: Write the failing test**

Add to `deploy-manager/src/services/coolify.test.ts` (create if absent):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

global.fetch = vi.fn()

import { createApp } from './coolify'

describe('createApp resource limits', () => {
  beforeEach(() => {
    process.env.COOLIFY_URL = 'http://coolify'
    process.env.COOLIFY_TOKEN = 'token'
    process.env.COOLIFY_SERVER_UUID = 'srv-uuid'
    process.env.COOLIFY_PROJECT_UUID = 'proj-uuid'
    vi.clearAllMocks()
  })

  it('sends limits_memory and limits_cpus for micro class', async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>
    mockFetch
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(JSON.stringify({ uuid: 'app-uuid', fqdn: 'http://app.sslip.io' })) })
      .mockResolvedValue({ ok: true, text: () => Promise.resolve('{}') })

    await createApp({ name: 'test', githubRepo: 'user/repo', branch: 'main', port: 3000, envVars: {}, resourceClass: 'micro' })

    const [, init] = mockFetch.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.limits_memory).toBe('512m')
    expect(body.limits_cpus).toBe('0.5')
  })

  it('uses small class limits when specified', async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>
    mockFetch
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(JSON.stringify({ uuid: 'app-uuid', fqdn: 'http://app.sslip.io' })) })
      .mockResolvedValue({ ok: true, text: () => Promise.resolve('{}') })

    await createApp({ name: 'test', githubRepo: 'user/repo', branch: 'main', port: 3000, envVars: {}, resourceClass: 'small' })

    const [, init] = mockFetch.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.limits_memory).toBe('1g')
    expect(body.limits_cpus).toBe('1.0')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd deploy-manager && npx vitest run src/services/coolify.test.ts
```

Expected: FAIL — `resourceClass` property not accepted.

- [ ] **Step 3: Update coolify.ts**

```typescript
// deploy-manager/src/services/coolify.ts
import { logger } from '../lib/logger'

function coolifyConfig() {
  const url = process.env.COOLIFY_URL
  const token = process.env.COOLIFY_TOKEN
  const serverUuid = process.env.COOLIFY_SERVER_UUID
  const projectUuid = process.env.COOLIFY_PROJECT_UUID
  if (!url || !token) throw new Error('COOLIFY_URL and COOLIFY_TOKEN must be set')
  if (!serverUuid || !projectUuid) throw new Error('COOLIFY_SERVER_UUID and COOLIFY_PROJECT_UUID must be set')
  return { url, token, serverUuid, projectUuid }
}

export type ResourceClass = 'micro' | 'small' | 'medium'

const RESOURCE_LIMITS: Record<ResourceClass, { memory: string; cpus: string }> = {
  micro:  { memory: '512m', cpus: '0.5' },
  small:  { memory: '1g',   cpus: '1.0' },
  medium: { memory: '2g',   cpus: '2.0' },
}

interface DeployResult {
  deploymentId: string
  status: string
}

export async function triggerDeploy(coolifyAppId: string): Promise<DeployResult> {
  const { url, token } = coolifyConfig()
  const res = await fetch(`${url}/api/v1/deploy?uuid=${coolifyAppId}&force=false`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Coolify deploy failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<DeployResult>
}

export async function deleteApp(coolifyAppId: string): Promise<void> {
  const { url, token } = coolifyConfig()
  const res = await fetch(
    `${url}/api/v1/applications/${coolifyAppId}?deleteConfigurations=true&deleteVolumes=true&dockerCleanup=true&deleteConnectedNetworks=true`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok && res.status !== 404) {
    throw new Error(`Coolify delete failed: ${res.status} ${await res.text()}`)
  }
}

export async function getAppDetails(coolifyAppId: string): Promise<{ status: string; fqdn: string | null }> {
  const { url, token } = coolifyConfig()
  const res = await fetch(`${url}/api/v1/applications/${coolifyAppId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Coolify app details failed: ${res.status}`)
  const data = await res.json() as { status: string; fqdn?: string | null }
  return { status: data.status, fqdn: data.fqdn ?? null }
}

async function setEnvVar(coolifyAppId: string, key: string, value: string): Promise<void> {
  const { url, token } = coolifyConfig()
  const res = await fetch(`${url}/api/v1/applications/${coolifyAppId}/envs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value, is_preview: false }),
  })
  if (!res.ok) throw new Error(`Coolify set env ${key} failed: ${res.status} ${await res.text()}`)
}

export interface CreateAppResult {
  uuid: string
  domain: string
}

export async function createApp(params: {
  name: string
  githubRepo: string
  branch: string
  port: number
  envVars: Record<string, string>
  resourceClass?: ResourceClass
}): Promise<CreateAppResult> {
  const { url, token, serverUuid, projectUuid } = coolifyConfig()
  const limits = RESOURCE_LIMITS[params.resourceClass ?? 'micro']
  const createBody = {
    name: params.name,
    git_repository: `https://github.com/${params.githubRepo}`,
    git_branch: params.branch,
    build_pack: 'dockerfile',
    ports_exposes: String(params.port),
    server_uuid: serverUuid,
    project_uuid: projectUuid,
    environment_name: 'production',
    instant_deploy: false,
    limits_memory: limits.memory,
    limits_cpus: limits.cpus,
  }
  const res = await fetch(`${url}/api/v1/applications/public`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(createBody),
  })
  const rawBody = await res.text()
  if (!res.ok) throw new Error(`Coolify create failed: ${res.status} ${rawBody}`)
  let data: Record<string, unknown>
  try {
    data = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    throw new Error(`Coolify create returned non-JSON: ${rawBody}`)
  }
  logger.info({ msg: 'coolify_create_response', name: params.name, body: data })
  const uuid = typeof data['uuid'] === 'string' ? data['uuid'] : undefined
  if (!uuid) throw new Error(`Coolify create returned no uuid. Full response: ${rawBody}`)
  const domain = (data['fqdn'] ?? data['domains'] ?? data['url'] ?? '') as string
  logger.info({ msg: 'coolify_app_created', name: params.name, uuid, domain })
  for (const [key, value] of Object.entries(params.envVars)) {
    await setEnvVar(uuid, key, value)
  }
  return { uuid, domain }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd deploy-manager && npx vitest run src/services/coolify.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add deploy-manager/src/services/coolify.ts deploy-manager/src/services/coolify.test.ts
git commit -m "feat(coolify): resource limits per class (micro/small/medium)"
```

---

### Task 4: deploy-manager — rewrite deploy-queue with event emission + health check

**Files:**
- Modify: `deploy-manager/src/queue/deploy-queue.ts`

- [ ] **Step 1: Rewrite deploy-queue.ts**

Replace the entire file:

```typescript
// deploy-manager/src/queue/deploy-queue.ts
import { Queue, Worker } from 'bullmq'
import { readFile, rm } from 'fs/promises'
import { scanForSecrets } from '../services/gitleaks'
import { createApp, triggerDeploy, getAppDetails } from '../services/coolify'
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

// BullMQ job options: 3 attempts with exponential backoff (10s, 20s, 40s)
const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: false,
  removeOnFail: false,
}

const GITHUB_REPO_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/
const COOLIFY_POLL_INTERVAL_MS = 10_000
const COOLIFY_POLL_TIMEOUT_MS = 5 * 60 * 1000  // 5 min
const HEALTH_CHECK_TIMEOUT_MS = 2 * 60 * 1000   // 2 min

async function cloneRepo(githubRepo: string, dest: string): Promise<void> {
  if (!GITHUB_REPO_RE.test(githubRepo)) throw new Error(`Invalid githubRepo format: ${githubRepo}`)
  const { execFile } = await import('child_process')
  const { promisify } = await import('util')
  const execFileAsync = promisify(execFile)
  await execFileAsync('git', ['clone', '--depth=1', `https://github.com/${githubRepo}`, dest])
}

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
  const setClauses = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ')
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

/** Poll Coolify every 10s until running or timeout (5 min). */
async function waitForCoolifyBuild(coolifyId: string, deploymentId: string): Promise<void> {
  const deadline = Date.now() + COOLIFY_POLL_TIMEOUT_MS
  let unhealthyCount = 0
  const startMs = Date.now()

  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, COOLIFY_POLL_INTERVAL_MS))
    const { status } = await getAppDetails(coolifyId)
    const elapsed = Math.round((Date.now() - startMs) / 1000)
    logger.info({ msg: 'coolify_poll', deploymentId, coolifyId, coolifyStatus: status })
    await emitEvent(deploymentId, 'build_running', `Build running… ${elapsed}s elapsed`)

    if (status === 'running' || status.startsWith('running:')) return
    if (status === 'exited:unhealthy') {
      unhealthyCount++
      if (unhealthyCount >= 3) throw Object.assign(new Error('Build failed'), { code: 'BUILD_FAILED' })
      continue
    }
    const isTerminal = ['exited', 'failed', 'error', 'degraded'].some(
      (s) => status === s || status.startsWith(s + ':')
    )
    if (isTerminal) throw Object.assign(new Error(`Build failed: ${status}`), { code: 'BUILD_FAILED' })
  }
  throw Object.assign(new Error('Deployment timed out'), { code: 'TIMEOUT' })
}

/** Poll health check endpoint every 10s until 200 or timeout (2 min). */
async function waitForHealthCheck(appUrl: string, deploymentId: string): Promise<void> {
  const deadline = Date.now() + HEALTH_CHECK_TIMEOUT_MS
  await emitEvent(deploymentId, 'health_check_start', `Checking ${appUrl}/health`)

  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, COOLIFY_POLL_INTERVAL_MS))
    try {
      const res = await fetch(`${appUrl}/health`, { signal: AbortSignal.timeout(5_000) })
      if (res.ok) {
        await emitEvent(deploymentId, 'health_check_ok', 'Health check passed')
        return
      }
    } catch {
      // not ready yet — keep polling
    }
  }
  throw Object.assign(new Error('Health check timed out'), { code: 'HEALTH_CHECK_FAILED' })
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

      // Preflight: check gateway reachability
      await emitEvent(deploymentId, 'preflight_start', 'Running pre-deployment checks')
      const gatewayUrl = process.env.GATEWAY_URL
      if (!gatewayUrl) throw Object.assign(new Error('GATEWAY_URL not set'), { code: 'PREFLIGHT_FAILED' })
      try {
        const res = await fetch(`${gatewayUrl}/health`, { signal: AbortSignal.timeout(5_000) })
        if (!res.ok) throw new Error('Gateway unhealthy')
      } catch {
        throw Object.assign(new Error('Gateway unreachable'), { code: 'GATEWAY_UNREACHABLE' })
      }
      await emitEvent(deploymentId, 'preflight_ok', 'All pre-deployment checks passed')

      // Clone and scan
      await cloneRepo(githubRepo, tmpPath)
      const scan = await scanForSecrets(tmpPath)
      if (!scan.clean) {
        await failDeployment(deploymentId, 'SECRETS_DETECTED')
        throw new Error('Secrets detected in repository')
      }

      const appPort = await readAppPort(tmpPath)

      // Optional DNS
      const cloudflareConfigured = !!(process.env.CLOUDFLARE_TOKEN && process.env.CLOUDFLARE_ZONE_ID && process.env.VPS2_IP)
      if (cloudflareConfigured) {
        const dnsRecordId = await createSubdomain(subdomain)
        await updateDeployment(deploymentId, { dns_record_id: dnsRecordId })
      } else {
        logger.warn({ msg: 'dns_skipped', deploymentId, reason: 'Cloudflare not configured' })
      }

      // Create Coolify app with resource limits
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

      await updateDeployment(deploymentId, { coolify_app_id: coolifyId })

      const finalUrl = cloudflareConfigured
        ? `https://${subdomain}.apps.terminalai.app`
        : coolifyDomain

      // Trigger build
      await emitEvent(deploymentId, 'build_start', 'Triggering build in Coolify')
      await triggerDeploy(coolifyId)
      await emitEvent(deploymentId, 'triggering_build', 'Build triggered, waiting for completion…')

      // Poll build completion
      await waitForCoolifyBuild(coolifyId, deploymentId)
      await emitEvent(deploymentId, 'build_ok', 'Build completed successfully')

      // Health check
      await waitForHealthCheck(finalUrl, deploymentId)

      // Mark deployed
      await updateDeployment(deploymentId, { status: 'live', url: finalUrl, completed_at: new Date() })
      await db.query(`UPDATE marketplace.apps SET iframe_url = $2 WHERE id = $1`, [appId, finalUrl])
      await emitEvent(deploymentId, 'deployed', `App is live at ${finalUrl}`)

      logger.info({ msg: 'deploy_complete', deploymentId, subdomain, url: finalUrl })
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      const message = err instanceof Error ? err.message : String(err)
      logger.error({ msg: 'deploy_failed', deploymentId, errorCode: code, err: message })
      await failDeployment(deploymentId, code ?? 'COOLIFY_ERROR')
      throw err
    } finally {
      await rm(tmpPath, { recursive: true, force: true }).catch(() => undefined)
    }
  }, { connection: redisConnection, concurrency: 3 })
}

// Re-export with JOB_OPTIONS for use in index.ts
export { JOB_OPTIONS }
```

- [ ] **Step 2: Update `deploy-manager/src/index.ts` to use JOB_OPTIONS**

Change line where `deployQueue.add('deploy', body)` is called:

```typescript
// In app.post('/deploy', ...)  — replace:
await deployQueue.add('deploy', body)
// With:
await deployQueue.add('deploy', body, JOB_OPTIONS)
```

Also update the retry endpoint (POST /deployments/:id/retry):
```typescript
await deployQueue.add('deploy', { ... }, JOB_OPTIONS)
```

- [ ] **Step 3: Run existing tests**

```bash
cd deploy-manager && npx vitest run
```

Expected: PASS (gitleaks tests should still pass).

- [ ] **Step 4: Commit**

```bash
git add deploy-manager/src/queue/deploy-queue.ts deploy-manager/src/index.ts
git commit -m "feat(deploy-manager): structured event emission, health check, retry policy (P2)"
```

---

### Task 5: deploy-manager — SSE log streaming endpoint

**Files:**
- Modify: `deploy-manager/src/index.ts`

- [ ] **Step 1: Add SSE streaming and improved logs endpoint to index.ts**

Add after the existing `GET /deployments/:id/logs` route:

```typescript
// Replace existing GET /deployments/:id/logs with structured version
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

// SSE: stream new events for in-progress deployments
app.get('/deployments/:id/logs/stream', async (c) => {
  const id = c.req.param('id')

  // Verify deployment exists
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

        // Check if deployment is in terminal state even if we haven't seen the event yet
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
```

Also add the `ERROR_MESSAGES` import at the top of `index.ts`:
```typescript
import { ERROR_MESSAGES } from './lib/deployment-events'
```

- [ ] **Step 2: Verify the app starts**

```bash
cd deploy-manager && npx tsx src/index.ts &
curl http://localhost:3002/health
```

Expected: `{"status":"ok"}` — no crashes.

Kill the background process after the check.

- [ ] **Step 3: Commit**

```bash
git add deploy-manager/src/index.ts
git commit -m "feat(deploy-manager): structured logs endpoint + SSE streaming (P2)"
```

---

### Task 6: Platform — deployment API routes

**Files:**
- Create: `platform/app/api/creator/apps/[appId]/deployments/route.ts`
- Create: `platform/app/api/creator/deployments/[deploymentId]/route.ts`
- Create: `platform/app/api/creator/deployments/[deploymentId]/events/route.ts`
- Create: `platform/app/api/creator/apps/[appId]/redeploy/route.ts`

- [ ] **Step 1: Create deployment list route**

```typescript
// platform/app/api/creator/apps/[appId]/deployments/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { headers } from 'next/headers'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> }
): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { appId } = await params

  // Verify ownership
  const { rows: appRows } = await db.query(
    `SELECT id FROM marketplace.apps
     WHERE id = $1 AND channel_id IN (
       SELECT id FROM marketplace.channels WHERE owner_user_id = $2
     )`,
    [appId, session.user.id]
  )
  if (appRows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { rows } = await db.query(
    `SELECT id, status, error_code, error_message, started_at, completed_at, retry_count, created_at
     FROM deployments.deployments
     WHERE app_id = $1
     ORDER BY created_at DESC
     LIMIT 20`,
    [appId]
  )

  return NextResponse.json({ deployments: rows })
}
```

- [ ] **Step 2: Create deployment detail route**

```typescript
// platform/app/api/creator/deployments/[deploymentId]/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

const DEPLOY_MANAGER_URL = process.env.DEPLOY_MANAGER_URL ?? 'http://deploy-manager:3002'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ deploymentId: string }> }
): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { deploymentId } = await params
  const res = await fetch(`${DEPLOY_MANAGER_URL}/deployments/${deploymentId}/logs`)
  if (!res.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const data = await res.json()
  return NextResponse.json(data)
}
```

- [ ] **Step 3: Create SSE events proxy route**

```typescript
// platform/app/api/creator/deployments/[deploymentId]/events/route.ts
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

const DEPLOY_MANAGER_URL = process.env.DEPLOY_MANAGER_URL ?? 'http://deploy-manager:3002'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ deploymentId: string }> }
): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { deploymentId } = await params
  const upstream = await fetch(`${DEPLOY_MANAGER_URL}/deployments/${deploymentId}/logs/stream`)
  if (!upstream.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Proxy SSE stream directly
  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
```

- [ ] **Step 4: Create redeploy route**

```typescript
// platform/app/api/creator/apps/[appId]/redeploy/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { headers } from 'next/headers'

const DEPLOY_MANAGER_URL = process.env.DEPLOY_MANAGER_URL ?? 'http://deploy-manager:3002'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> }
): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { appId } = await params

  // Verify ownership
  const { rows: appRows } = await db.query(
    `SELECT id FROM marketplace.apps
     WHERE id = $1 AND channel_id IN (
       SELECT id FROM marketplace.channels WHERE owner_user_id = $2
     )`,
    [appId, session.user.id]
  )
  if (appRows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Get the latest deployment to re-use its params
  const { rows } = await db.query(
    `SELECT id, github_repo, github_branch, subdomain
     FROM deployments.deployments
     WHERE app_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [appId]
  )
  if (rows.length === 0) return NextResponse.json({ error: 'No previous deployment' }, { status: 404 })

  const prev = rows[0] as Record<string, string>
  const res = await fetch(`${DEPLOY_MANAGER_URL}/deployments/${prev['id']}/retry`, { method: 'POST' })
  if (!res.ok) return NextResponse.json({ error: 'Redeploy failed' }, { status: 500 })

  const data = await res.json() as Record<string, unknown>
  return NextResponse.json(data)
}
```

- [ ] **Step 5: Commit**

```bash
git add platform/app/api/creator/apps/[appId]/deployments/ \
        platform/app/api/creator/deployments/ \
        platform/app/api/creator/apps/[appId]/redeploy/
git commit -m "feat(platform): deployment list, detail, events, and redeploy API routes (P2.5)"
```

---

### Task 7: Platform — deployment list page (creator)

**Files:**
- Create: `platform/app/creator/apps/[appId]/deployments/page.tsx`
- Create: `platform/app/creator/apps/[appId]/deployments/deployment-list.tsx`

- [ ] **Step 1: Create the page**

```typescript
// platform/app/creator/apps/[appId]/deployments/page.tsx
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { DeploymentList } from './deployment-list'

export default async function DeploymentsPage({
  params,
}: {
  params: Promise<{ appId: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')

  const { appId } = await params

  const { rows: appRows } = await db.query(
    `SELECT a.id, a.name FROM marketplace.apps a
     WHERE a.id = $1 AND a.channel_id IN (
       SELECT id FROM marketplace.channels WHERE owner_user_id = $2
     )`,
    [appId, session.user.id]
  )
  if (appRows.length === 0) redirect('/creator')

  const app = appRows[0] as { id: string; name: string }

  const { rows: deployments } = await db.query(
    `SELECT id, status, error_code, started_at, completed_at, retry_count, created_at
     FROM deployments.deployments
     WHERE app_id = $1
     ORDER BY created_at DESC LIMIT 20`,
    [appId]
  )

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          <a href="/creator" className="hover:underline">Creator</a>
          {' › '}
          <a href={`/creator/apps/${appId}`} className="hover:underline">{app.name}</a>
          {' › '}
          Deployments
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{app.name} — Deployments</h1>
      </div>
      <DeploymentList
        appId={appId}
        initialDeployments={deployments as Array<Record<string, string | null>>}
      />
    </div>
  )
}
```

- [ ] **Step 2: Create the client component**

```typescript
// platform/app/creator/apps/[appId]/deployments/deployment-list.tsx
'use client'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'

type Deployment = {
  id: string
  status: string
  error_code: string | null
  started_at: string | null
  completed_at: string | null
  retry_count: number
  created_at: string
}

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-gray-400',
  building: 'bg-amber-400 animate-pulse',
  live: 'bg-green-500',
  failed: 'bg-red-500',
  suspended: 'bg-gray-400',
}

function durationStr(start: string | null, end: string | null): string {
  if (!start) return '—'
  const startMs = new Date(start).getTime()
  const endMs = end ? new Date(end).getTime() : Date.now()
  const secs = Math.round((endMs - startMs) / 1000)
  return secs < 60 ? `${secs}s` : `${Math.round(secs / 60)}m ${secs % 60}s`
}

export function DeploymentList({
  appId,
  initialDeployments,
}: {
  appId: string
  initialDeployments: Array<Record<string, string | null>>
}) {
  const deployments = initialDeployments as Deployment[]

  if (deployments.length === 0) {
    return (
      <div className="rounded border border-dashed border-border py-12 text-center text-muted-foreground">
        No deployments yet.
      </div>
    )
  }

  return (
    <div className="rounded border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Started</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Duration</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Retries</th>
            <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {deployments.map((dep, i) => (
            <tr key={dep.id} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT[dep.status] ?? 'bg-gray-400'}`} />
                  <span className="capitalize">{dep.status}</span>
                  {dep.error_code && (
                    <span className="text-xs text-destructive font-mono">{dep.error_code}</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {dep.started_at
                  ? formatDistanceToNow(new Date(dep.started_at), { addSuffix: true })
                  : '—'}
              </td>
              <td className="px-4 py-3 font-mono text-xs">
                {durationStr(dep.started_at, dep.completed_at)}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{dep.retry_count}</td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/creator/apps/${appId}/deployments/${dep.id}`}
                  className="text-primary hover:underline"
                >
                  View logs
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add platform/app/creator/apps/[appId]/deployments/
git commit -m "feat(platform): deployment list page (P2.5)"
```

---

### Task 8: Platform — deployment detail page with live log streaming

**Files:**
- Create: `platform/app/creator/apps/[appId]/deployments/[deploymentId]/page.tsx`
- Create: `platform/app/creator/apps/[appId]/deployments/[deploymentId]/deployment-detail.tsx`

- [ ] **Step 1: Create the page**

```typescript
// platform/app/creator/apps/[appId]/deployments/[deploymentId]/page.tsx
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { DeploymentDetail } from './deployment-detail'

const DEPLOY_MANAGER_URL = process.env.DEPLOY_MANAGER_URL ?? 'http://deploy-manager:3002'

export default async function DeploymentDetailPage({
  params,
}: {
  params: Promise<{ appId: string; deploymentId: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')

  const { appId, deploymentId } = await params

  const res = await fetch(`${DEPLOY_MANAGER_URL}/deployments/${deploymentId}/logs`, {
    cache: 'no-store',
  })
  if (!res.ok) redirect(`/creator/apps/${appId}/deployments`)

  const data = await res.json() as {
    deployment: Record<string, string | null | number>
    events: Array<Record<string, string | null>>
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          <a href="/creator" className="hover:underline">Creator</a>
          {' › '}
          <a href={`/creator/apps/${appId}`} className="hover:underline">{data.deployment['app_name'] as string}</a>
          {' › '}
          <a href={`/creator/apps/${appId}/deployments`} className="hover:underline">Deployments</a>
          {' › '}
          <span className="font-mono text-xs">{deploymentId.slice(0, 8)}</span>
        </p>
      </div>
      <DeploymentDetail
        appId={appId}
        deploymentId={deploymentId}
        initialData={data}
      />
    </div>
  )
}
```

- [ ] **Step 2: Create the live-streaming client component**

```typescript
// platform/app/creator/apps/[appId]/deployments/[deploymentId]/deployment-detail.tsx
'use client'
import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'

type DeploymentEvent = {
  id: string
  event_type: string
  message: string
  metadata: Record<string, unknown> | null
  created_at: string
}

type DeploymentInfo = {
  id: string
  status: string
  error_code: string | null
  error_message: string | null
  app_name: string
  started_at: string | null
  completed_at: string | null
  retry_count: number
}

const EVENT_ICONS: Record<string, string> = {
  queued: '⏳',
  preflight_start: '🔍',
  preflight_ok: '✓',
  preflight_failed: '✗',
  creating_app: '🔧',
  build_start: '🔨',
  triggering_build: '🚀',
  build_running: '⚙',
  build_ok: '✓',
  build_failed: '✗',
  health_check_start: '🏥',
  health_check_ok: '✓',
  health_check_failed: '✗',
  deployed: '🟢',
  failed: '🔴',
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-muted-foreground',
  building: 'text-amber-500',
  live: 'text-green-500',
  failed: 'text-destructive',
  suspended: 'text-muted-foreground',
}

export function DeploymentDetail({
  appId,
  deploymentId,
  initialData,
}: {
  appId: string
  deploymentId: string
  initialData: { deployment: Record<string, string | null | number>; events: Array<Record<string, string | null>> }
}) {
  const dep = initialData.deployment as unknown as DeploymentInfo
  const [events, setEvents] = useState<DeploymentEvent[]>(
    initialData.events as unknown as DeploymentEvent[]
  )
  const [status, setStatus] = useState(dep.status)
  const isTerminal = status === 'live' || status === 'failed'

  // Stream events if deployment is still building
  useEffect(() => {
    if (isTerminal) return

    const evtSource = new EventSource(
      `/api/creator/deployments/${deploymentId}/events`
    )

    evtSource.onmessage = (e) => {
      const event = JSON.parse(e.data as string) as DeploymentEvent
      setEvents((prev) => {
        if (prev.find((p) => p.id === event.id)) return prev
        return [...prev, event]
      })
      if (event.event_type === 'deployed') setStatus('live')
      if (event.event_type === 'failed') setStatus('failed')
    }

    evtSource.onerror = () => evtSource.close()

    return () => evtSource.close()
  }, [deploymentId, isTerminal])

  return (
    <div className="space-y-6">
      {/* Status header */}
      <div className="flex items-center justify-between rounded border border-border p-4">
        <div>
          <p className="text-sm text-muted-foreground">Deployment</p>
          <p className="font-mono text-sm">{deploymentId}</p>
        </div>
        <div className="text-right">
          <p className={`text-lg font-semibold capitalize ${STATUS_COLOR[status] ?? ''}`}>
            {status}
          </p>
          {dep.started_at && (
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(dep.started_at), { addSuffix: true })}
            </p>
          )}
        </div>
      </div>

      {/* Error card */}
      {status === 'failed' && dep.error_message && (
        <div className="rounded border border-destructive/30 bg-destructive/10 p-4">
          <div className="flex items-start gap-2">
            <span className="text-destructive font-mono text-sm">{dep.error_code ?? 'ERROR'}</span>
          </div>
          <p className="mt-1 text-sm">{dep.error_message}</p>
          <div className="mt-3">
            <a
              href={`/api/creator/apps/${appId}/redeploy`}
              className="text-sm text-primary hover:underline"
              onClick={async (e) => {
                e.preventDefault()
                await fetch(`/api/creator/apps/${appId}/redeploy`, { method: 'POST' })
                window.location.href = `/creator/apps/${appId}/deployments`
              }}
            >
              Redeploy →
            </a>
          </div>
        </div>
      )}

      {/* Event timeline */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Event Timeline
        </h2>
        {events.length === 0 ? (
          <div className="text-sm text-muted-foreground animate-pulse">Waiting for events…</div>
        ) : (
          <div className="space-y-1">
            {events.map((event) => (
              <div
                key={event.id}
                className={`flex items-start gap-3 py-2 px-3 rounded text-sm ${
                  event.event_type === 'failed' ? 'bg-destructive/10' :
                  event.event_type === 'deployed' ? 'bg-green-500/10' : ''
                }`}
              >
                <span className="mt-0.5 text-base leading-none w-5 flex-shrink-0 text-center">
                  {EVENT_ICONS[event.event_type] ?? '·'}
                </span>
                <div className="flex-1 min-w-0">
                  <span>{event.message}</span>
                </div>
                <span className="font-mono text-xs text-muted-foreground flex-shrink-0">
                  {new Date(event.created_at).toLocaleTimeString()}
                </span>
              </div>
            ))}
            {!isTerminal && (
              <div className="flex items-center gap-3 py-2 px-3 text-sm text-muted-foreground animate-pulse">
                <span className="w-5 text-center">⚙</span>
                <span>Processing…</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add platform/app/creator/apps/[appId]/deployments/[deploymentId]/
git commit -m "feat(platform): deployment detail page with live SSE log streaming (P2.5)"
```

---

### Task 9: Viewer — deploying state progress text

The viewer already has a deploying state in `viewer-shell.tsx`. The P2.5 spec calls for a progress bar with step text ("Building your app…" → "Almost ready…"). This task updates the deploying UI without changing logic.

**Files:**
- Modify: `platform/app/viewer/[channelSlug]/[appSlug]/viewer-shell.tsx`

- [ ] **Step 1: Update the deploying state UI**

Find the `viewState === 'deploying'` block (around line 192) and replace it:

```typescript
// Replace the deploying state block:
{viewState === 'deploying' && (
  <div className="flex h-full items-center justify-center">
    <div className="max-w-sm text-center">
      <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-violet-500" />
      <p className="font-medium text-gray-900">Your app is deploying</p>
      <p className="mt-1 text-sm text-gray-500">This usually takes 2–5 minutes. This page will update automatically.</p>
    </div>
  </div>
)}

// With this:
{viewState === 'deploying' && (
  <DeployingState />
)}
```

Add `DeployingState` as a new component inside the file (before the `ViewerShell` export):

```typescript
function DeployingState() {
  const steps = [
    'Queuing deployment…',
    'Cloning repository…',
    'Building your app…',
    'Starting container…',
    'Almost ready…',
  ]
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, steps.length - 1))
    }, 25_000) // advance step every 25s
    return () => clearInterval(interval)
  }, [steps.length])

  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-xs text-center">
        <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-violet-500" />
        <p className="font-medium text-gray-900">Deploying your app</p>
        <p className="mt-1 text-sm text-gray-500">{steps[stepIndex]}</p>
        <div className="mt-4 h-1 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-violet-500 transition-all duration-[25000ms] ease-linear"
            style={{ width: `${Math.round(((stepIndex + 1) / steps.length) * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-gray-400">Usually 2–5 minutes</p>
      </div>
    </div>
  )
}
```

Note: `useState` and `useEffect` are already imported — no new imports needed.

- [ ] **Step 2: Commit**

```bash
git add platform/app/viewer/[channelSlug]/[appSlug]/viewer-shell.tsx
git commit -m "feat(viewer): animated deployment progress with step text (P2.5)"
```

---

### Task 10: Verification

- [ ] **Step 1: Run all platform tests**

```bash
cd platform && npx vitest run
```

Expected: PASS.

- [ ] **Step 2: Run all deploy-manager tests**

```bash
cd deploy-manager && npx vitest run
```

Expected: PASS.

- [ ] **Step 3: Manual end-to-end smoke test**

1. Trigger a deployment via the platform
2. Open `GET /api/creator/deployments/{id}` — verify events array is populated
3. Open the deployment detail page — verify events appear in real-time as deployment progresses
4. After deployment fails, verify error_code and human-readable message appear
5. Click Redeploy — verify new deployment is queued

- [ ] **Step 4: Final commit**

```bash
git add -p
git commit -m "chore(P2): deployment pipeline hardening and management UX complete"
```
