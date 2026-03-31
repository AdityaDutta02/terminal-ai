# P4 — System Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden all three services (platform, gateway, deploy-manager) for production: Zod on every public route, pino structured logging everywhere, Redis rate limiting, 4 critical DB indexes, a public status page, and an ops runbook.

**Architecture:** Audit-first tasks — grep for violations, fix them, then add new hardening. Each task targets one system concern (validation, logging, rate limiting, etc.) and is independently deployable.

**Tech Stack:** Zod, pino, Redis sliding-window rate limiting, PostgreSQL partial indexes, Next.js Route Handlers, Hono middleware.

---

### Task 1: Migration — audit_log columns + 4 critical indexes

**Files:**
- Create: `platform/lib/db/migrations/013_audit_log_v2.sql`
- Create: `platform/lib/db/migrations/014_indexes.sql`

- [ ] **Step 1: Write audit log migration**

```sql
-- platform/lib/db/migrations/013_audit_log_v2.sql
ALTER TABLE platform.audit_log
  ADD COLUMN IF NOT EXISTS ip_address INET,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS request_id TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_recent
  ON platform.audit_log(actor_user_id, created_at DESC);
```

- [ ] **Step 2: Write index migration**

```sql
-- platform/lib/db/migrations/014_indexes.sql

-- Speed up credit balance queries (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_recent
  ON subscriptions.credit_ledger(user_id, created_at DESC);

-- Speed up embed token lookups (hot path: every gateway request)
CREATE INDEX IF NOT EXISTS idx_embed_tokens_hash_active
  ON gateway.embed_tokens(token_hash)
  WHERE expires_at > NOW();

-- Speed up marketplace listing (partial index, live+undeleted only)
CREATE INDEX IF NOT EXISTS idx_apps_active
  ON marketplace.apps(id)
  WHERE deleted_at IS NULL AND status = 'live';

-- Speed up session history queries
CREATE INDEX IF NOT EXISTS idx_api_calls_user_app
  ON gateway.api_calls(user_id, app_id, created_at DESC);
```

- [ ] **Step 3: Apply migrations**

```bash
psql $DATABASE_URL -f platform/lib/db/migrations/013_audit_log_v2.sql
psql $DATABASE_URL -f platform/lib/db/migrations/014_indexes.sql
```

Expected output: `ALTER TABLE`, 4x `CREATE INDEX` — no errors.

- [ ] **Step 4: Verify indexes exist**

```bash
psql $DATABASE_URL -c "\di idx_credit_ledger_user_recent idx_embed_tokens_hash_active idx_apps_active idx_api_calls_user_app"
```

Expected: 4 rows returned.

- [ ] **Step 5: Commit**

```bash
git add platform/lib/db/migrations/013_audit_log_v2.sql platform/lib/db/migrations/014_indexes.sql
git commit -m "feat(db): audit_log columns + 4 critical performance indexes (P4)"
```

---

### Task 2: Platform logger + replace all console.log

**Files:**
- Create: `platform/lib/logger.ts`
- Modify: all platform files containing `console.log`

- [ ] **Step 1: Verify pino is installed**

```bash
cd platform && cat package.json | grep pino
```

If not present:
```bash
cd platform && npm install pino
```

- [ ] **Step 2: Create platform logger**

```typescript
// platform/lib/logger.ts
import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: { service: 'platform' },
})
```

- [ ] **Step 3: Find all console.log occurrences in platform**

```bash
grep -rn "console\." platform/app/ platform/lib/ --include="*.ts" --include="*.tsx"
```

For each occurrence, replace:
- `console.log(...)` → `logger.info({ msg: '...' })`
- `console.error(...)` → `logger.error({ msg: '...' })`
- `console.warn(...)` → `logger.warn({ msg: '...' })`

Note: `platform/app/global-error.tsx` is a client component — it cannot use pino. Leave any `console.error` in client error boundaries as-is.

- [ ] **Step 4: Create global error boundary**

```typescript
// platform/app/global-error.tsx
'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="mt-1 text-sm text-gray-500">{error.message}</p>
          <button
            onClick={reset}
            className="mt-4 px-4 py-2 text-sm bg-primary text-white rounded"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
```

- [ ] **Step 5: Verify no console.log remains**

```bash
grep -rn "console\." platform/app/ platform/lib/ --include="*.ts" --include="*.tsx" | grep -v "global-error"
```

Expected: 0 results (except allowed client-side error boundaries).

- [ ] **Step 6: Commit**

```bash
git add platform/lib/logger.ts platform/app/global-error.tsx
git add -p  # stage specific console.log replacements
git commit -m "feat(platform): pino structured logging, remove console.log (P4)"
```

---

### Task 3: Zod validation on all platform API routes

**Files:**
- Modify: `platform/app/api/embed-token/route.ts`
- Modify: `platform/app/api/subscriptions/route.ts`
- Modify: `platform/app/api/credits/route.ts`
- Modify: all creator and admin routes that accept POST/PATCH body

- [ ] **Step 1: Find all routes accepting user input**

```bash
grep -rln "req\.json()" platform/app/api/ --include="*.ts"
```

For each file, check whether a Zod schema is already present:
```bash
grep -l "z\.object" platform/app/api/ -r --include="*.ts"
```

Files without Zod but with `req.json()` need schemas added.

- [ ] **Step 2: Add Zod schema to embed-token route**

In `platform/app/api/embed-token/route.ts`, add at the top:

```typescript
import { z } from 'zod'

const embedTokenSchema = z.object({
  appId: z.string().uuid(),
})
```

Replace `const body = await req.json()` with:
```typescript
const parsed = embedTokenSchema.safeParse(await req.json())
if (!parsed.success) {
  return NextResponse.json(
    { error: 'Invalid request', details: parsed.error.flatten() },
    { status: 400 }
  )
}
const { appId } = parsed.data
```

- [ ] **Step 3: Add Zod schema to subscriptions route**

In `platform/app/api/subscriptions/route.ts`, add:

```typescript
import { z } from 'zod'

const subscribeSchema = z.object({
  planId: z.enum(['starter', 'creator', 'pro']),
})
```

- [ ] **Step 4: Add Zod schema to credits purchase route**

In `platform/app/api/credits/route.ts`, add:

```typescript
import { z } from 'zod'

const purchaseSchema = z.object({
  packId: z.enum(['pack_100', 'pack_500', 'pack_2000']),
})
```

- [ ] **Step 5: Add Zod schemas to creator app PATCH route**

In `platform/app/api/creator/apps/[appId]/route.ts` (or wherever app updates are handled), add:

```typescript
import { z } from 'zod'

const updateAppSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(['live', 'draft']).optional(),
  model_tier: z.enum(['standard', 'advanced', 'premium', 'image-fast', 'image-pro']).optional(),
  is_free: z.boolean().optional(),
}).strict()
```

- [ ] **Step 6: Add Zod schemas to admin routes**

In `platform/app/api/admin/users/[userId]/ban/route.ts`:
```typescript
const banSchema = z.object({
  reason: z.string().min(1).max(500),
})
```

In `platform/app/api/admin/credits/grant/route.ts`:
```typescript
const grantSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().int().min(1).max(10000),
  reason: z.string().min(1).max(500),
})
```

- [ ] **Step 7: Write test for Zod validation**

Create `platform/app/api/embed-token/route.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn().mockResolvedValue({ user: { id: 'user-123' } }) } },
}))
vi.mock('@/lib/db', () => ({
  db: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}))

// Import after mocks
const { POST } = await import('./route')

describe('POST /api/embed-token', () => {
  it('returns 400 for invalid appId', async () => {
    const req = new Request('http://localhost/api/embed-token', {
      method: 'POST',
      body: JSON.stringify({ appId: 'not-a-uuid' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid request')
  })
})
```

- [ ] **Step 8: Run tests**

```bash
cd platform && npx vitest run
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add platform/app/api/
git commit -m "feat(platform): Zod input validation on all public API routes (P4)"
```

---

### Task 4: Authorization audit — internal secret header

**Files:**
- Create: `platform/lib/middleware/internal-auth.ts`
- Modify: `platform/app/api/cron/*/route.ts`
- Modify: `deploy-manager/src/index.ts`

- [ ] **Step 1: Create internal auth helper**

```typescript
// platform/lib/middleware/internal-auth.ts
import { NextResponse } from 'next/server'

export function validateInternalRequest(req: Request): NextResponse | null {
  const secret = req.headers.get('x-internal-secret')
  if (!secret || secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}
```

- [ ] **Step 2: Apply to cron routes**

In each `platform/app/api/cron/*/route.ts`, add at the top of the handler:

```typescript
import { validateInternalRequest } from '@/lib/middleware/internal-auth'

export async function POST(req: Request): Promise<Response> {
  const authError = validateInternalRequest(req)
  if (authError) return authError
  // ... rest of handler
}
```

- [ ] **Step 3: Add INTERNAL_SECRET check to deploy-manager**

In `deploy-manager/src/index.ts`, add a middleware for internal auth:

```typescript
// After imports, add middleware:
app.use('/deploy', async (c, next) => {
  const secret = c.req.header('x-internal-secret')
  if (!secret || secret !== process.env.INTERNAL_SECRET) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  await next()
})

// Also protect delete and retry endpoints:
app.use('/apps/*', async (c, next) => {
  const secret = c.req.header('x-internal-secret')
  if (!secret || secret !== process.env.INTERNAL_SECRET) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  await next()
})
```

- [ ] **Step 4: Update platform to send INTERNAL_SECRET when calling deploy-manager**

Find the platform code that calls deploy-manager (likely in `platform/app/api/creator/apps/[appId]/redeploy/route.ts` and the initial deploy route). Add the header:

```typescript
const res = await fetch(`${DEPLOY_MANAGER_URL}/deploy`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-internal-secret': process.env.INTERNAL_SECRET ?? '',
  },
  body: JSON.stringify(payload),
})
```

- [ ] **Step 5: Commit**

```bash
git add platform/lib/middleware/internal-auth.ts \
        platform/app/api/cron/ \
        deploy-manager/src/index.ts \
        platform/app/api/creator/
git commit -m "feat(security): INTERNAL_SECRET header for all inter-service calls (P4)"
```

---

### Task 5: Redis rate limiting — gateway + platform

**Files:**
- Create: `gateway/src/middleware/rate-limit.ts`
- Create: `platform/lib/middleware/rate-limit.ts`
- Modify: `gateway/src/index.ts`
- Modify: `platform/app/api/embed-token/route.ts`

- [ ] **Step 1: Create gateway rate limiter**

```typescript
// gateway/src/middleware/rate-limit.ts
import type { Context, Next } from 'hono'
import { createClient } from 'redis'

let redisClient: ReturnType<typeof createClient> | null = null

function getRedis() {
  if (!redisClient) {
    redisClient = createClient({ url: process.env.REDIS_URL ?? 'redis://redis:6379' })
    redisClient.connect().catch(() => {
      // Redis unavailable — rate limiting disabled
      redisClient = null
    })
  }
  return redisClient
}

/**
 * Sliding window rate limiter.
 * Returns true if the request is allowed, false if rate limited.
 */
async function checkLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return true // fail open if Redis unavailable

  const now = Date.now()
  const windowStart = now - windowMs
  const rateLimitKey = `rl:${key}`

  const count = await redis.zCount(rateLimitKey, windowStart, now)
  if (count >= limit) return false

  await redis.zAdd(rateLimitKey, { score: now, value: `${now}` })
  await redis.zRemRangeByScore(rateLimitKey, '-inf', windowStart - 1)
  await redis.expire(rateLimitKey, Math.ceil(windowMs / 1000))
  return true
}

export function gatewayRateLimit() {
  return async (c: Context, next: Next) => {
    const userId = c.get('userId') as string | undefined
    const key = userId ? `user:${userId}` : `ip:${c.req.header('x-forwarded-for') ?? 'unknown'}`
    const limit = userId ? 60 : 5 // 60 req/min for auth, 5 for anon

    const allowed = await checkLimit(key, limit, 60_000)
    if (!allowed) {
      return c.json({ error: 'Rate limit exceeded. Try again in a minute.' }, 429)
    }
    await next()
  }
}
```

- [ ] **Step 2: Apply gateway rate limiter**

In `gateway/src/index.ts`, add after the auth middleware:

```typescript
import { gatewayRateLimit } from './middleware/rate-limit'

// Add after auth middleware, before route handlers:
app.use('/v1/*', gatewayRateLimit())
```

- [ ] **Step 3: Create platform rate limiter**

```typescript
// platform/lib/middleware/rate-limit.ts
import { NextResponse } from 'next/server'
import { createClient } from 'redis'

let redis: ReturnType<typeof createClient> | null = null

function getRedis() {
  if (!redis) {
    redis = createClient({ url: process.env.REDIS_URL })
    redis.connect().catch(() => { redis = null })
  }
  return redis
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const r = getRedis()
  if (!r) return true // fail open

  const now = Date.now()
  const windowStart = now - windowMs
  const rlKey = `rl:platform:${key}`

  const count = await r.zCount(rlKey, windowStart, now)
  if (count >= limit) return false

  await r.zAdd(rlKey, { score: now, value: `${now}` })
  await r.zRemRangeByScore(rlKey, '-inf', windowStart - 1)
  await r.expire(rlKey, Math.ceil(windowMs / 1000))
  return true
}

export function rateLimitResponse(): Response {
  return NextResponse.json(
    { error: 'Too many requests. Please slow down.' },
    { status: 429 }
  )
}
```

- [ ] **Step 4: Apply rate limits to embed-token route**

In `platform/app/api/embed-token/route.ts`, add after auth check:

```typescript
import { checkRateLimit, rateLimitResponse } from '@/lib/middleware/rate-limit'

// After session check, before DB queries:
const allowed = await checkRateLimit(`embed:${session.user.id}`, 10, 60_000)
if (!allowed) return rateLimitResponse()
```

- [ ] **Step 5: Apply rate limits to credits purchase route**

In `platform/app/api/credits/route.ts`, after auth check:

```typescript
const allowed = await checkRateLimit(`credits:${session.user.id}`, 3, 60_000)
if (!allowed) return rateLimitResponse()
```

- [ ] **Step 6: Write rate limit test**

Create `platform/lib/middleware/rate-limit.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Redis client
const mockZCount = vi.fn().mockResolvedValue(0)
const mockZAdd = vi.fn().mockResolvedValue(1)
const mockZRemRangeByScore = vi.fn().mockResolvedValue(0)
const mockExpire = vi.fn().mockResolvedValue(1)
const mockConnect = vi.fn().mockResolvedValue(undefined)

vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    connect: mockConnect,
    zCount: mockZCount,
    zAdd: mockZAdd,
    zRemRangeByScore: mockZRemRangeByScore,
    expire: mockExpire,
  })),
}))

import { checkRateLimit } from './rate-limit'

describe('checkRateLimit', () => {
  beforeEach(() => {
    mockZCount.mockResolvedValue(0)
    vi.clearAllMocks()
  })

  it('allows request when under limit', async () => {
    mockZCount.mockResolvedValue(5)
    const result = await checkRateLimit('user:123', 10, 60_000)
    expect(result).toBe(true)
  })

  it('blocks request when at limit', async () => {
    mockZCount.mockResolvedValue(10)
    const result = await checkRateLimit('user:123', 10, 60_000)
    expect(result).toBe(false)
  })
})
```

- [ ] **Step 7: Run tests**

```bash
cd platform && npx vitest run src/lib/middleware/rate-limit.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add gateway/src/middleware/rate-limit.ts \
        platform/lib/middleware/rate-limit.ts \
        platform/lib/middleware/rate-limit.test.ts \
        gateway/src/index.ts \
        platform/app/api/embed-token/route.ts \
        platform/app/api/credits/route.ts
git commit -m "feat(security): Redis sliding-window rate limiting — gateway + platform (P4)"
```

---

### Task 6: Secrets audit + CORS hardening

**Files:**
- Modify: `gateway/src/index.ts` (CORS)
- Create: `docs/secrets-checklist.md`

- [ ] **Step 1: Run gitleaks scan**

```bash
gitleaks detect --source . --report-format json --report-path /tmp/gitleaks-report.json
```

Expected: `No leaks found`.

If leaks found: identify each file, rotate the credential immediately, never push the leak. Use environment variables instead.

- [ ] **Step 2: Harden CORS in gateway**

In `gateway/src/index.ts`, find the CORS configuration and update to strict allowlist:

```typescript
import { cors } from 'hono/cors'

app.use('/v1/*', cors({
  origin: (origin) => {
    if (!origin) return null // block no-origin (non-browser) requests
    if (origin === 'https://terminalai.app') return origin
    if (/^https:\/\/[a-z0-9-]+\.apps\.terminalai\.app$/.test(origin)) return origin
    return null // block all other origins
  },
  allowMethods: ['POST', 'OPTIONS'],
  allowHeaders: ['Authorization', 'Content-Type'],
  maxAge: 86400,
}))
```

- [ ] **Step 3: Create secrets checklist doc**

Create `docs/secrets-checklist.md`:

```markdown
# Secrets Checklist

## Required Environment Variables

### Platform (Next.js)
- [ ] BETTER_AUTH_SECRET — min 32 chars, random (rotate annually)
- [ ] EMBED_TOKEN_SECRET — min 32 chars, random (rotate if compromised)
- [ ] INTERNAL_SECRET — min 32 chars, random, shared with deploy-manager
- [ ] CRON_SECRET — min 32 chars, random
- [ ] RAZORPAY_KEY_ID — from Razorpay dashboard
- [ ] RAZORPAY_KEY_SECRET — from Razorpay dashboard (never expose to client)
- [ ] NEXT_PUBLIC_RAZORPAY_KEY_ID — same as RAZORPAY_KEY_ID (safe to expose)
- [ ] DATABASE_URL — postgres connection string
- [ ] REDIS_URL — redis connection string
- [ ] NEXT_PUBLIC_APP_URL — https://terminalai.app
- [ ] DEPLOY_MANAGER_URL — http://deploy-manager:3002
- [ ] LOG_LEVEL — info (production), debug (local)

### Gateway (Hono)
- [ ] OPENROUTER_API_KEY — from OpenRouter
- [ ] EMBED_TOKEN_SECRET — same as platform
- [ ] DATABASE_URL — postgres connection string
- [ ] REDIS_URL — redis connection string

### Deploy Manager (Hono + BullMQ)
- [ ] COOLIFY_URL — Coolify instance URL on VPS2
- [ ] COOLIFY_TOKEN — Coolify API token
- [ ] COOLIFY_SERVER_UUID — from Coolify server settings
- [ ] COOLIFY_PROJECT_UUID — from Coolify project settings
- [ ] GATEWAY_URL — internal URL to gateway service
- [ ] DATABASE_URL — postgres connection string
- [ ] REDIS_HOST — redis hostname
- [ ] INTERNAL_SECRET — same as platform
- [ ] CLOUDFLARE_TOKEN — optional, for DNS automation
- [ ] CLOUDFLARE_ZONE_ID — optional
- [ ] VPS2_IP — optional

## Rotation Procedure
1. Generate new secret: `openssl rand -base64 32`
2. Update in production environment manager (Docker secrets / .env.production)
3. Redeploy affected services
4. Verify service health after rotation
5. Revoke old secret

## Emergency: Credential Leak
1. Immediately rotate compromised credential
2. Check git history: `git log --all --full-history -- '**/.env*'`
3. If pushed to remote: consider the credential compromised regardless of deletion
4. Notify relevant service provider (Razorpay, Coolify, etc.)
```

- [ ] **Step 4: Commit**

```bash
git add gateway/src/index.ts docs/secrets-checklist.md
git commit -m "feat(security): strict CORS origin allowlist + secrets checklist (P4)"
```

---

### Task 7: Status page

**Files:**
- Create: `platform/app/api/status/route.ts`
- Create: `platform/app/(marketplace)/status/page.tsx`

- [ ] **Step 1: Create status API route**

```typescript
// platform/app/api/status/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://gateway:4000'
const DEPLOY_MANAGER_URL = process.env.DEPLOY_MANAGER_URL ?? 'http://deploy-manager:3002'

type ServiceStatus = 'operational' | 'degraded' | 'outage'

async function checkService(url: string): Promise<{ status: ServiceStatus; latencyMs: number }> {
  const start = Date.now()
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3_000) })
    const latencyMs = Date.now() - start
    return { status: res.ok ? 'operational' : 'degraded', latencyMs }
  } catch {
    return { status: 'outage', latencyMs: Date.now() - start }
  }
}

async function checkDatabase(): Promise<{ status: ServiceStatus; latencyMs: number }> {
  const start = Date.now()
  try {
    await db.query('SELECT 1')
    return { status: 'operational', latencyMs: Date.now() - start }
  } catch {
    return { status: 'outage', latencyMs: Date.now() - start }
  }
}

function overallStatus(services: Record<string, { status: ServiceStatus }>): ServiceStatus {
  const statuses = Object.values(services).map((s) => s.status)
  if (statuses.includes('outage')) return 'outage'
  if (statuses.includes('degraded')) return 'degraded'
  return 'operational'
}

export async function GET(): Promise<Response> {
  const [gateway, deployManager, database] = await Promise.all([
    checkService(GATEWAY_URL),
    checkService(DEPLOY_MANAGER_URL),
    checkDatabase(),
  ])

  const services = {
    platform: { status: 'operational' as ServiceStatus, latencyMs: 0 },
    gateway,
    deploy_manager: deployManager,
    database,
  }

  return NextResponse.json(
    {
      status: overallStatus(services),
      services,
      checked_at: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
```

- [ ] **Step 2: Write status API test**

Create `platform/app/api/status/route.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: { query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) },
}))

global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response)

const { GET } = await import('./route')

describe('GET /api/status', () => {
  it('returns operational when all services healthy', async () => {
    const res = await GET()
    const body = await res.json()
    expect(body.status).toBe('operational')
    expect(body.services.database.status).toBe('operational')
  })

  it('returns degraded when a service fails', async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Connection refused'))
    const res = await GET()
    const body = await res.json()
    expect(['degraded', 'outage']).toContain(body.status)
  })
})
```

- [ ] **Step 3: Run tests**

```bash
cd platform && npx vitest run app/api/status/
```

Expected: PASS.

- [ ] **Step 4: Create status frontend page**

```typescript
// platform/app/(marketplace)/status/page.tsx
import Link from 'next/link'

type ServiceStatus = 'operational' | 'degraded' | 'outage'

const STATUS_COLORS: Record<ServiceStatus, string> = {
  operational: 'bg-green-500',
  degraded: 'bg-amber-500',
  outage: 'bg-red-500',
}

const STATUS_LABELS: Record<ServiceStatus, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  outage: 'Outage',
}

async function getStatus() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/status`, {
      cache: 'no-store',
    })
    return res.json() as Promise<{
      status: ServiceStatus
      services: Record<string, { status: ServiceStatus; latencyMs: number }>
      checked_at: string
    }>
  } catch {
    return null
  }
}

function ServiceRow({ name, status, latencyMs }: { name: string; status: ServiceStatus; latencyMs: number }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[status]}`} />
        <span className="text-sm capitalize">{name.replace('_', ' ')}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-muted-foreground font-mono">{latencyMs}ms</span>
        <span className={`text-xs font-medium ${status === 'operational' ? 'text-green-600' : 'text-amber-600'}`}>
          {STATUS_LABELS[status]}
        </span>
      </div>
    </div>
  )
}

export const revalidate = 30

export default async function StatusPage() {
  const data = await getStatus()

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="font-display text-xl">Terminal AI</Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="font-display text-4xl">System Status</h1>
          {data && (
            <p className="mt-2 text-muted-foreground text-sm">
              Last updated {new Date(data.checked_at).toLocaleTimeString()}
            </p>
          )}
        </div>

        {!data ? (
          <div className="text-muted-foreground">Unable to fetch status. Try refreshing.</div>
        ) : (
          <>
            <div className={`rounded border p-4 mb-8 ${
              data.status === 'operational'
                ? 'border-green-200 bg-green-50'
                : 'border-amber-200 bg-amber-50'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${STATUS_COLORS[data.status]}`} />
                <span className="font-medium">
                  {data.status === 'operational'
                    ? 'All systems operational'
                    : 'Some systems degraded'}
                </span>
              </div>
            </div>

            <div className="border border-border rounded overflow-hidden">
              {Object.entries(data.services).map(([name, service]) => (
                <ServiceRow
                  key={name}
                  name={name}
                  status={service.status}
                  latencyMs={service.latencyMs}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add platform/app/api/status/ platform/app/(marketplace)/status/
git commit -m "feat(platform): status page + health check API (P4)"
```

---

### Task 8: Operational runbook

**Files:**
- Create: `docs/runbook.md`

- [ ] **Step 1: Create runbook**

```markdown
# Terminal AI — Operational Runbook

## 1. Grant Credits Manually

**Via admin UI** (recommended):
1. Navigate to `/admin/users/{userId}`
2. Click "Grant Credits"
3. Enter amount and reason
4. Submit — creates credit_ledger entry with `type='admin_grant'`

**Via SQL** (emergency):
```sql
INSERT INTO subscriptions.credit_ledger (user_id, amount, type, description, reference_id)
VALUES ('{userId}', {amount}, 'admin_grant', 'Manual grant: {reason}', gen_random_uuid());
```

## 2. Force-Redeploy an App

**Via creator UI**: Creator Dashboard → App → Deployments → Redeploy button.

**Via API**:
```bash
curl -X POST https://terminalai.app/api/creator/apps/{appId}/redeploy \
  -H "Cookie: {session-cookie}"
```

**Via deploy-manager directly** (if platform is down):
```bash
curl -X POST http://localhost:3002/deployments/{deploymentId}/retry \
  -H "x-internal-secret: ${INTERNAL_SECRET}"
```

## 3. Rotate Secrets

1. Generate new value: `openssl rand -base64 32`
2. Update in `.env.production` (or Docker secrets)
3. Rolling restart:
   ```bash
   docker compose up -d --no-deps platform
   docker compose up -d --no-deps gateway
   docker compose up -d --no-deps deploy-manager
   ```
4. Verify `/api/status` shows all services operational

For EMBED_TOKEN_SECRET rotation: all existing embed tokens become invalid immediately. Users will get a new token on their next session.

## 4. Investigate Billing Discrepancy

1. Check credit_ledger for the user:
```sql
SELECT * FROM subscriptions.credit_ledger
WHERE user_id = '{userId}'
ORDER BY created_at DESC LIMIT 50;
```

2. Check gateway api_calls:
```sql
SELECT * FROM gateway.api_calls
WHERE user_id = '{userId}'
ORDER BY created_at DESC LIMIT 50;
```

3. Compare: sum of ledger debits should equal sum of api_calls credits_used.

4. If mismatch found, check for failed sessions (session started, gateway error before completion).

## 5. Check Coolify App Health

```bash
# List all apps
curl -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
  ${COOLIFY_URL}/api/v1/applications

# Check specific app
curl -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
  ${COOLIFY_URL}/api/v1/applications/{coolifyAppId}

# Restart app
curl -X POST -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
  ${COOLIFY_URL}/api/v1/applications/{coolifyAppId}/restart
```

## 6. Clear BullMQ Stuck Jobs

```bash
# Access Redis
redis-cli -h ${REDIS_HOST}

# List stuck jobs
> LRANGE bull:deploys:active 0 -1

# Clear all stuck/failed jobs (use with caution)
> DEL bull:deploys:active
> DEL bull:deploys:failed
```

Or use the BullMQ dashboard (Bull Board) if deployed at `/admin/queues`.

## 7. Emergency: Disable Anonymous Usage

Set the feature flag in the gateway config:

```bash
# In gateway environment:
ALLOW_ANONYMOUS=false

# Restart gateway
docker compose up -d --no-deps gateway
```

Or add a DB flag:
```sql
INSERT INTO platform.feature_flags (key, value) VALUES ('anonymous_usage_enabled', 'false')
ON CONFLICT (key) DO UPDATE SET value = 'false';
```

Then check this flag in `gateway/src/routes/proxy.ts` before allowing anonymous requests.
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbook.md
git commit -m "docs: operational runbook with 7 procedures (P4)"
```

---

### Task 9: Final audit verification

- [ ] **Step 1: gitleaks clean scan**

```bash
gitleaks detect --source . --report-format json --report-path /tmp/gitleaks-final.json
echo "Exit code: $?"
```

Expected: exit code 0, no leaks.

- [ ] **Step 2: No console.log across all services**

```bash
grep -rn "console\." platform/app/ platform/lib/ gateway/src/ deploy-manager/src/ \
  --include="*.ts" --include="*.tsx" | grep -v "global-error"
```

Expected: 0 results.

- [ ] **Step 3: All public routes have Zod**

```bash
# Find routes with req.json() but no zod import
for f in $(grep -rl "req\.json()" platform/app/api/ --include="*.ts"); do
  if ! grep -q "from 'zod'" "$f"; then
    echo "MISSING ZOD: $f"
  fi
done
```

Expected: no output.

- [ ] **Step 4: Run full test suite**

```bash
cd platform && npx vitest run
cd ../gateway && npx vitest run
cd ../deploy-manager && npx vitest run
```

Expected: all PASS.

- [ ] **Step 5: Verify status page**

```bash
curl https://terminalai.app/api/status | jq .
```

Expected: `"status": "operational"` with all services showing.

- [ ] **Step 6: Final commit**

```bash
git commit -m "chore(P4): system audit complete — security, logging, rate limiting, indexes, status page"
```
