# Terminal AI — Full Version Roadmap: v2–v5

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the v1 barebones (first app launchable) into a full platform with billing, creator self-service, file processing, AI quality infrastructure, optimizer analytics, MCP integration, and social sharing.

**Architecture:** Next.js 16 BFF (platform) + Hono/Bun API gateway + deploy-manager service + PostgreSQL + Redis + MinIO + Langfuse. Each version ships independently and is production-ready on its own.

**Tech Stack:** Next.js 16, Hono, Bun, PostgreSQL 17, Redis 7, BullMQ, MinIO, Better Auth, Razorpay, Langfuse, Satori, resvg-js, Sharp, ClamAV, Coolify API, `@modelcontextprotocol/sdk`

---

## Version Map

| Version | Theme | Prerequisite |
|---------|-------|-------------|
| v2 | Billing + Creator Self-Service | v1 live |
| v3 | File Uploads + K-Model + Artifacts | v2 live |
| v4 | Optimizer + MCP Server | v3 live |
| v5 | Social Sharing + Open Platform | v4 live |

---

# v2 — Billing + Creator Self-Service

**Goal:** Users can subscribe to channels/apps and pay. Creators can deploy apps via the dashboard. Credit system migrated to append-only ledger.

**Files:**
```
platform/
  app/
    api/
      webhooks/razorpay/route.ts     ← Razorpay webhook handler
      subscriptions/route.ts         ← create/cancel subscription
      credits/route.ts               ← credit balance + history
    dashboard/
      page.tsx                       ← creator dashboard
      apps/
        new/page.tsx                 ← deploy new app form
        [appId]/page.tsx             ← app management
  lib/
    credits.ts                       ← CTE-based ledger operations
    razorpay.ts                      ← Razorpay client + webhook verify
    subscriptions.ts                 ← subscription lifecycle
deploy-manager/
  src/
    index.ts                         ← Hono app, deploy endpoints
    services/
      coolify.ts                     ← Coolify API wrapper
      gitleaks.ts                    ← secret scanning
      dns.ts                         ← Cloudflare DNS management
    queue/
      deploy-queue.ts                ← BullMQ deploy job
infra/
  docker-compose.yml                 ← add deploy-manager service
```

---

### Task v2-1: Credit Ledger Migration

**Files:**
- Modify: `platform/lib/db/migrations/002_credit_ledger.sql`
- Create: `platform/lib/credits.ts`
- Test: `platform/lib/credits.test.ts`

- [ ] **Step 1: Write migration**

```sql
-- platform/lib/db/migrations/002_credit_ledger.sql
CREATE SCHEMA IF NOT EXISTS subscriptions;

CREATE TABLE subscriptions.credit_ledger (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta         INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason        TEXT NOT NULL CHECK (reason IN (
    'subscription_grant', 'api_call', 'topup', 'demo', 'welcome', 'refund'
  )),
  app_id        UUID,
  api_call_id   UUID,
  created_at    TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX credit_ledger_user_id_idx ON subscriptions.credit_ledger(user_id, created_at DESC);

-- Seed existing balances from user.credits column
INSERT INTO subscriptions.credit_ledger (user_id, delta, balance_after, reason)
SELECT id, credits, credits, 'welcome'
FROM auth.users
WHERE credits > 0;
```

- [ ] **Step 2: Write failing test**

```ts
// platform/lib/credits.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { deductCredits, grantCredits, getBalance } from './credits'
import { db } from './db'

describe('credits', () => {
  beforeEach(async () => {
    await db.query('DELETE FROM subscriptions.credit_ledger')
    await db.query(`INSERT INTO subscriptions.credit_ledger
      (user_id, delta, balance_after, reason) VALUES
      ('test-user-id', 200, 200, 'welcome')`)
  })

  it('deducts credits atomically', async () => {
    const bal = await deductCredits('test-user-id', 10, 'api_call')
    expect(bal).toBe(190)
  })

  it('throws when insufficient credits', async () => {
    await expect(deductCredits('test-user-id', 500, 'api_call'))
      .rejects.toThrow('Insufficient credits')
  })

  it('grants credits and returns new balance', async () => {
    const bal = await grantCredits('test-user-id', 50, 'topup')
    expect(bal).toBe(250)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd platform && bun test lib/credits.test.ts
```
Expected: FAIL — `deductCredits` not defined

- [ ] **Step 4: Implement credits.ts**

```ts
// platform/lib/credits.ts
import { db } from './db'

export async function deductCredits(
  userId: string,
  delta: number,
  reason: string,
  appId?: string,
  apiCallId?: string
): Promise<number> {
  const result = await db.query<{ balance_after: number }>(`
    WITH current AS (
      SELECT COALESCE(
        (SELECT balance_after FROM subscriptions.credit_ledger
         WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1),
        0
      ) AS balance
    ),
    check_balance AS (
      SELECT balance FROM current WHERE balance >= $2
    ),
    inserted AS (
      INSERT INTO subscriptions.credit_ledger
        (user_id, delta, balance_after, reason, app_id, api_call_id)
      SELECT $1, -$2, balance - $2, $3, $4, $5
      FROM check_balance
      RETURNING balance_after
    )
    SELECT balance_after FROM inserted
  `, [userId, delta, reason, appId ?? null, apiCallId ?? null])

  if (!result.rows[0]) throw new Error('Insufficient credits')
  return result.rows[0].balance_after
}

export async function grantCredits(
  userId: string,
  delta: number,
  reason: string
): Promise<number> {
  const result = await db.query<{ balance_after: number }>(`
    WITH current AS (
      SELECT COALESCE(
        (SELECT balance_after FROM subscriptions.credit_ledger
         WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1),
        0
      ) AS balance
    ),
    inserted AS (
      INSERT INTO subscriptions.credit_ledger
        (user_id, delta, balance_after, reason)
      SELECT $1, $2, balance + $2, $3
      FROM current
      RETURNING balance_after
    )
    SELECT balance_after FROM inserted
  `, [userId, delta, reason])

  return result.rows[0].balance_after
}

export async function getBalance(userId: string): Promise<number> {
  const result = await db.query<{ balance_after: number }>(
    `SELECT balance_after FROM subscriptions.credit_ledger
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId]
  )
  return result.rows[0]?.balance_after ?? 0
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd platform && bun test lib/credits.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add platform/lib/credits.ts platform/lib/credits.test.ts platform/lib/db/migrations/002_credit_ledger.sql
git commit -m "feat(credits): CTE-based append-only credit ledger with atomic deduction"
```

---

### Task v2-2: Razorpay Webhook Handler

**Files:**
- Create: `platform/lib/razorpay.ts`
- Create: `platform/app/api/webhooks/razorpay/route.ts`
- Test: `platform/app/api/webhooks/razorpay/route.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// platform/app/api/webhooks/razorpay/route.test.ts
import { describe, it, expect, vi } from 'vitest'
import { POST } from './route'
import { createHmac } from 'crypto'

const WEBHOOK_SECRET = 'test-secret'

function signPayload(body: string): string {
  return createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')
}

describe('Razorpay webhook', () => {
  it('rejects invalid signature', async () => {
    const req = new Request('http://localhost/api/webhooks/razorpay', {
      method: 'POST',
      headers: { 'x-razorpay-signature': 'bad-sig' },
      body: JSON.stringify({ event: 'payment.captured' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('accepts valid signature and returns 200', async () => {
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_test123', amount: 29900, notes: { userId: 'u1', planCode: 'channel_basic' } } } } })
    const sig = signPayload(body)
    const req = new Request('http://localhost/api/webhooks/razorpay', {
      method: 'POST',
      headers: { 'x-razorpay-signature': sig },
      body,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd platform && bun test app/api/webhooks/razorpay/route.test.ts
```
Expected: FAIL — route not found

- [ ] **Step 3: Implement razorpay.ts**

```ts
// platform/lib/razorpay.ts
import { createHmac } from 'crypto'

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET!

export function verifyWebhookSignature(body: string, signature: string): boolean {
  const expected = createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')
  return expected === signature
}

export function buildRazorpayOrderUrl(orderId: string): string {
  return `https://api.razorpay.com/v1/orders/${orderId}`
}
```

- [ ] **Step 4: Implement webhook route**

```ts
// platform/app/api/webhooks/razorpay/route.ts
import { NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/razorpay'
import { grantCredits } from '@/lib/credits'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export async function POST(req: Request) {
  const body = await req.text()
  const signature = req.headers.get('x-razorpay-signature') ?? ''

  if (!verifyWebhookSignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const event = JSON.parse(body)
  const eventId = event.payload?.payment?.entity?.id ?? event.payload?.subscription?.entity?.id

  // Idempotency check
  const existing = await db.query(
    `SELECT id FROM deployments.webhook_events WHERE source = 'razorpay' AND event_id = $1`,
    [eventId]
  )
  if (existing.rows.length > 0) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  await db.query(
    `INSERT INTO deployments.webhook_events (source, event_id, payload) VALUES ('razorpay', $1, $2)`,
    [eventId, event]
  )

  if (event.event === 'payment.captured') {
    const payment = event.payload.payment.entity
    const { userId, planCode } = payment.notes ?? {}
    if (userId && planCode) {
      const credits = getCreditsForPlan(planCode)
      await grantCredits(userId, credits, 'topup')
      logger.info({ msg: 'credits_granted', userId, credits, planCode, paymentId: payment.id })
    }
  }

  return NextResponse.json({ ok: true })
}

function getCreditsForPlan(planCode: string): number {
  const map: Record<string, number> = {
    channel_basic: 500,
    channel_pro: 2000,
    app_basic: 200,
  }
  return map[planCode] ?? 0
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd platform && bun test app/api/webhooks/razorpay/route.test.ts
```
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add platform/lib/razorpay.ts platform/app/api/webhooks/razorpay/route.ts platform/app/api/webhooks/razorpay/route.test.ts
git commit -m "feat(billing): Razorpay webhook handler with HMAC verification and idempotency"
```

---

### Task v2-3: Deploy Manager Service

**Files:**
- Create: `deploy-manager/src/index.ts`
- Create: `deploy-manager/src/services/coolify.ts`
- Create: `deploy-manager/src/services/gitleaks.ts`
- Create: `deploy-manager/src/services/dns.ts`
- Create: `deploy-manager/src/queue/deploy-queue.ts`
- Test: `deploy-manager/src/services/gitleaks.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// deploy-manager/src/services/gitleaks.test.ts
import { describe, it, expect } from 'vitest'
import { scanForSecrets } from './gitleaks'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'

describe('gitleaks secret scan', () => {
  it('detects hardcoded API key', async () => {
    const dir = '/tmp/gitleaks-test-dirty'
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'config.ts'), `const key = "sk-ant-abcdefghijklmnop1234567890"`)
    const result = await scanForSecrets(dir)
    expect(result.clean).toBe(false)
    rmSync(dir, { recursive: true })
  }, 30_000)

  it('passes clean repo', async () => {
    const dir = '/tmp/gitleaks-test-clean'
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'index.ts'), `const x = process.env.API_KEY`)
    const result = await scanForSecrets(dir)
    expect(result.clean).toBe(true)
    rmSync(dir, { recursive: true })
  }, 30_000)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd deploy-manager && bun test src/services/gitleaks.test.ts
```
Expected: FAIL — `scanForSecrets` not defined

- [ ] **Step 3: Implement gitleaks.ts**

```ts
// deploy-manager/src/services/gitleaks.ts
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

interface ScanResult {
  clean: boolean
  findings: string[]
}

export async function scanForSecrets(repoPath: string): Promise<ScanResult> {
  try {
    await execFileAsync('docker', [
      'run', '--rm',
      '-v', `${repoPath}:/repo:ro`,
      'zricethezav/gitleaks:latest',
      'detect',
      '--source=/repo',
      '--no-git',
      '--exit-code', '1',
    ])
    return { clean: true, findings: [] }
  } catch (err: unknown) {
    const error = err as { code?: number; stdout?: string; stderr?: string }
    if (error.code === 1) {
      const lines = (error.stdout ?? '').split('\n').filter(Boolean)
      return { clean: false, findings: lines }
    }
    throw new Error(`Gitleaks scan failed: ${error.stderr ?? String(err)}`)
  }
}
```

- [ ] **Step 4: Implement coolify.ts**

```ts
// deploy-manager/src/services/coolify.ts
import { logger } from '../lib/logger'

const COOLIFY_URL = process.env.COOLIFY_URL!
const COOLIFY_TOKEN = process.env.COOLIFY_TOKEN!

interface DeployResult {
  deploymentId: string
  status: string
}

export async function triggerDeploy(coolifyAppId: string): Promise<DeployResult> {
  const res = await fetch(`${COOLIFY_URL}/api/v1/applications/${coolifyAppId}/deploy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${COOLIFY_TOKEN}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Coolify deploy failed: ${res.status} ${await res.text()}`)
  return res.json()
}

export async function getAppStatus(coolifyAppId: string): Promise<string> {
  const res = await fetch(`${COOLIFY_URL}/api/v1/applications/${coolifyAppId}`, {
    headers: { Authorization: `Bearer ${COOLIFY_TOKEN}` },
  })
  if (!res.ok) throw new Error(`Coolify status failed: ${res.status}`)
  const data = await res.json()
  return data.status
}

export async function createApp(params: {
  name: string
  githubRepo: string
  branch: string
  port: number
  envVars: Record<string, string>
}): Promise<string> {
  const res = await fetch(`${COOLIFY_URL}/api/v1/applications`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${COOLIFY_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: params.name,
      git_repository: params.githubRepo,
      git_branch: params.branch,
      ports_exposes: String(params.port),
      environment_variables: params.envVars,
    }),
  })
  if (!res.ok) throw new Error(`Coolify create failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.uuid
}
```

- [ ] **Step 5: Implement dns.ts**

```ts
// deploy-manager/src/services/dns.ts
const CF_TOKEN = process.env.CLOUDFLARE_TOKEN!
const CF_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID!
const VPS2_IP = process.env.VPS2_IP!

export async function createSubdomain(subdomain: string): Promise<string> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'A',
        name: `${subdomain}.apps.terminalai.app`,
        content: VPS2_IP,
        ttl: 60,
        proxied: true,
      }),
    }
  )
  if (!res.ok) throw new Error(`DNS create failed: ${res.status}`)
  const data = await res.json()
  return data.result.id
}

export async function deleteSubdomain(recordId: string): Promise<void> {
  await fetch(
    `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records/${recordId}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${CF_TOKEN}` } }
  )
}
```

- [ ] **Step 6: Implement deploy-queue.ts**

```ts
// deploy-manager/src/queue/deploy-queue.ts
import { Queue, Worker } from 'bullmq'
import { scanForSecrets } from '../services/gitleaks'
import { createApp, triggerDeploy } from '../services/coolify'
import { createSubdomain } from '../services/dns'
import { db } from '../lib/db'
import { logger } from '../lib/logger'

export const deployQueue = new Queue('deploys', {
  connection: { host: process.env.REDIS_HOST, port: 6379 },
})

export function startDeployWorker() {
  return new Worker('deploys', async (job) => {
    const { deploymentId, appId, githubRepo, branch, subdomain } = job.data

    await db.query(
      `UPDATE deployments.deployments SET status = 'building' WHERE id = $1`,
      [deploymentId]
    )

    // 1. Clone and scan
    const tmpPath = `/tmp/deploy-${deploymentId}`
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const execFileAsync = promisify(execFile)
    await execFileAsync('git', ['clone', '--depth=1', `https://github.com/${githubRepo}`, tmpPath])
    const scan = await scanForSecrets(tmpPath)
    if (!scan.clean) {
      await db.query(
        `UPDATE deployments.deployments SET status = 'failed', error_message = $2 WHERE id = $1`,
        [deploymentId, `Secret detected: ${scan.findings[0]}`]
      )
      throw new Error('Secrets detected in repository')
    }

    // 2. Create DNS record first (security: prevents subdomain takeover)
    const dnsRecordId = await createSubdomain(subdomain)
    await db.query(
      `UPDATE deployments.deployments SET dns_record_id = $2 WHERE id = $1`,
      [deploymentId, dnsRecordId]
    )

    // 3. Create Coolify app
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

    // 4. Trigger deploy
    await triggerDeploy(coolifyId)
    await db.query(
      `UPDATE deployments.deployments SET status = 'live', coolify_app_id = $2 WHERE id = $1`,
      [deploymentId, coolifyId]
    )

    logger.info({ msg: 'deploy_complete', deploymentId, subdomain })
  }, {
    connection: { host: process.env.REDIS_HOST, port: 6379 },
    concurrency: 3,
  })
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd deploy-manager && bun test src/services/gitleaks.test.ts
```
Expected: PASS (2 tests — requires Docker)

- [ ] **Step 8: Commit**

```bash
git add deploy-manager/
git commit -m "feat(deploy-manager): Coolify integration, Gitleaks scanning, BullMQ deploy queue"
```

---

### Task v2-4: Creator Dashboard

**Files:**
- Create: `platform/app/dashboard/page.tsx`
- Create: `platform/app/dashboard/apps/new/page.tsx`
- Create: `platform/app/api/creator/apps/route.ts`
- Test: `platform/app/api/creator/apps/route.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// platform/app/api/creator/apps/route.test.ts
import { describe, it, expect, vi } from 'vitest'
import { POST } from './route'

describe('POST /api/creator/apps', () => {
  it('requires authentication', async () => {
    vi.mock('@/lib/auth', () => ({ getSession: vi.fn().mockResolvedValue(null) }))
    const req = new Request('http://localhost/api/creator/apps', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test App', githubRepo: 'user/repo', branch: 'main' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Implement creator apps API route**

```ts
// platform/app/api/creator/apps/route.ts
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { deployQueue } from '@/lib/deploy-queue-client'
import { logger } from '@/lib/logger'
import { z } from 'zod'

const CreateAppSchema = z.object({
  name: z.string().min(3).max(60),
  description: z.string().max(500),
  githubRepo: z.string().regex(/^[\w-]+\/[\w-]+$/),
  branch: z.string().default('main'),
  channelId: z.string().uuid(),
})

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = CreateAppSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  const { name, description, githubRepo, branch, channelId } = body.data
  const subdomain = name.toLowerCase().replace(/[^a-z0-9]/g, '-')

  // Check subdomain availability
  const existing = await db.query(
    `SELECT id FROM deployments.deployments WHERE subdomain = $1`,
    [subdomain]
  )
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: 'Subdomain already taken' }, { status: 409 })
  }

  const appResult = await db.query(
    `INSERT INTO marketplace.apps (channel_id, name, description, status, github_repo, github_branch)
     VALUES ($1, $2, $3, 'pending', $4, $5) RETURNING id`,
    [channelId, name, description, githubRepo, branch]
  )
  const appId = appResult.rows[0].id

  const deployResult = await db.query(
    `INSERT INTO deployments.deployments (app_id, status, subdomain, github_repo, github_branch)
     VALUES ($1, 'pending', $2, $3, $4) RETURNING id`,
    [appId, subdomain, githubRepo, branch]
  )
  const deploymentId = deployResult.rows[0].id

  await deployQueue.add('deploy', { deploymentId, appId, githubRepo, branch, subdomain })

  logger.info({ msg: 'app_deploy_queued', appId, deploymentId, creatorId: session.user.id })
  return NextResponse.json({ appId, deploymentId, subdomain }, { status: 202 })
}
```

- [ ] **Step 3: Creator dashboard page**

```tsx
// platform/app/dashboard/page.tsx
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import Link from 'next/link'

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/auth/login')

  const apps = await db.query(
    `SELECT a.id, a.name, a.status, d.subdomain, d.status as deploy_status
     FROM marketplace.apps a
     LEFT JOIN deployments.deployments d ON d.app_id = a.id
     WHERE a.channel_id IN (
       SELECT id FROM marketplace.channels WHERE creator_id = $1 AND deleted_at IS NULL
     )
     ORDER BY a.created_at DESC`,
    [session.user.id]
  )

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">Your Apps</h1>
        <Link href="/dashboard/apps/new"
          className="px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-sm font-medium text-white">
          Deploy New App
        </Link>
      </div>
      <div className="space-y-3">
        {apps.rows.map(app => (
          <div key={app.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-white">{app.name}</p>
              <p className="text-sm text-zinc-400">{app.subdomain}.apps.terminalai.app</p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full ${
              app.deploy_status === 'live' ? 'bg-green-900 text-green-400' :
              app.deploy_status === 'building' ? 'bg-yellow-900 text-yellow-400' :
              'bg-red-900 text-red-400'
            }`}>
              {app.deploy_status}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
cd platform && bun test app/api/creator/apps/route.test.ts
```
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add platform/app/dashboard/ platform/app/api/creator/
git commit -m "feat(creator): dashboard + app deployment flow via deploy-manager queue"
```

---

# v3 — File Uploads + K-Model + Artifacts

**Goal:** Creator apps can accept file uploads (scanned, compressed, stored in MinIO). K-model prompting available. Apps can generate downloadable artifacts.

**Files:**
```
gateway/
  src/
    routes/
      upload.ts          ← multipart upload endpoint
      artifacts.ts       ← artifact storage + signed URL generation
    services/
      minio.ts           ← MinIO client wrapper
      clamav.ts          ← TCP socket virus scan
      compress.ts        ← Sharp/FFmpeg/Ghostscript compression
      kmodel.ts          ← vote and judge strategies
infra/
  docker-compose.yml     ← add MinIO, ClamAV services
```

---

### Task v3-1: MinIO + ClamAV Infrastructure

**Files:**
- Modify: `infra/docker-compose.yml`

- [ ] **Step 1: Add MinIO and ClamAV to docker-compose.yml**

```yaml
# Add to infra/docker-compose.yml services:

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 5s
      retries: 3
    networks:
      - internal

  clamav:
    image: clamav/clamav:latest
    environment:
      CLAMD_CONF_ScanOnAccess: "no"
    volumes:
      - clamav_db:/var/lib/clamav
    healthcheck:
      test: ["CMD", "clamdcheck"]
      interval: 60s
      timeout: 10s
      retries: 5
    networks:
      - internal

# Add to volumes:
#   minio_data:
#   clamav_db:
```

- [ ] **Step 2: Commit**

```bash
git add infra/docker-compose.yml
git commit -m "feat(infra): add MinIO and ClamAV to docker-compose"
```

---

### Task v3-2: ClamAV TCP Scanner

**Files:**
- Create: `gateway/src/services/clamav.ts`
- Test: `gateway/src/services/clamav.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// gateway/src/services/clamav.test.ts
import { describe, it, expect } from 'vitest'
import { scanBuffer } from './clamav'

const EICAR = Buffer.from(
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
)

describe('ClamAV scanner', () => {
  it('detects EICAR test virus', async () => {
    const result = await scanBuffer(EICAR, 'test.txt')
    expect(result.clean).toBe(false)
    expect(result.virusName).toContain('Eicar')
  }, 10_000)

  it('passes clean buffer', async () => {
    const result = await scanBuffer(Buffer.from('hello world'), 'hello.txt')
    expect(result.clean).toBe(true)
  }, 10_000)
})
```

- [ ] **Step 2: Implement clamav.ts**

```ts
// gateway/src/services/clamav.ts
import net from 'net'

const CLAMAV_HOST = process.env.CLAMAV_HOST ?? 'clamav'
const CLAMAV_PORT = parseInt(process.env.CLAMAV_PORT ?? '3310')

interface ScanResult {
  clean: boolean
  virusName?: string
}

export async function scanBuffer(data: Buffer, filename: string): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: CLAMAV_HOST, port: CLAMAV_PORT })
    const chunks: Buffer[] = []

    socket.on('error', reject)
    socket.on('data', chunk => chunks.push(chunk))
    socket.on('end', () => {
      const response = Buffer.concat(chunks).toString().trim()
      if (response === 'stream: OK') {
        resolve({ clean: true })
      } else {
        const match = response.match(/stream: (.+) FOUND/)
        resolve({ clean: false, virusName: match?.[1] ?? 'Unknown' })
      }
    })

    // INSTREAM protocol: zINSTREAM\0 + [4-byte big-endian length][data]... + [4-byte zero terminator]
    const sizeBuf = Buffer.allocUnsafe(4)
    sizeBuf.writeUInt32BE(data.length, 0)
    const terminator = Buffer.alloc(4, 0)

    socket.write('zINSTREAM\0')
    socket.write(sizeBuf)
    socket.write(data)
    socket.write(terminator)
    socket.end()
  })
}
```

- [ ] **Step 3: Run tests**

```bash
cd gateway && bun test src/services/clamav.test.ts
```
Expected: PASS (2 tests — requires ClamAV running)

- [ ] **Step 4: Commit**

```bash
git add gateway/src/services/clamav.ts gateway/src/services/clamav.test.ts
git commit -m "feat(gateway): ClamAV TCP socket scanner for file upload security"
```

---

### Task v3-3: File Upload Route

**Files:**
- Create: `gateway/src/services/minio.ts`
- Create: `gateway/src/services/compress.ts`
- Create: `gateway/src/routes/upload.ts`
- Test: `gateway/src/routes/upload.test.ts`

- [ ] **Step 1: Implement minio.ts**

```ts
// gateway/src/services/minio.ts
import { Client } from 'minio'
import { createHash, randomUUID } from 'crypto'

export const minio = new Client({
  endPoint: process.env.MINIO_ENDPOINT ?? 'minio',
  port: parseInt(process.env.MINIO_PORT ?? '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY!,
  secretKey: process.env.MINIO_SECRET_KEY!,
})

export async function uploadFile(params: {
  bucket: string
  appId: string
  userId: string
  filename: string
  buffer: Buffer
  contentType: string
}): Promise<string> {
  const sessionHash = createHash('sha256')
    .update(params.userId + params.appId + new Date().toDateString())
    .digest('hex')
    .slice(0, 16)
  const key = `uploads/${params.appId}/${sessionHash}/${randomUUID()}/${params.filename}`
  await minio.putObject(params.bucket, key, params.buffer, params.buffer.length, {
    'Content-Type': params.contentType,
  })
  return key
}

export async function getSignedUrl(bucket: string, key: string, ttlSeconds = 3600): Promise<string> {
  return minio.presignedGetObject(bucket, key, ttlSeconds)
}
```

- [ ] **Step 2: Implement compress.ts**

```ts
// gateway/src/services/compress.ts
import sharp from 'sharp'

interface CompressionResult {
  buffer: Buffer
  contentType: string
  originalSize: number
  compressedSize: number
}

export async function compressFile(
  buffer: Buffer,
  mimeType: string,
  level: 'high_fidelity' | 'balanced' | 'aggressive' = 'balanced'
): Promise<CompressionResult> {
  const originalSize = buffer.length

  if (mimeType.startsWith('image/')) {
    const quality = level === 'high_fidelity' ? 95 : level === 'balanced' ? 80 : 60
    const compressed = await sharp(buffer).webp({ quality }).toBuffer()
    return { buffer: compressed, contentType: 'image/webp', originalSize, compressedSize: compressed.length }
  }

  // For PDFs, return as-is (Ghostscript not available in all envs; handle via separate job)
  return { buffer, contentType: mimeType, originalSize, compressedSize: buffer.length }
}
```

- [ ] **Step 3: Write failing test**

```ts
// gateway/src/routes/upload.test.ts
import { describe, it, expect, vi } from 'vitest'
import app from '../index'

describe('POST /upload', () => {
  it('rejects request without auth token', async () => {
    const form = new FormData()
    form.append('file', new Blob(['test'], { type: 'text/plain' }), 'test.txt')
    const res = await app.request('/upload', { method: 'POST', body: form })
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 4: Implement upload route**

```ts
// gateway/src/routes/upload.ts
import { Hono } from 'hono'
import { scanBuffer } from '../services/clamav'
import { compressFile } from '../services/compress'
import { uploadFile, getSignedUrl } from '../services/minio'
import { verifyEmbedToken } from '../middleware/auth'
import { logger } from '../lib/logger'

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf', 'text/plain', 'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

export const uploadRouter = new Hono()

uploadRouter.post('/', verifyEmbedToken, async (c) => {
  const payload = c.get('tokenPayload')
  const formData = await c.req.formData()
  const file = formData.get('file') as File | null

  if (!file) return c.json({ error: 'No file provided' }, 400)
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return c.json({ error: 'File type not allowed' }, 422)
  }
  if (file.size > 50 * 1024 * 1024) {
    return c.json({ error: 'File too large (max 50MB)' }, 422)
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // Scan for viruses
  const scan = await scanBuffer(buffer, file.name)
  if (!scan.clean) {
    logger.warn({ msg: 'malware_detected', userId: payload.userId, appId: payload.appId, virus: scan.virusName })
    return c.json({ error: 'File blocked by security scanner' }, 422)
  }

  // Compress
  const { buffer: compressed, contentType } = await compressFile(buffer, file.type)

  // Upload to MinIO
  const key = await uploadFile({
    bucket: 'uploads',
    appId: payload.appId,
    userId: payload.userId,
    filename: file.name,
    buffer: compressed,
    contentType,
  })

  const signedUrl = await getSignedUrl('uploads', key, 3600)

  logger.info({ msg: 'file_uploaded', userId: payload.userId, appId: payload.appId, size: compressed.length })
  return c.json({ key, signedUrl, contentType, size: compressed.length })
})
```

- [ ] **Step 5: Run tests**

```bash
cd gateway && bun test src/routes/upload.test.ts
```
Expected: PASS (1 test)

- [ ] **Step 6: Commit**

```bash
git add gateway/src/services/ gateway/src/routes/upload.ts gateway/src/routes/upload.test.ts
git commit -m "feat(gateway): file upload with ClamAV scan, Sharp compression, MinIO storage"
```

---

### Task v3-4: K-Model Prompting

**Files:**
- Create: `gateway/src/services/kmodel.ts`
- Test: `gateway/src/services/kmodel.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// gateway/src/services/kmodel.test.ts
import { describe, it, expect, vi } from 'vitest'
import { kmodelVote, kmodelJudge } from './kmodel'

const mockCallLLM = vi.fn()

describe('kmodelVote', () => {
  it('returns majority response when 2/3 agree', async () => {
    mockCallLLM
      .mockResolvedValueOnce('Paris')
      .mockResolvedValueOnce('Paris')
      .mockResolvedValueOnce('Lyon')

    const result = await kmodelVote(
      [
        { provider: 'openrouter', model: 'haiku' },
        { provider: 'openrouter', model: 'haiku' },
        { provider: 'openrouter', model: 'haiku' },
      ],
      [{ role: 'user', content: 'Capital of France?' }],
      mockCallLLM
    )
    expect(result.response).toBe('Paris')
    expect(result.votes).toEqual({ Paris: 2, Lyon: 1 })
  })
})

describe('kmodelJudge', () => {
  it('calls judge with all candidates', async () => {
    mockCallLLM
      .mockResolvedValueOnce('Response A')
      .mockResolvedValueOnce('Response B')
      .mockResolvedValueOnce('Response B') // judge picks B

    const result = await kmodelJudge(
      [{ provider: 'openrouter', model: 'haiku' }, { provider: 'openrouter', model: 'sonnet' }],
      { provider: 'openrouter', model: 'claude-3-5-sonnet' },
      [{ role: 'user', content: 'Write a poem' }],
      mockCallLLM
    )
    expect(result.response).toBe('Response B')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd gateway && bun test src/services/kmodel.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement kmodel.ts**

```ts
// gateway/src/services/kmodel.ts
import { createHash } from 'crypto'

interface Model {
  provider: string
  model: string
}

interface Message {
  role: string
  content: string
}

interface LLMCallFn {
  (model: Model, messages: Message[]): Promise<string>
}

interface VoteResult {
  response: string
  votes: Record<string, number>
  allResponses: string[]
}

interface JudgeResult {
  response: string
  judgeReasoning?: string
}

export async function kmodelVote(
  models: Model[],
  messages: Message[],
  callLLM: LLMCallFn
): Promise<VoteResult> {
  const responses = await Promise.all(models.map(m => callLLM(m, messages)))

  const votes: Record<string, number> = {}
  for (const response of responses) {
    const key = createHash('md5').update(response.trim().toLowerCase()).digest('hex')
    // Group similar responses by hash, store first occurrence text
    if (!votes[response]) votes[response] = 0
    votes[response]++
  }

  const winner = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0]
  return { response: winner, votes, allResponses: responses }
}

export async function kmodelJudge(
  models: Model[],
  judgeModel: Model,
  messages: Message[],
  callLLM: LLMCallFn
): Promise<JudgeResult> {
  const candidates = await Promise.all(models.map(m => callLLM(m, messages)))

  const judgePrompt: Message[] = [
    ...messages,
    {
      role: 'user',
      content: `I have ${candidates.length} candidate responses to the above. Select the BEST one and respond with ONLY that response, unchanged:\n\n${
        candidates.map((c, i) => `--- Candidate ${i + 1} ---\n${c}`).join('\n\n')
      }`,
    },
  ]

  const judgeResponse = await callLLM(judgeModel, judgePrompt)
  return { response: judgeResponse }
}
```

- [ ] **Step 4: Run tests**

```bash
cd gateway && bun test src/services/kmodel.test.ts
```
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add gateway/src/services/kmodel.ts gateway/src/services/kmodel.test.ts
git commit -m "feat(gateway): K-model vote and judge strategies for consensus prompting"
```

---

# v4 — Optimizer + MCP Server

**Goal:** Behavioral signals collected per API call. Langfuse logging enabled (opt-in). Weekly optimizer job generates per-app prompt improvement suggestions. MCP server live for creator tooling.

**Files:**
```
optimizer-worker/
  src/
    index.ts           ← BullMQ worker entry
    analyze.ts         ← weekly analysis job
    signals.ts         ← signal aggregation queries
    langfuse.ts        ← Langfuse client wrapper
mcp-server/
  src/
    index.ts           ← MCP SSE server
    tools/
      scaffold.ts      ← scaffold_app tool
      gateway-sdk.ts   ← get_gateway_sdk tool
      validate.ts      ← validate_deployment tool
      status.ts        ← get_deployment_status tool
      providers.ts     ← list_supported_providers tool
gateway/
  src/
    middleware/
      signals.ts       ← behavioral signal capture
```

---

### Task v4-1: Behavioral Signal Collection

**Files:**
- Modify: `gateway/src/routes/proxy.ts`
- Create: `gateway/src/middleware/signals.ts`
- Test: `gateway/src/middleware/signals.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// gateway/src/middleware/signals.test.ts
import { describe, it, expect, vi } from 'vitest'
import { collectSignal } from './signals'

describe('collectSignal', () => {
  it('writes signal row to DB', async () => {
    const mockDb = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    await collectSignal({
      db: mockDb as never,
      userId: 'user-1',
      appId: 'app-1',
      sessionId: 'session-1',
      apiCallId: 'call-1',
      responseTimeMs: 450,
      inputTokens: 100,
      outputTokens: 200,
      model: 'claude-3-5-haiku',
      provider: 'openrouter',
    })
    expect(mockDb.query).toHaveBeenCalledOnce()
    const sql = mockDb.query.mock.calls[0][0] as string
    expect(sql).toContain('optimizer.behavioral_signals')
  })
})
```

- [ ] **Step 2: Implement signals.ts**

```ts
// gateway/src/middleware/signals.ts
import type { Pool } from 'pg'

interface SignalParams {
  db: Pool
  userId: string
  appId: string
  sessionId: string
  apiCallId: string
  responseTimeMs: number
  inputTokens: number
  outputTokens: number
  model: string
  provider: string
  userSignal?: 'thumbs_up' | 'thumbs_down' | 'inline_correction' | 'none'
}

export async function collectSignal(params: SignalParams): Promise<void> {
  await params.db.query(
    `INSERT INTO optimizer.behavioral_signals
      (user_id, app_id, session_id, api_call_id, response_time_ms,
       input_tokens, output_tokens, model, provider, user_signal)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      params.userId, params.appId, params.sessionId, params.apiCallId,
      params.responseTimeMs, params.inputTokens, params.outputTokens,
      params.model, params.provider, params.userSignal ?? 'none',
    ]
  )
}
```

- [ ] **Step 3: Run tests**

```bash
cd gateway && bun test src/middleware/signals.test.ts
```
Expected: PASS (1 test)

- [ ] **Step 4: Commit**

```bash
git add gateway/src/middleware/signals.ts gateway/src/middleware/signals.test.ts
git commit -m "feat(optimizer): behavioral signal collection on every API call"
```

---

### Task v4-2: Langfuse Integration

**Files:**
- Create: `gateway/src/services/langfuse.ts`
- Test: `gateway/src/services/langfuse.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// gateway/src/services/langfuse.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createTrace, flushTrace } from './langfuse'

describe('createTrace', () => {
  it('returns a trace object with flush method', () => {
    const trace = createTrace({
      name: 'test-trace',
      userId: 'user-hash-abc',
      sessionId: 'session-hash-xyz',
      appId: 'app-id',
    })
    expect(trace).toHaveProperty('id')
    expect(typeof trace.flush).toBe('function')
  })
})
```

- [ ] **Step 2: Implement langfuse.ts**

```ts
// gateway/src/services/langfuse.ts
import { Langfuse } from 'langfuse'
import { createHash } from 'crypto'

const client = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  secretKey: process.env.LANGFUSE_SECRET_KEY!,
  baseUrl: process.env.LANGFUSE_BASE_URL!,
})

// Hash PII before sending to Langfuse
function hashId(id: string): string {
  return createHash('sha256').update(id + process.env.LANGFUSE_HASH_SALT!).digest('hex').slice(0, 16)
}

interface TraceParams {
  name: string
  userId: string
  sessionId: string
  appId: string
}

export function createTrace(params: TraceParams) {
  const trace = client.trace({
    name: params.name,
    userId: hashId(params.userId),
    sessionId: hashId(params.sessionId),
    tags: [`app:${params.appId}`],
    // NOTE: prompt/response content NOT stored per GDPR compliance
    // Only metadata (latency, tokens, model) is logged
  })
  return { id: trace.id, flush: () => client.flushAsync() }
}

export async function flushTrace(): Promise<void> {
  await client.flushAsync()
}
```

- [ ] **Step 3: Run tests**

```bash
cd gateway && bun test src/services/langfuse.test.ts
```
Expected: PASS (1 test)

- [ ] **Step 4: Commit**

```bash
git add gateway/src/services/langfuse.ts gateway/src/services/langfuse.test.ts
git commit -m "feat(optimizer): Langfuse trace logging with PII hashing (GDPR-compliant)"
```

---

### Task v4-3: MCP Server

**Files:**
- Create: `mcp-server/src/index.ts`
- Create: `mcp-server/src/tools/scaffold.ts`
- Create: `mcp-server/src/tools/validate.ts`
- Create: `mcp-server/src/tools/status.ts`
- Create: `mcp-server/src/tools/providers.ts`
- Test: `mcp-server/src/tools/scaffold.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// mcp-server/src/tools/scaffold.test.ts
import { describe, it, expect } from 'vitest'
import { scaffoldApp } from './scaffold'

describe('scaffoldApp', () => {
  it('generates required files for nextjs app', () => {
    const result = scaffoldApp({
      framework: 'nextjs',
      app_name: 'PDF Summariser',
      description: 'Summarises uploaded PDFs',
      category: 'productivity',
      uses_ai: true,
      uses_file_upload: true,
      generates_artifacts: false,
    })
    expect(result.files).toHaveProperty('terminal-ai.config.json')
    expect(result.files).toHaveProperty('app/api/health/route.ts')
    expect(result.files).toHaveProperty('.env.example')
    const config = JSON.parse(result.files['terminal-ai.config.json'])
    expect(config.framework).toBe('nextjs')
    expect(config.health_check_path).toBe('/api/health')
    expect(result.required_env_vars).toContain('TERMINAL_AI_GATEWAY_URL')
  })
})
```

- [ ] **Step 2: Implement scaffold.ts**

```ts
// mcp-server/src/tools/scaffold.ts
interface ScaffoldInput {
  framework: 'nextjs' | 'python' | 'streamlit' | 'static'
  app_name: string
  description: string
  category: string
  uses_ai: boolean
  uses_file_upload: boolean
  generates_artifacts: boolean
}

interface ScaffoldOutput {
  files: Record<string, string>
  instructions: string
  required_env_vars: string[]
  notes: string[]
}

export function scaffoldApp(input: ScaffoldInput): ScaffoldOutput {
  const slug = input.app_name.toLowerCase().replace(/[^a-z0-9]/g, '-')

  const config = {
    app_name: input.app_name,
    framework: input.framework,
    gateway_version: '1',
    health_check_path: input.framework === 'python' || input.framework === 'streamlit'
      ? '/health' : '/api/health',
    port: input.framework === 'python' || input.framework === 'streamlit' ? 8000 : 3000,
    requires_file_upload: input.uses_file_upload,
    generates_artifacts: input.generates_artifacts,
    min_credits_per_session: 10,
  }

  const files: Record<string, string> = {
    'terminal-ai.config.json': JSON.stringify(config, null, 2),
  }

  if (input.framework === 'nextjs') {
    files['app/api/health/route.ts'] = `import { NextResponse } from 'next/server'\nexport async function GET() {\n  return NextResponse.json({ ok: true })\n}`
    files['.env.example'] = `TERMINAL_AI_GATEWAY_URL=\nTERMINAL_AI_APP_ID=`
    if (input.uses_ai) {
      files['lib/terminal-ai.ts'] = `// Terminal AI Gateway SDK\nconst GATEWAY_URL = process.env.TERMINAL_AI_GATEWAY_URL!\n\nexport async function* streamChat(messages: { role: string; content: string }[], embedToken: string) {\n  const res = await fetch(\`\${GATEWAY_URL}/proxy\`, {\n    method: 'POST',\n    headers: { Authorization: \`Bearer \${embedToken}\`, 'Content-Type': 'application/json' },\n    body: JSON.stringify({ provider: 'openrouter', model: 'claude-3-5-haiku', messages, stream: true }),\n  })\n  if (!res.ok) throw new Error(\`Gateway error: \${res.status}\`)\n  const reader = res.body!.getReader()\n  const decoder = new TextDecoder()\n  while (true) {\n    const { done, value } = await reader.read()\n    if (done) break\n    yield decoder.decode(value)\n  }\n}`
    }
  } else if (input.framework === 'python' || input.framework === 'streamlit') {
    files['app.py'] = input.framework === 'streamlit'
      ? `import streamlit as st\nimport os\n\nst.title("${input.app_name}")\n`
      : `from fastapi import FastAPI\nimport os\n\napp = FastAPI()\n\n@app.get("/health")\ndef health():\n    return {"ok": True}\n`
    files['requirements.txt'] = input.framework === 'streamlit'
      ? 'streamlit>=1.32\nhttpx>=0.27\n' : 'fastapi>=0.110\nuvicorn>=0.29\nhttpx>=0.27\n'
    files['.env.example'] = `TERMINAL_AI_GATEWAY_URL=\nTERMINAL_AI_APP_ID=`
  }

  return {
    files,
    instructions: `1. Clone this scaffold\n2. Add your logic\n3. Push to GitHub\n4. Deploy via Terminal AI dashboard`,
    required_env_vars: ['TERMINAL_AI_GATEWAY_URL', 'TERMINAL_AI_APP_ID'],
    notes: [
      'Do NOT call OpenAI/Anthropic directly — all AI calls go through TERMINAL_AI_GATEWAY_URL',
      'Health endpoint is required and must return 200',
      'Never store the embed token in localStorage or cookies',
    ],
  }
}
```

- [ ] **Step 3: Implement MCP server entry**

```ts
// mcp-server/src/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { Hono } from 'hono'
import { z } from 'zod'
import { scaffoldApp } from './tools/scaffold'
import { db } from './lib/db'
import { logger } from './lib/logger'

const app = new Hono()

app.get('/sse', async (c) => {
  const apiKey = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!apiKey) return c.text('Unauthorized', 401)

  // Validate API key
  const key = await db.query(
    `SELECT creator_id FROM mcp.api_keys WHERE key_hash = digest($1, 'sha256') AND revoked_at IS NULL`,
    [apiKey]
  )
  if (!key.rows[0]) return c.text('Invalid API key', 401)

  const creatorId = key.rows[0].creator_id
  const server = new McpServer({ name: 'terminal-ai', version: '1.0.0' })

  server.tool('scaffold_app', {
    framework: z.enum(['nextjs', 'python', 'streamlit', 'static']),
    app_name: z.string(),
    description: z.string(),
    category: z.string(),
    uses_ai: z.boolean(),
    uses_file_upload: z.boolean(),
    generates_artifacts: z.boolean(),
  }, async (input) => {
    const result = scaffoldApp(input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  })

  server.tool('get_deployment_status', { app_id: z.string().uuid() }, async ({ app_id }) => {
    const result = await db.query(
      `SELECT d.status, d.subdomain, d.created_at, d.coolify_app_id
       FROM deployments.deployments d
       JOIN marketplace.apps a ON a.id = d.app_id
       JOIN marketplace.channels ch ON ch.id = a.channel_id
       WHERE a.id = $1 AND ch.creator_id = $2`,
      [app_id, creatorId]
    )
    if (!result.rows[0]) return { content: [{ type: 'text', text: 'App not found' }] }
    return { content: [{ type: 'text', text: JSON.stringify(result.rows[0], null, 2) }] }
  })

  server.tool('list_supported_providers',
    { category: z.enum(['llm', 'search', 'scraping', 'image', 'audio']).optional() },
    async ({ category }) => {
      const providers = [
        { provider: 'openrouter', model: 'claude-3-5-haiku', credits_per_1k_tokens: 1, capabilities: ['chat', 'completion'], recommended_for: ['fast responses', 'simple tasks'] },
        { provider: 'openrouter', model: 'claude-3-5-sonnet', credits_per_1k_tokens: 3, capabilities: ['chat', 'completion', 'reasoning'], recommended_for: ['complex tasks', 'code generation'] },
        { provider: 'openrouter', model: 'gpt-4o-mini', credits_per_1k_tokens: 1, capabilities: ['chat', 'completion'], recommended_for: ['cost-effective chat'] },
        { provider: 'serper', model: 'search', credits_per_call: 2, capabilities: ['web_search'], recommended_for: ['real-time information'] },
      ]
      return { content: [{ type: 'text', text: JSON.stringify(providers, null, 2) }] }
    }
  )

  const transport = new SSEServerTransport('/sse', c.env.res)
  await server.connect(transport)
  return new Response(null)
})

export default app
```

- [ ] **Step 4: Run tests**

```bash
cd mcp-server && bun test src/tools/scaffold.test.ts
```
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add mcp-server/
git commit -m "feat(mcp): MCP server with scaffold_app, deployment status, and provider listing tools"
```

---

# v5 — Social Sharing + Open Platform

**Goal:** OG image generation for channel/app pages. Share buttons in UI. Public channel pages for non-subscribers. Creator revenue dashboard. Platform analytics.

**Files:**
```
platform/
  app/
    api/
      og/
        channel/route.tsx    ← Satori OG image for channel
        app/route.tsx        ← Satori OG image for app
    c/
      [channelSlug]/
        page.tsx             ← public channel page (generateMetadata)
      [channelSlug]/[appSlug]/
        page.tsx             ← public app page (generateMetadata)
  components/
    share-button.tsx         ← share dropdown component
  lib/
    og.ts                    ← shared OG image primitives
```

---

### Task v5-1: OG Image Generation

**Files:**
- Create: `platform/lib/og.ts`
- Create: `platform/app/api/og/channel/route.tsx`
- Create: `platform/app/api/og/app/route.tsx`
- Test: `platform/lib/og.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// platform/lib/og.test.ts
import { describe, it, expect } from 'vitest'
import { loadFonts } from './og'

describe('loadFonts', () => {
  it('returns non-empty ArrayBuffers for regular and bold', async () => {
    const fonts = await loadFonts()
    expect(fonts.regular.byteLength).toBeGreaterThan(0)
    expect(fonts.bold.byteLength).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Implement og.ts**

```ts
// platform/lib/og.ts
import { cache } from 'react'

interface Fonts {
  regular: ArrayBuffer
  bold: ArrayBuffer
}

// Cached at module level — loaded once, reused for all OG renders
let fontsCache: Fonts | null = null

export const loadFonts = cache(async (): Promise<Fonts> => {
  if (fontsCache) return fontsCache

  const MINIO_URL = process.env.MINIO_PUBLIC_URL!
  const [regular, bold] = await Promise.all([
    fetch(`${MINIO_URL}/assets/fonts/GeistSans-Regular.otf`).then(r => r.arrayBuffer()),
    fetch(`${MINIO_URL}/assets/fonts/GeistSans-Bold.otf`).then(r => r.arrayBuffer()),
  ])
  fontsCache = { regular, bold }
  return fontsCache
})

export const OG_DIMENSIONS = { width: 1200, height: 630 }

export const COLORS = {
  bg: '#09090b',
  primaryText: '#ffffff',
  secondaryText: '#a1a1aa',
  accent: '#7c3aed',
  border: '#27272a',
}
```

- [ ] **Step 3: Implement channel OG route**

```tsx
// platform/app/api/og/channel/route.tsx
import { ImageResponse } from 'next/og'
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'
import { loadFonts, OG_DIMENSIONS, COLORS } from '@/lib/og'
import sharp from 'sharp'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')
  if (!slug) return new Response('Missing slug', { status: 400 })

  // Cache check
  const cacheKey = `og:channel:${slug}`
  const cached = await redis.getBuffer(cacheKey)
  if (cached) {
    return new Response(cached, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
    })
  }

  const result = await db.query(
    `SELECT ch.name, ch.description, u.display_name, u.avatar_url,
            COUNT(DISTINCT s.id) as subscriber_count,
            MIN(pl.price_inr) as min_price
     FROM marketplace.channels ch
     JOIN auth.users u ON u.id = ch.creator_id
     LEFT JOIN subscriptions.subscriptions s ON s.channel_id = ch.id AND s.status = 'active'
     LEFT JOIN subscriptions.plans pl ON pl.channel_id = ch.id
     WHERE ch.slug = $1 AND ch.deleted_at IS NULL
     GROUP BY ch.name, ch.description, u.display_name, u.avatar_url`,
    [slug]
  )

  const channel = result.rows[0]
  if (!channel) return new Response('Not found', { status: 404 })

  const fonts = await loadFonts()

  const image = new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '1200px',
          height: '630px',
          background: COLORS.bg,
          padding: '48px',
          fontFamily: 'Geist Sans',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {channel.avatar_url && (
              <img src={channel.avatar_url} width={56} height={56}
                style={{ borderRadius: '50%', border: `2px solid ${COLORS.border}` }} />
            )}
            <div>
              <div style={{ color: COLORS.primaryText, fontSize: '18px', fontWeight: 600 }}>
                {channel.display_name}
              </div>
              <div style={{ color: COLORS.secondaryText, fontSize: '14px' }}>@{slug}</div>
            </div>
          </div>
          <div style={{ color: COLORS.secondaryText, fontSize: '20px', fontWeight: 700 }}>
            terminal ai
          </div>
        </div>

        <div style={{ color: COLORS.primaryText, fontSize: '48px', fontWeight: 700, lineHeight: 1.1, marginBottom: '16px' }}>
          {channel.name}
        </div>

        <div style={{ color: COLORS.secondaryText, fontSize: '20px', marginBottom: 'auto' }}>
          {channel.description?.slice(0, 80)}{(channel.description?.length ?? 0) > 80 ? '…' : ''}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: COLORS.secondaryText, fontSize: '16px' }}>
          <span>● {channel.subscriber_count} subscribers</span>
          {channel.min_price && (
            <span style={{ background: COLORS.accent, color: '#fff', padding: '6px 16px', borderRadius: '8px', fontSize: '16px', fontWeight: 600 }}>
              from ₹{(channel.min_price / 100).toFixed(0)}/month
            </span>
          )}
        </div>
      </div>
    ),
    {
      ...OG_DIMENSIONS,
      fonts: [
        { name: 'Geist Sans', data: fonts.regular, weight: 400 },
        { name: 'Geist Sans', data: fonts.bold, weight: 700 },
      ],
    }
  )

  const buffer = await sharp(Buffer.from(await image.arrayBuffer()))
    .png({ compressionLevel: 9 })
    .toBuffer()

  await redis.set(cacheKey, buffer, 'EX', 3600)

  return new Response(buffer, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
  })
}
```

- [ ] **Step 4: Add generateMetadata to channel page**

```tsx
// platform/app/c/[channelSlug]/page.tsx — add to existing file
export async function generateMetadata({ params }: { params: Promise<{ channelSlug: string }> }) {
  const { channelSlug } = await params
  const channel = await getChannelData(channelSlug)
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL!
  const ogUrl = `${BASE_URL}/api/og/channel?slug=${channelSlug}`

  return {
    title: `${channel.name} — Terminal AI`,
    description: channel.description,
    openGraph: {
      title: channel.name,
      description: channel.description,
      url: `${BASE_URL}/c/${channelSlug}`,
      siteName: 'Terminal AI',
      images: [{ url: ogUrl, width: 1200, height: 630, alt: channel.name }],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: channel.name,
      description: channel.description,
      images: [ogUrl],
    },
  }
}
```

- [ ] **Step 5: Run tests**

```bash
cd platform && bun test lib/og.test.ts
```
Expected: PASS (1 test)

- [ ] **Step 6: Commit**

```bash
git add platform/lib/og.ts platform/app/api/og/ platform/app/c/
git commit -m "feat(social): OG image generation with Satori + Sharp, Redis caching, channel metadata"
```

---

### Task v5-2: Share Button Component

**Files:**
- Create: `platform/components/share-button.tsx`
- Test: `platform/components/share-button.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// platform/components/share-button.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShareButton } from './share-button'

describe('ShareButton', () => {
  it('shows share options on click', async () => {
    render(<ShareButton url="https://terminalai.app/c/test" title="Test Channel" type="channel" />)
    fireEvent.click(screen.getByText(/share/i))
    expect(await screen.findByText(/copy link/i)).toBeInTheDocument()
    expect(screen.getByText(/share on x/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Implement share-button.tsx**

```tsx
// platform/components/share-button.tsx
'use client'

import { useState, useRef, useEffect } from 'react'

interface ShareButtonProps {
  url: string
  title: string
  description?: string
  type: 'channel' | 'app'
}

export function ShareButton({ url, title, description = '', type }: ShareButtonProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const copyLink = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const shareX = () => {
    const text = `${title} on Terminal AI — ${description.slice(0, 100)}`
    window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank')
  }

  const shareLinkedIn = () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank')
  }

  const shareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${title} on Terminal AI: ${url}`)}`, '_blank')
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white text-sm font-medium transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        Share
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-52 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <p className="text-sm font-medium text-white">Share this {type}</p>
          </div>
          <div className="py-1">
            <button onClick={copyLink}
              className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
              {copied ? '✓ Copied!' : '📋 Copy link'}
            </button>
            <button onClick={shareX}
              className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
              𝕏 Share on X
            </button>
            <button onClick={shareLinkedIn}
              className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
              💼 Share on LinkedIn
            </button>
            <button onClick={shareWhatsApp}
              className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
              💬 Share on WhatsApp
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Run tests**

```bash
cd platform && bun test components/share-button.test.tsx
```
Expected: PASS (1 test)

- [ ] **Step 4: Commit**

```bash
git add platform/components/share-button.tsx platform/components/share-button.test.tsx
git commit -m "feat(social): share button with copy link, X, LinkedIn, WhatsApp"
```

---

## Version Completion Checklist

### v2 Done When:
- [ ] Users can subscribe to a channel via Razorpay
- [ ] Creator can deploy an app via dashboard (triggers deploy-manager queue)
- [ ] Credit ledger working with atomic CTE deduction
- [ ] Razorpay webhooks verified and idempotent

### v3 Done When:
- [ ] File uploads (images, PDFs) accepted, scanned by ClamAV, compressed, stored in MinIO
- [ ] K-model vote and judge both callable from proxy route
- [ ] Artifacts (generated files) downloadable via signed MinIO URLs

### v4 Done When:
- [ ] Every API call records a behavioral_signal row
- [ ] Langfuse traces visible in self-hosted dashboard (PII hashed)
- [ ] MCP server live at `mcp.terminalai.app`, scaffold_app tool working in Claude Code
- [ ] Weekly optimizer job running via BullMQ cron

### v5 Done When:
- [ ] OG images generated for channel and app pages
- [ ] Social share metadata (og:image, twitter:card) in all public pages
- [ ] Share button on channel and app detail pages
- [ ] Cache invalidation on channel/app updates (Redis key deleted)
