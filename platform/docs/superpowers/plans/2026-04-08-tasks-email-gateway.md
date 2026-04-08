# Scheduled Tasks & Email Gateway Routes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email sending and scheduled task execution as gateway routes so deployed apps can send emails and run on cron schedules via the same embed-token auth pattern used for AI calls.

**Architecture:** Two new Hono routers in the gateway (`/email/*`, `/tasks/*`) protected by the existing `embedTokenAuth` middleware. A BullMQ repeatable job inside the gateway ticks every 60s, picks up due tasks, mints short-lived JWTs, and POSTs to app callback URLs. Email dispatches via Resend behind a swappable `EmailProvider` interface. New DB tables in the `gateway` schema store task definitions, execution logs, and email audit records.

**Tech Stack:** Hono (routing), Resend (email), PostgreSQL (state), Redis (rate limiting), jose (JWT minting), cron-parser (schedule validation), vitest + bun (testing)

**Spec:** `platform/docs/superpowers/specs/2026-04-08-tasks-email-gateway-design.md`

---

## File Map

### New Files — Gateway

| File | Responsibility |
|---|---|
| `gateway/src/routes/email.ts` | `POST /email/send` — validate recipient, deduct 1 credit, dispatch via EmailProvider, log to audit table |
| `gateway/src/routes/email.test.ts` | Tests: recipient mismatch, insufficient credits, rate limit, happy path, Resend failure |
| `gateway/src/routes/tasks.ts` | CRUD routes for `/tasks` — create, list, get+history, update, delete. Scoped to appId. |
| `gateway/src/routes/tasks.test.ts` | Tests: CRUD happy paths, 5-task limit, sub-hour rejection, payload size limit, name uniqueness |
| `gateway/src/services/email-provider.ts` | `EmailProvider` interface + `ResendEmailProvider` implementation |
| `gateway/src/services/email-provider.test.ts` | Tests: Resend SDK call, error wrapping |
| `gateway/src/workers/task-runner.ts` | BullMQ repeatable job: query due tasks, mint execution JWT, POST to callback, log result, retry on failure |
| `gateway/src/workers/task-runner.test.ts` | Tests: due task pickup, JWT minting, callback success/failure, retry, next_run_at calc |
| `gateway/src/lib/cron-utils.ts` | Cron parsing: validate expression, enforce 1h minimum, calculate next run in timezone |
| `gateway/src/lib/cron-utils.test.ts` | Tests: valid/invalid cron, sub-hour rejection, timezone next-run calculation |

### Modified Files — Gateway

| File | Change |
|---|---|
| `gateway/src/index.ts` | Register `/email` and `/tasks` routers, expand CORS allowMethods, start task-runner worker |
| `gateway/src/middleware/auth.ts` | Accept `type: "task_execution"` tokens — skip DB lookup, still check channel suspension |
| `gateway/package.json` | Add `resend`, `cron-parser` dependencies |

### New Files — Platform

| File | Responsibility |
|---|---|
| `platform/lib/db/migrations/010_tasks_email.sql` | Create `gateway.scheduled_tasks`, `gateway.task_executions`, `gateway.email_sends` tables + indexes |

### Modified Files — MCP Server

| File | Change |
|---|---|
| `mcp-server/src/tools/scaffold.ts` | Add `email-sdk.ts` and `task-sdk.ts` to generated file map |
| `mcp-server/src/index.ts` | Add `create_scheduled_task`, `list_scheduled_tasks`, `delete_scheduled_task` tools |

---

## Task 1: Database Migration

**Files:**
- Create: `platform/lib/db/migrations/010_tasks_email.sql`

- [ ] **Step 1: Write the migration SQL**

Create `platform/lib/db/migrations/010_tasks_email.sql`:

```sql
-- 010_tasks_email.sql
-- Scheduled tasks and email audit tables for gateway

-- Scheduled task definitions
CREATE TABLE gateway.scheduled_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          UUID NOT NULL,
  user_id         TEXT NOT NULL,
  name            TEXT NOT NULL,
  schedule        TEXT NOT NULL,
  callback_path   TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  timezone        TEXT NOT NULL DEFAULT 'UTC',
  enabled         BOOLEAN NOT NULL DEFAULT true,
  next_run_at     TIMESTAMPTZ,
  last_run_at     TIMESTAMPTZ,
  last_run_status TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(app_id, name)
);

-- Index for the task runner's polling query
CREATE INDEX idx_scheduled_tasks_due
  ON gateway.scheduled_tasks (next_run_at)
  WHERE enabled = true;

-- Task execution log
CREATE TABLE gateway.task_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL REFERENCES gateway.scheduled_tasks(id) ON DELETE CASCADE,
  fired_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT NOT NULL,
  response_code   INTEGER,
  latency_ms      INTEGER,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT
);

CREATE INDEX idx_task_executions_task
  ON gateway.task_executions (task_id, fired_at DESC);

-- Email audit log
CREATE TABLE gateway.email_sends (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          UUID NOT NULL,
  user_id         TEXT NOT NULL,
  recipient       TEXT NOT NULL,
  subject         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'sent',
  message_id      TEXT,
  credits_charged INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_sends_app
  ON gateway.email_sends (app_id, created_at DESC);
```

- [ ] **Step 2: Verify migration file exists**

Run: `ls -la platform/lib/db/migrations/010_tasks_email.sql`
Expected: file listed with correct path

- [ ] **Step 3: Commit**

```bash
git add platform/lib/db/migrations/010_tasks_email.sql
git commit -m "feat(db): add migration 010 for scheduled tasks and email audit tables"
```

---

## Task 2: Cron Utilities

**Files:**
- Create: `gateway/src/lib/cron-utils.ts`
- Create: `gateway/src/lib/cron-utils.test.ts`

- [ ] **Step 1: Install cron-parser dependency**

Run: `cd gateway && bun add cron-parser`

Note: `cron-parser` provides `parseExpression(expr, { tz })` to validate cron expressions and calculate next run times.

- [ ] **Step 2: Write failing tests for cron utilities**

Create `gateway/src/lib/cron-utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { validateCronSchedule, getNextRunAt } from './cron-utils'

describe('validateCronSchedule', () => {
  it('accepts valid hourly-or-longer cron expressions', () => {
    expect(validateCronSchedule('0 8 * * *')).toEqual({ valid: true })   // daily 8am
    expect(validateCronSchedule('0 */2 * * *')).toEqual({ valid: true }) // every 2h
    expect(validateCronSchedule('0 0 * * 1')).toEqual({ valid: true })   // weekly Monday midnight
  })

  it('rejects sub-hour cron expressions', () => {
    const result = validateCronSchedule('*/5 * * * *') // every 5 min
    expect(result.valid).toBe(false)
    expect(result.error).toContain('1 hour')
  })

  it('rejects every-minute cron', () => {
    const result = validateCronSchedule('* * * * *')
    expect(result.valid).toBe(false)
  })

  it('rejects invalid cron syntax', () => {
    const result = validateCronSchedule('not a cron')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid')
  })

  it('rejects cron with seconds (6 fields)', () => {
    const result = validateCronSchedule('0 0 8 * * *')
    expect(result.valid).toBe(false)
  })
})

describe('getNextRunAt', () => {
  it('returns next run as ISO string for UTC', () => {
    const next = getNextRunAt('0 8 * * *', 'UTC')
    const date = new Date(next)
    expect(date.getUTCHours()).toBe(8)
    expect(date.getUTCMinutes()).toBe(0)
    expect(date > new Date()).toBe(true)
  })

  it('respects timezone', () => {
    const next = getNextRunAt('0 8 * * *', 'Asia/Kolkata')
    const date = new Date(next)
    // 8:00 IST = 2:30 UTC
    expect(date.getUTCHours()).toBe(2)
    expect(date.getUTCMinutes()).toBe(30)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd gateway && bun test src/lib/cron-utils.test.ts`
Expected: FAIL — module `./cron-utils` not found

- [ ] **Step 4: Implement cron utilities**

Create `gateway/src/lib/cron-utils.ts`:

```typescript
import { parseExpression } from 'cron-parser'

interface ValidationResult {
  valid: true
} | {
  valid: false
  error: string
}

export function validateCronSchedule(expression: string): ValidationResult {
  // Reject 6-field (with seconds) expressions
  if (expression.trim().split(/\s+/).length !== 5) {
    return { valid: false, error: 'Invalid cron expression: must have exactly 5 fields' }
  }

  let parsed
  try {
    parsed = parseExpression(expression)
  } catch {
    return { valid: false, error: `Invalid cron expression: ${expression}` }
  }

  // Enforce minimum 1-hour interval by checking the minute field.
  // If the minute field has more than one value or is a wildcard, it runs sub-hourly.
  const fields = parsed.fields
  const minuteField = fields.minute
  if (minuteField.length > 1) {
    return { valid: false, error: 'Minimum schedule interval is 1 hour. Sub-hour cron expressions are not allowed.' }
  }

  return { valid: true }
}

export function getNextRunAt(expression: string, timezone: string): string {
  const interval = parseExpression(expression, {
    currentDate: new Date(),
    tz: timezone,
  })
  return interval.next().toISOString()
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd gateway && bun test src/lib/cron-utils.test.ts`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add gateway/src/lib/cron-utils.ts gateway/src/lib/cron-utils.test.ts gateway/package.json gateway/package-lock.json
git commit -m "feat(gateway): add cron-utils for schedule validation and next-run calculation"
```

---

## Task 3: Email Provider Interface + Resend Implementation

**Files:**
- Create: `gateway/src/services/email-provider.ts`
- Create: `gateway/src/services/email-provider.test.ts`
- Modify: `gateway/package.json` (add `resend`)

- [ ] **Step 1: Install resend dependency**

Run: `cd gateway && bun add resend`

- [ ] **Step 2: Write failing tests for email provider**

Create `gateway/src/services/email-provider.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ResendEmailProvider } from './email-provider'

// Mock the Resend module
vi.mock('resend', () => {
  const sendMock = vi.fn()
  return {
    Resend: vi.fn().mockImplementation(() => ({
      emails: { send: sendMock },
    })),
    _sendMock: sendMock,
  }
})

import { _sendMock as sendMock } from 'resend'

describe('ResendEmailProvider', () => {
  let provider: ResendEmailProvider

  beforeEach(() => {
    vi.clearAllMocks()
    provider = new ResendEmailProvider('test-api-key')
  })

  it('sends email and returns messageId', async () => {
    ;(sendMock as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'msg-123' },
      error: null,
    })

    const result = await provider.send({
      from: 'Terminal AI <noreply@test.com>',
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    })

    expect(result.messageId).toBe('msg-123')
    expect(sendMock).toHaveBeenCalledWith({
      from: 'Terminal AI <noreply@test.com>',
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    })
  })

  it('throws on Resend API error', async () => {
    ;(sendMock as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: 'Invalid API key' },
    })

    await expect(
      provider.send({
        from: 'test@test.com',
        to: 'user@test.com',
        subject: 'Test',
        html: '<p>Hi</p>',
      }),
    ).rejects.toThrow('Email delivery failed: Invalid API key')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd gateway && bun test src/services/email-provider.test.ts`
Expected: FAIL — cannot resolve `./email-provider`

- [ ] **Step 4: Implement email provider**

Create `gateway/src/services/email-provider.ts`:

```typescript
import { Resend } from 'resend'

export interface EmailSendParams {
  from: string
  to: string
  subject: string
  html: string
}

export interface EmailSendResult {
  messageId: string
}

export interface EmailProvider {
  send(params: EmailSendParams): Promise<EmailSendResult>
}

export class ResendEmailProvider implements EmailProvider {
  private resend: Resend

  constructor(apiKey: string) {
    this.resend = new Resend(apiKey)
  }

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    const { data, error } = await this.resend.emails.send({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    })

    if (error) {
      throw new Error(`Email delivery failed: ${error.message}`)
    }

    return { messageId: data?.id ?? 'unknown' }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd gateway && bun test src/services/email-provider.test.ts`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add gateway/src/services/email-provider.ts gateway/src/services/email-provider.test.ts gateway/package.json gateway/package-lock.json
git commit -m "feat(gateway): add EmailProvider interface with Resend implementation"
```

---

## Task 4: Email Route

**Files:**
- Create: `gateway/src/routes/email.ts`
- Create: `gateway/src/routes/email.test.ts`

This task depends on Task 3 (email provider).

- [ ] **Step 1: Write failing tests for the email route**

Create `gateway/src/routes/email.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { emailRouter } from './email'

// Mock db
vi.mock('../db', () => ({
  db: {
    query: vi.fn(),
  },
}))

// Mock email provider
vi.mock('../services/email-provider', () => ({
  ResendEmailProvider: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({ messageId: 'msg-test-123' }),
  })),
}))

// Mock rate-limit Redis check
vi.mock('../lib/email-rate-limit', () => ({
  checkEmailRateLimit: vi.fn().mockResolvedValue(true),
}))

import { db } from '../db'

const mockQuery = db.query as ReturnType<typeof vi.fn>

// Helper: create a test app with mocked auth
function createTestApp(tokenPayload: Record<string, unknown>) {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('embedToken', {
      userId: 'user-1',
      appId: 'app-1',
      sessionId: 'sess-1',
      creditsPerCall: 1,
      isFree: false,
      isAnon: false,
      ...tokenPayload,
    })
    await next()
  })
  app.route('/email', emailRouter)
  return app
}

describe('POST /email/send', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends email when recipient matches user email', async () => {
    const app = createTestApp({})
    // Mock: user email lookup
    mockQuery.mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] })
    // Mock: credit balance check
    mockQuery.mockResolvedValueOnce({ rows: [{ balance: 10 }] })
    // Mock: credit deduction
    mockQuery.mockResolvedValueOnce({ rows: [] })
    // Mock: audit log insert
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const res = await app.request('/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'user@example.com',
        subject: 'Test Report',
        html: '<p>Hello</p>',
      }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sent).toBe(true)
    expect(body.messageId).toBe('msg-test-123')
  })

  it('rejects when recipient does not match user email', async () => {
    const app = createTestApp({})
    // Mock: user email lookup returns different email
    mockQuery.mockResolvedValueOnce({ rows: [{ email: 'real@example.com' }] })

    const res = await app.request('/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'someone-else@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
      }),
    })

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toContain('authenticated user')
  })

  it('returns 402 when insufficient credits', async () => {
    const app = createTestApp({})
    // Mock: user email lookup
    mockQuery.mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] })
    // Mock: credit balance = 0
    mockQuery.mockResolvedValueOnce({ rows: [{ balance: 0 }] })

    const res = await app.request('/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
      }),
    })

    expect(res.status).toBe(402)
  })

  it('returns 400 when required fields missing', async () => {
    const app = createTestApp({})

    const res = await app.request('/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: 'user@example.com' }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('subject')
  })

  it('skips credit deduction for free apps', async () => {
    const app = createTestApp({ isFree: true })
    // Mock: user email lookup
    mockQuery.mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] })
    // Mock: audit log insert (no credit queries)
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const res = await app.request('/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'user@example.com',
        subject: 'Free Report',
        html: '<p>Free</p>',
      }),
    })

    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd gateway && bun test src/routes/email.test.ts`
Expected: FAIL — cannot resolve `./email`

- [ ] **Step 3: Create the email rate-limit helper**

Create `gateway/src/lib/email-rate-limit.ts`:

```typescript
import { createClient } from 'redis'

let redisClient: ReturnType<typeof createClient> | null = null

function getRedis(): ReturnType<typeof createClient> | null {
  if (!redisClient) {
    try {
      redisClient = createClient({ url: process.env.REDIS_URL ?? 'redis://redis:6379' })
      redisClient.connect().catch(() => { redisClient = null })
    } catch {
      redisClient = null
    }
  }
  return redisClient
}

const WINDOW_MS = 60 * 60 * 1000 // 1 hour
const MAX_EMAILS = 10

export async function checkEmailRateLimit(appId: string, userId: string): Promise<boolean> {
  try {
    const redis = getRedis()
    if (!redis) return true // fail open if Redis unavailable

    const key = `rl:email:${appId}:${userId}`
    const now = Date.now()
    const windowStart = now - WINDOW_MS

    const count = await redis.zCount(key, windowStart, now)
    if (count >= MAX_EMAILS) return false

    await redis.zAdd(key, { score: now, value: `${now}` })
    await redis.zRemRangeByScore(key, '-inf', windowStart - 1)
    await redis.expire(key, Math.ceil(WINDOW_MS / 1000))
    return true
  } catch {
    redisClient = null
    return true // fail open
  }
}
```

- [ ] **Step 4: Implement the email route**

Create `gateway/src/routes/email.ts`:

```typescript
import { Hono } from 'hono'
import { db } from '../db.js'
import { logger } from '../lib/logger.js'
import { ResendEmailProvider } from '../services/email-provider.js'
import { checkEmailRateLimit } from '../lib/email-rate-limit.js'
import type { EmbedTokenPayload } from '../middleware/auth.js'

const FROM_EMAIL = process.env.FROM_EMAIL ?? 'Terminal AI <noreply@terminalai.studioionique.com>'

const emailProvider = new ResendEmailProvider(process.env.RESEND_API_KEY ?? '')

export const emailRouter = new Hono()

emailRouter.post('/send', async (c) => {
  const token: EmbedTokenPayload = c.get('embedToken')
  const { userId, appId, isFree } = token

  if (!userId) {
    return c.json({ error: 'Anonymous users cannot send emails' }, 403)
  }

  const body = await c.req.json<{ to?: string; subject?: string; html?: string }>()

  if (!body.to) return c.json({ error: 'Missing required field: to' }, 400)
  if (!body.subject) return c.json({ error: 'Missing required field: subject' }, 400)
  if (!body.html) return c.json({ error: 'Missing required field: html' }, 400)

  // Validate recipient matches authenticated user's email
  const userResult = await db.query<{ email: string }>(
    `SELECT email FROM public."user" WHERE id = $1`,
    [userId],
  )
  const userEmail = userResult.rows[0]?.email
  if (!userEmail || body.to.toLowerCase() !== userEmail.toLowerCase()) {
    return c.json({ error: 'Can only send emails to the authenticated user' }, 403)
  }

  // Rate limit: 10 emails/hour per app per user
  const allowed = await checkEmailRateLimit(appId, userId)
  if (!allowed) {
    return c.json({ error: 'Email rate limit exceeded (10/hour)' }, 429)
  }

  // Credit deduction: 1 credit per email
  if (!isFree) {
    const balResult = await db.query<{ balance: number }>(
      `SELECT COALESCE(SUM(delta), 0) AS balance FROM subscriptions.credit_ledger WHERE user_id = $1`,
      [userId],
    )
    const balance = balResult.rows[0]?.balance ?? 0
    if (balance < 1) {
      return c.json({ error: 'Insufficient credits', redirect: '/pricing?reason=insufficient_credits' }, 402)
    }
    await db.query(
      `INSERT INTO subscriptions.credit_ledger (user_id, delta, balance_after, reason, app_id)
       VALUES ($1, -1, (SELECT COALESCE(SUM(delta), 0) - 1 FROM subscriptions.credit_ledger WHERE user_id = $1), 'email_send', $2)`,
      [userId, appId],
    )
  }

  // Send email
  let messageId: string
  try {
    const result = await emailProvider.send({
      from: FROM_EMAIL,
      to: body.to,
      subject: body.subject,
      html: body.html,
    })
    messageId = result.messageId
  } catch (err) {
    logger.error({ msg: 'email_send_failed', appId, userId, err: String(err) })
    return c.json({ error: 'Email delivery failed' }, 502)
  }

  // Audit log
  await db.query(
    `INSERT INTO gateway.email_sends (app_id, user_id, recipient, subject, status, message_id, credits_charged)
     VALUES ($1, $2, $3, $4, 'sent', $5, $6)`,
    [appId, userId, body.to, body.subject, messageId, isFree ? 0 : 1],
  )

  return c.json({ sent: true, messageId })
})
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd gateway && bun test src/routes/email.test.ts`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add gateway/src/routes/email.ts gateway/src/routes/email.test.ts gateway/src/lib/email-rate-limit.ts
git commit -m "feat(gateway): add POST /email/send route with recipient validation and credit deduction"
```

---

## Task 5: Tasks CRUD Routes

**Files:**
- Create: `gateway/src/routes/tasks.ts`
- Create: `gateway/src/routes/tasks.test.ts`

This task depends on Task 2 (cron-utils).

- [ ] **Step 1: Write failing tests for task CRUD**

Create `gateway/src/routes/tasks.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { taskRouter } from './tasks'

vi.mock('../db', () => ({
  db: {
    query: vi.fn(),
  },
}))

vi.mock('../lib/cron-utils', () => ({
  validateCronSchedule: vi.fn().mockReturnValue({ valid: true }),
  getNextRunAt: vi.fn().mockReturnValue('2026-04-09T02:30:00.000Z'),
}))

import { db } from '../db'
import { validateCronSchedule } from '../lib/cron-utils'

const mockQuery = db.query as ReturnType<typeof vi.fn>

function createTestApp() {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('embedToken', {
      userId: 'user-1',
      appId: 'app-1',
      sessionId: 'sess-1',
      creditsPerCall: 1,
      isFree: false,
      isAnon: false,
    })
    await next()
  })
  app.route('/tasks', taskRouter)
  return app
}

describe('POST /tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(validateCronSchedule as ReturnType<typeof vi.fn>).mockReturnValue({ valid: true })
  })

  it('creates a task and returns it with nextRunAt', async () => {
    const app = createTestApp()
    // Mock: count existing tasks = 0
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] })
    // Mock: resolve app URL
    mockQuery.mockResolvedValueOnce({ rows: [{ subdomain: 'daily-market' }] })
    // Mock: insert task
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'task-1',
        app_id: 'app-1',
        name: 'daily-report',
        schedule: '0 8 * * *',
        callback_path: '/api/cron/report',
        payload: {},
        timezone: 'Asia/Kolkata',
        enabled: true,
        next_run_at: '2026-04-09T02:30:00.000Z',
        created_at: '2026-04-08T12:00:00.000Z',
      }],
    })

    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'daily-report',
        schedule: '0 8 * * *',
        callbackPath: '/api/cron/report',
        timezone: 'Asia/Kolkata',
      }),
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('task-1')
    expect(body.nextRunAt).toBe('2026-04-09T02:30:00.000Z')
  })

  it('rejects when 5 tasks already exist', async () => {
    const app = createTestApp()
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '5' }] })

    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'sixth-task',
        schedule: '0 8 * * *',
        callbackPath: '/api/cron/sixth',
      }),
    })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('5')
  })

  it('rejects sub-hour cron schedule', async () => {
    const app = createTestApp()
    ;(validateCronSchedule as ReturnType<typeof vi.fn>).mockReturnValue({
      valid: false,
      error: 'Minimum schedule interval is 1 hour',
    })

    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'too-frequent',
        schedule: '*/5 * * * *',
        callbackPath: '/api/cron/fast',
      }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('1 hour')
  })

  it('rejects payload over 10KB', async () => {
    const app = createTestApp()

    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'big-payload',
        schedule: '0 8 * * *',
        callbackPath: '/api/cron/big',
        payload: { data: 'x'.repeat(11_000) },
      }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('10KB')
  })

  it('rejects callbackPath not starting with /', async () => {
    const app = createTestApp()

    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'bad-path',
        schedule: '0 8 * * *',
        callbackPath: 'api/cron/report',
      }),
    })

    expect(res.status).toBe(400)
  })
})

describe('GET /tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns tasks scoped to appId', async () => {
    const app = createTestApp()
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'task-1', name: 'daily-report', schedule: '0 8 * * *', callback_path: '/api/cron/report', timezone: 'UTC', enabled: true, next_run_at: '2026-04-09T08:00:00Z', last_run_at: null, last_run_status: null },
      ],
    })

    const res = await app.request('/tasks', { method: 'GET' })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].name).toBe('daily-report')
  })
})

describe('DELETE /tasks/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes a task owned by the app', async () => {
    const app = createTestApp()
    mockQuery.mockResolvedValueOnce({ rowCount: 1 })

    const res = await app.request('/tasks/task-1', { method: 'DELETE' })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deleted).toBe(true)
  })

  it('returns 404 for task not owned by app', async () => {
    const app = createTestApp()
    mockQuery.mockResolvedValueOnce({ rowCount: 0 })

    const res = await app.request('/tasks/other-task', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd gateway && bun test src/routes/tasks.test.ts`
Expected: FAIL — cannot resolve `./tasks`

- [ ] **Step 3: Implement tasks CRUD route**

Create `gateway/src/routes/tasks.ts`:

```typescript
import { Hono } from 'hono'
import { db } from '../db.js'
import { logger } from '../lib/logger.js'
import { validateCronSchedule, getNextRunAt } from '../lib/cron-utils.js'
import type { EmbedTokenPayload } from '../middleware/auth.js'

const MAX_TASKS_PER_APP = 5
const MAX_PAYLOAD_BYTES = 10_240 // 10KB

export const taskRouter = new Hono()

// POST /tasks — create a scheduled task
taskRouter.post('/', async (c) => {
  const { userId, appId }: EmbedTokenPayload = c.get('embedToken')

  if (!userId) {
    return c.json({ error: 'Anonymous users cannot create tasks' }, 403)
  }

  const body = await c.req.json<{
    name?: string
    schedule?: string
    callbackPath?: string
    payload?: Record<string, unknown>
    timezone?: string
    enabled?: boolean
  }>()

  if (!body.name) return c.json({ error: 'Missing required field: name' }, 400)
  if (!body.schedule) return c.json({ error: 'Missing required field: schedule' }, 400)
  if (!body.callbackPath) return c.json({ error: 'Missing required field: callbackPath' }, 400)
  if (!body.callbackPath.startsWith('/')) return c.json({ error: 'callbackPath must start with /' }, 400)
  if (body.name.length > 100) return c.json({ error: 'name must be 100 characters or less' }, 400)

  // Validate cron schedule
  const validation = validateCronSchedule(body.schedule)
  if (!validation.valid) {
    return c.json({ error: validation.error }, 400)
  }

  // Validate payload size
  const payloadStr = JSON.stringify(body.payload ?? {})
  if (Buffer.byteLength(payloadStr, 'utf8') > MAX_PAYLOAD_BYTES) {
    return c.json({ error: 'payload exceeds maximum size of 10KB' }, 400)
  }

  // Check task limit
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM gateway.scheduled_tasks WHERE app_id = $1`,
    [appId],
  )
  if (parseInt(countResult.rows[0].count, 10) >= MAX_TASKS_PER_APP) {
    return c.json({ error: `Maximum of ${MAX_TASKS_PER_APP} tasks per app reached` }, 409)
  }

  // Resolve app's deployed URL
  const deployResult = await db.query<{ subdomain: string }>(
    `SELECT subdomain FROM deployments.deployments
     WHERE app_id = $1 AND status = 'live'
     ORDER BY created_at DESC LIMIT 1`,
    [appId],
  )
  if (!deployResult.rows[0]) {
    return c.json({ error: 'App has no live deployment — cannot register tasks' }, 400)
  }

  const timezone = body.timezone ?? 'UTC'
  const nextRunAt = getNextRunAt(body.schedule, timezone)

  const result = await db.query<{
    id: string
    app_id: string
    name: string
    schedule: string
    callback_path: string
    payload: Record<string, unknown>
    timezone: string
    enabled: boolean
    next_run_at: string
    created_at: string
  }>(
    `INSERT INTO gateway.scheduled_tasks
       (app_id, user_id, name, schedule, callback_path, payload, timezone, enabled, next_run_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [appId, userId, body.name, body.schedule, body.callbackPath, body.payload ?? {}, timezone, body.enabled ?? true, nextRunAt],
  )

  const task = result.rows[0]
  const subdomain = deployResult.rows[0].subdomain
  const callbackUrl = `https://${subdomain}.apps.terminalai.app${task.callback_path}`

  return c.json({
    id: task.id,
    name: task.name,
    schedule: task.schedule,
    callbackPath: task.callback_path,
    callbackUrl,
    timezone: task.timezone,
    enabled: task.enabled,
    nextRunAt: task.next_run_at,
    createdAt: task.created_at,
  }, 201)
})

// GET /tasks — list tasks for this app
taskRouter.get('/', async (c) => {
  const { appId }: EmbedTokenPayload = c.get('embedToken')

  const result = await db.query<{
    id: string; name: string; schedule: string; callback_path: string;
    timezone: string; enabled: boolean; next_run_at: string | null;
    last_run_at: string | null; last_run_status: string | null
  }>(
    `SELECT id, name, schedule, callback_path, timezone, enabled, next_run_at, last_run_at, last_run_status
     FROM gateway.scheduled_tasks WHERE app_id = $1 ORDER BY created_at`,
    [appId],
  )

  return c.json(result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    schedule: row.schedule,
    callbackPath: row.callback_path,
    timezone: row.timezone,
    enabled: row.enabled,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    lastRunStatus: row.last_run_status,
  })))
})

// GET /tasks/:id — get task with execution history
taskRouter.get('/:id', async (c) => {
  const { appId }: EmbedTokenPayload = c.get('embedToken')
  const taskId = c.req.param('id')

  const taskResult = await db.query<{
    id: string; name: string; schedule: string; callback_path: string;
    payload: Record<string, unknown>; timezone: string; enabled: boolean;
    next_run_at: string | null; last_run_at: string | null; last_run_status: string | null
  }>(
    `SELECT * FROM gateway.scheduled_tasks WHERE id = $1 AND app_id = $2`,
    [taskId, appId],
  )
  if (!taskResult.rows[0]) return c.json({ error: 'Task not found' }, 404)

  const execResult = await db.query<{
    id: string; fired_at: string; status: string; response_code: number | null;
    latency_ms: number | null; retry_count: number
  }>(
    `SELECT id, fired_at, status, response_code, latency_ms, retry_count
     FROM gateway.task_executions WHERE task_id = $1 ORDER BY fired_at DESC LIMIT 20`,
    [taskId],
  )

  const task = taskResult.rows[0]
  return c.json({
    id: task.id,
    name: task.name,
    schedule: task.schedule,
    callbackPath: task.callback_path,
    payload: task.payload,
    timezone: task.timezone,
    enabled: task.enabled,
    nextRunAt: task.next_run_at,
    lastRunAt: task.last_run_at,
    lastRunStatus: task.last_run_status,
    executions: execResult.rows.map((row) => ({
      id: row.id,
      firedAt: row.fired_at,
      status: row.status,
      responseCode: row.response_code,
      latencyMs: row.latency_ms,
      retryCount: row.retry_count,
    })),
  })
})

// PATCH /tasks/:id — update task
taskRouter.patch('/:id', async (c) => {
  const { appId }: EmbedTokenPayload = c.get('embedToken')
  const taskId = c.req.param('id')

  const body = await c.req.json<{
    name?: string; schedule?: string; callbackPath?: string;
    payload?: Record<string, unknown>; timezone?: string; enabled?: boolean
  }>()

  // Validate schedule if provided
  if (body.schedule) {
    const validation = validateCronSchedule(body.schedule)
    if (!validation.valid) return c.json({ error: validation.error }, 400)
  }

  if (body.payload) {
    const payloadStr = JSON.stringify(body.payload)
    if (Buffer.byteLength(payloadStr, 'utf8') > MAX_PAYLOAD_BYTES) {
      return c.json({ error: 'payload exceeds maximum size of 10KB' }, 400)
    }
  }

  if (body.callbackPath && !body.callbackPath.startsWith('/')) {
    return c.json({ error: 'callbackPath must start with /' }, 400)
  }

  // Build dynamic SET clause
  const sets: string[] = ['updated_at = now()']
  const values: unknown[] = []
  let paramIndex = 1

  if (body.name !== undefined) { sets.push(`name = $${paramIndex++}`); values.push(body.name) }
  if (body.schedule !== undefined) { sets.push(`schedule = $${paramIndex++}`); values.push(body.schedule) }
  if (body.callbackPath !== undefined) { sets.push(`callback_path = $${paramIndex++}`); values.push(body.callbackPath) }
  if (body.payload !== undefined) { sets.push(`payload = $${paramIndex++}`); values.push(JSON.stringify(body.payload)) }
  if (body.timezone !== undefined) { sets.push(`timezone = $${paramIndex++}`); values.push(body.timezone) }
  if (body.enabled !== undefined) { sets.push(`enabled = $${paramIndex++}`); values.push(body.enabled) }

  // Recalculate next_run_at if schedule or timezone changed
  if (body.schedule || body.timezone) {
    // Need current task to get the other value
    const current = await db.query<{ schedule: string; timezone: string }>(
      `SELECT schedule, timezone FROM gateway.scheduled_tasks WHERE id = $1 AND app_id = $2`,
      [taskId, appId],
    )
    if (!current.rows[0]) return c.json({ error: 'Task not found' }, 404)

    const schedule = body.schedule ?? current.rows[0].schedule
    const timezone = body.timezone ?? current.rows[0].timezone
    const nextRunAt = getNextRunAt(schedule, timezone)
    sets.push(`next_run_at = $${paramIndex++}`)
    values.push(nextRunAt)
  }

  values.push(taskId, appId)
  const result = await db.query(
    `UPDATE gateway.scheduled_tasks SET ${sets.join(', ')}
     WHERE id = $${paramIndex++} AND app_id = $${paramIndex}
     RETURNING id`,
    values,
  )

  if (result.rowCount === 0) return c.json({ error: 'Task not found' }, 404)
  return c.json({ updated: true })
})

// DELETE /tasks/:id — delete task
taskRouter.delete('/:id', async (c) => {
  const { appId }: EmbedTokenPayload = c.get('embedToken')
  const taskId = c.req.param('id')

  const result = await db.query(
    `DELETE FROM gateway.scheduled_tasks WHERE id = $1 AND app_id = $2`,
    [taskId, appId],
  )

  if (result.rowCount === 0) return c.json({ error: 'Task not found' }, 404)
  return c.json({ deleted: true })
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd gateway && bun test src/routes/tasks.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add gateway/src/routes/tasks.ts gateway/src/routes/tasks.test.ts
git commit -m "feat(gateway): add /tasks CRUD routes with schedule validation and app scoping"
```

---

## Task 6: Extend Auth Middleware for Task Execution Tokens

**Files:**
- Modify: `gateway/src/middleware/auth.ts`
- Existing test: `gateway/src/middleware/signals.test.ts` (different middleware — we create a new test file)
- Create: `gateway/src/middleware/auth.test.ts`

- [ ] **Step 1: Write failing tests for task-execution token handling**

Create `gateway/src/middleware/auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { SignJWT } from 'jose'

vi.mock('../db', () => ({
  db: {
    query: vi.fn(),
  },
}))

import { db } from '../db'

const mockQuery = db.query as ReturnType<typeof vi.fn>

// Set the secret before importing auth middleware
const SECRET_STRING = 'test-secret-key-for-jwt-signing-1234'
process.env.EMBED_TOKEN_SECRET = SECRET_STRING
const SECRET = new TextEncoder().encode(SECRET_STRING)

// Import after env is set
const { embedTokenAuth } = await import('./auth')

function createTestApp() {
  const app = new Hono()
  app.use('*', embedTokenAuth)
  app.get('/test', (c) => {
    const token = c.get('embedToken')
    return c.json(token)
  })
  return app
}

describe('embedTokenAuth — task execution tokens', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts a task_execution token without DB lookup', async () => {
    const app = createTestApp()

    const jwt = await new SignJWT({
      appId: 'app-1',
      taskId: 'task-1',
      userId: 'user-1',
      type: 'task_execution',
      isFree: false,
      creditsPerCall: 1,
      sessionId: 'task-exec-1',
      isAnon: false,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('2m')
      .sign(SECRET)

    // Mock: channel suspension check — not suspended
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${jwt}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.appId).toBe('app-1')
    expect(body.userId).toBe('user-1')
    // Should NOT have queried embed_tokens table (only suspension check)
    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(mockQuery.mock.calls[0][0]).toContain('channel_suspensions')
  })

  it('rejects task_execution token for suspended channel', async () => {
    const app = createTestApp()

    const jwt = await new SignJWT({
      appId: 'app-1',
      taskId: 'task-1',
      userId: 'user-1',
      type: 'task_execution',
      isFree: false,
      creditsPerCall: 1,
      sessionId: 'task-exec-1',
      isAnon: false,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('2m')
      .sign(SECRET)

    // Mock: channel IS suspended
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'susp-1' }] })

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${jwt}` },
    })

    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd gateway && bun test src/middleware/auth.test.ts`
Expected: FAIL — task_execution tokens currently go through the embed_tokens DB lookup and fail (no row found)

- [ ] **Step 3: Modify auth middleware to accept task execution tokens**

Edit `gateway/src/middleware/auth.ts`. The change is after the JWT verification (line 34) and before the embed_tokens DB lookup (line 42). Add a branch for `type === 'task_execution'`:

Replace the section from after `payload = p as unknown as EmbedTokenPayload` through the end of the middleware with:

```typescript
  // Branch: task execution tokens skip the embed_tokens DB lookup
  const tokenType = (p as Record<string, unknown>).type as string | undefined
  if (tokenType === 'task_execution') {
    payload = p as unknown as EmbedTokenPayload
    c.set('embedToken', payload)

    // Still check channel suspension
    const suspension = await db.query<{ id: string }>(
      `SELECT cs.id FROM platform.channel_suspensions cs
       JOIN marketplace.apps a ON a.channel_id = cs.channel_id
       WHERE a.id = $1 AND cs.is_active = true`,
      [payload.appId],
    )
    if (suspension.rows[0]) {
      return c.json({ error: 'This channel has been suspended' }, 403)
    }

    await next()
    return
  }

  payload = p as unknown as EmbedTokenPayload
```

The full updated file should be:

```typescript
import { createMiddleware } from 'hono/factory'
import { jwtVerify } from 'jose'
import { createHash } from 'node:crypto'
import { db } from '../db.js'

export interface EmbedTokenPayload {
  userId: string | null
  appId: string
  sessionId: string
  creditsPerCall: number
  isFree: boolean
  isAnon: boolean
}

declare module 'hono' {
  interface ContextVariableMap {
    embedToken: EmbedTokenPayload
  }
}

const SECRET = new TextEncoder().encode(process.env.EMBED_TOKEN_SECRET!)

export const embedTokenAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing token' }, 401)
  }

  const token = authHeader.slice(7)

  let payload: EmbedTokenPayload
  let jwtPayload: Record<string, unknown>
  try {
    const { payload: p } = await jwtVerify(token, SECRET)
    jwtPayload = p as Record<string, unknown>
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }

  // Task execution tokens: skip embed_tokens DB lookup, still check suspension
  if (jwtPayload.type === 'task_execution') {
    payload = jwtPayload as unknown as EmbedTokenPayload
    c.set('embedToken', payload)

    const suspension = await db.query<{ id: string }>(
      `SELECT cs.id FROM platform.channel_suspensions cs
       JOIN marketplace.apps a ON a.channel_id = cs.channel_id
       WHERE a.id = $1 AND cs.is_active = true`,
      [payload.appId],
    )
    if (suspension.rows[0]) {
      return c.json({ error: 'This channel has been suspended' }, 403)
    }

    await next()
    return
  }

  // Regular embed tokens: verify in DB
  payload = jwtPayload as unknown as EmbedTokenPayload

  const tokenHash = createHash('sha256').update(token).digest('hex')

  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM gateway.embed_tokens
     WHERE token_hash = $1 AND expires_at > NOW()`,
    [tokenHash],
  )
  if (rows.length === 0) {
    return c.json({ error: 'Token not found or expired' }, 401)
  }

  c.set('embedToken', payload)

  const suspension = await db.query<{ id: string }>(
    `SELECT cs.id FROM platform.channel_suspensions cs
     JOIN marketplace.apps a ON a.channel_id = cs.channel_id
     WHERE a.id = $1 AND cs.is_active = true`,
    [payload.appId],
  )
  if (suspension.rows[0]) {
    return c.json({ error: 'This channel has been suspended' }, 403)
  }

  await next()
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd gateway && bun test src/middleware/auth.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Run all existing gateway tests to check for regressions**

Run: `cd gateway && bun test`
Expected: all tests PASS (upload.test.ts, clamav.test.ts, etc.)

- [ ] **Step 6: Commit**

```bash
git add gateway/src/middleware/auth.ts gateway/src/middleware/auth.test.ts
git commit -m "feat(gateway): extend embedTokenAuth to accept task_execution JWT tokens"
```

---

## Task 7: Task Runner Worker

**Files:**
- Create: `gateway/src/workers/task-runner.ts`
- Create: `gateway/src/workers/task-runner.test.ts`

This task depends on Task 5 (tasks table) and Task 6 (task execution tokens).

- [ ] **Step 1: Write failing tests for the task runner**

Create `gateway/src/workers/task-runner.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db', () => ({
  db: {
    query: vi.fn(),
  },
}))

// Mock jose SignJWT
vi.mock('jose', () => ({
  SignJWT: vi.fn().mockImplementation(() => {
    const builder = {
      setProtectedHeader: vi.fn().mockReturnThis(),
      setExpirationTime: vi.fn().mockReturnThis(),
      sign: vi.fn().mockResolvedValue('mock-task-jwt'),
    }
    return builder
  }),
}))

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { db } from '../db'
import { executeDueTasks } from './task-runner'

const mockQuery = db.query as ReturnType<typeof vi.fn>

// Set env before tests
process.env.EMBED_TOKEN_SECRET = 'test-secret-key-for-jwt-signing-1234'

describe('executeDueTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('picks up due tasks and POSTs to callback URL', async () => {
    // Mock: query due tasks
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'task-1',
        app_id: 'app-1',
        user_id: 'user-1',
        schedule: '0 8 * * *',
        callback_path: '/api/cron/report',
        payload: { market: 'NIFTY50' },
        timezone: 'UTC',
      }],
    })
    // Mock: resolve deployment URL
    mockQuery.mockResolvedValueOnce({
      rows: [{ subdomain: 'daily-market' }],
    })
    // Mock: callback response
    mockFetch.mockResolvedValueOnce(new Response('OK', { status: 200 }))
    // Mock: insert execution log
    mockQuery.mockResolvedValueOnce({ rows: [] })
    // Mock: update task next_run_at
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await executeDueTasks()

    // Verify callback was called
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://daily-market.apps.terminalai.app/api/cron/report')
    expect(options.method).toBe('POST')
    expect(options.headers.Authorization).toBe('Bearer mock-task-jwt')
    expect(JSON.parse(options.body)).toEqual({ market: 'NIFTY50' })
  })

  it('does nothing when no tasks are due', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await executeDueTasks()

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('logs failure when callback returns 500', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'task-1',
        app_id: 'app-1',
        user_id: 'user-1',
        schedule: '0 8 * * *',
        callback_path: '/api/cron/report',
        payload: {},
        timezone: 'UTC',
      }],
    })
    mockQuery.mockResolvedValueOnce({
      rows: [{ subdomain: 'daily-market' }],
    })
    // Callback fails
    mockFetch.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }))
    // Mock: insert execution log (failed)
    mockQuery.mockResolvedValueOnce({ rows: [] })
    // Mock: update task next_run_at
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await executeDueTasks()

    // Check that execution log was written with 'failed' status
    const insertCall = mockQuery.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('task_executions'),
    )
    expect(insertCall).toBeDefined()
    // The status param should be 'failed'
    expect(insertCall![1]).toContain('failed')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd gateway && bun test src/workers/task-runner.test.ts`
Expected: FAIL — cannot resolve `./task-runner`

- [ ] **Step 4: Implement the task runner**

Create `gateway/src/workers/task-runner.ts`:

```typescript
import { SignJWT } from 'jose'
import { db } from '../db.js'
import { logger } from '../lib/logger.js'
import { getNextRunAt } from '../lib/cron-utils.js'

const SECRET = new TextEncoder().encode(process.env.EMBED_TOKEN_SECRET!)
const CALLBACK_TIMEOUT_MS = 30_000

interface DueTask {
  id: string
  app_id: string
  user_id: string
  schedule: string
  callback_path: string
  payload: Record<string, unknown>
  timezone: string
}

async function mintExecutionToken(task: DueTask): Promise<string> {
  return new SignJWT({
    appId: task.app_id,
    taskId: task.id,
    userId: task.user_id,
    type: 'task_execution',
    isFree: false,
    creditsPerCall: 1,
    sessionId: `task-exec-${task.id}`,
    isAnon: false,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('2m')
    .sign(SECRET)
}

async function resolveCallbackUrl(task: DueTask): Promise<string | null> {
  const result = await db.query<{ subdomain: string }>(
    `SELECT subdomain FROM deployments.deployments
     WHERE app_id = $1 AND status = 'live'
     ORDER BY created_at DESC LIMIT 1`,
    [task.app_id],
  )
  if (!result.rows[0]) return null
  return `https://${result.rows[0].subdomain}.apps.terminalai.app${task.callback_path}`
}

async function executeTask(task: DueTask): Promise<void> {
  const startedAt = Date.now()
  let status = 'success'
  let responseCode: number | null = null
  let errorMessage: string | null = null

  try {
    const callbackUrl = await resolveCallbackUrl(task)
    if (!callbackUrl) {
      status = 'failed'
      errorMessage = 'No live deployment found'
      logger.warn({ msg: 'task_no_deployment', taskId: task.id, appId: task.app_id })
      return
    }

    const token = await mintExecutionToken(task)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), CALLBACK_TIMEOUT_MS)

    try {
      const response = await fetch(callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(task.payload),
        signal: controller.signal,
      })

      responseCode = response.status

      if (!response.ok) {
        status = 'failed'
        errorMessage = `Callback returned ${response.status}`
        logger.warn({ msg: 'task_callback_failed', taskId: task.id, status: response.status })
      }
    } finally {
      clearTimeout(timeout)
    }
  } catch (err) {
    status = 'failed'
    errorMessage = err instanceof Error ? err.message : String(err)
    logger.error({ msg: 'task_execution_error', taskId: task.id, err: errorMessage })
  } finally {
    const latencyMs = Date.now() - startedAt

    // Log execution
    await db.query(
      `INSERT INTO gateway.task_executions (task_id, status, response_code, latency_ms, error_message)
       VALUES ($1, $2, $3, $4, $5)`,
      [task.id, status, responseCode, latencyMs, errorMessage],
    )

    // Update task: next_run_at, last_run_at, last_run_status
    const nextRunAt = getNextRunAt(task.schedule, task.timezone)
    await db.query(
      `UPDATE gateway.scheduled_tasks
       SET next_run_at = $1, last_run_at = now(), last_run_status = $2, updated_at = now()
       WHERE id = $3`,
      [nextRunAt, status, task.id],
    )
  }
}

export async function executeDueTasks(): Promise<void> {
  const result = await db.query<DueTask>(
    `SELECT id, app_id, user_id, schedule, callback_path, payload, timezone
     FROM gateway.scheduled_tasks
     WHERE enabled = true AND next_run_at <= NOW()`,
  )

  if (result.rows.length === 0) return

  logger.info({ msg: 'task_runner_tick', dueCount: result.rows.length })

  // Execute tasks sequentially to avoid thundering herd on shared resources
  for (const task of result.rows) {
    await executeTask(task)
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd gateway && bun test src/workers/task-runner.test.ts`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add gateway/src/workers/task-runner.ts gateway/src/workers/task-runner.test.ts gateway/package.json gateway/package-lock.json
git commit -m "feat(gateway): add task-runner worker for scheduled task execution"
```

---

## Task 8: Wire Everything into Gateway Index

**Files:**
- Modify: `gateway/src/index.ts`

- [ ] **Step 1: Update gateway/src/index.ts to register new routes, fix CORS, and start task runner**

The current file is `gateway/src/index.ts` (see context: 42 lines, exports Hono app with health, upload, proxy routes).

Replace the entire file with:

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { proxy } from './routes/proxy.js'
import { uploadRouter } from './routes/upload.js'
import { emailRouter } from './routes/email.js'
import { taskRouter } from './routes/tasks.js'
import { gatewayRateLimit } from './middleware/rate-limit.js'
import { embedTokenAuth } from './middleware/auth.js'
import { executeDueTasks } from './workers/task-runner.js'
import { logger as appLogger } from './lib/logger.js'

const app = new Hono()

app.use('*', logger())

app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return null
      if (origin === 'https://terminalai.studioionique.com') return origin
      if (/^https:\/\/[a-z0-9-]+\.apps\.terminalai\.app$/.test(origin)) return origin
      // Allow localhost only in development
      if (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost')) return origin
      return null
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }),
)

app.get('/health', (c) => c.json({ status: 'ok', version: '1.0.0', ts: Date.now() }))

app.use('/v1/*', gatewayRateLimit())

app.route('/upload', uploadRouter)
app.route('/', proxy)

// New routes — protected by embedTokenAuth
app.use('/email/*', embedTokenAuth)
app.route('/email', emailRouter)

app.use('/tasks/*', embedTokenAuth)
app.route('/tasks', taskRouter)

// Task runner — ticks every 60 seconds
const TASK_RUNNER_INTERVAL_MS = 60_000
let taskRunnerTimer: ReturnType<typeof setInterval> | null = null

function startTaskRunner(): void {
  taskRunnerTimer = setInterval(async () => {
    try {
      await executeDueTasks()
    } catch (err) {
      appLogger.error({ msg: 'task_runner_error', err: String(err) })
    }
  }, TASK_RUNNER_INTERVAL_MS)
  appLogger.info({ msg: 'task_runner_started', intervalMs: TASK_RUNNER_INTERVAL_MS })
}

startTaskRunner()

const port = parseInt(process.env.PORT ?? '3001', 10)

export default {
  port,
  fetch: app.fetch,
}
```

Note: Using `setInterval` instead of BullMQ repeatable jobs for simplicity — the task runner is a single-instance polling loop. BullMQ is only needed if you scale to multiple gateway instances and need distributed locking. The `executeDueTasks` function is idempotent (each tick queries for `next_run_at <= NOW()` and updates it after execution), so even if a tick is slow, the next tick won't re-fire the same task.

- [ ] **Step 2: Run all gateway tests to ensure nothing broke**

Run: `cd gateway && bun test`
Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add gateway/src/index.ts
git commit -m "feat(gateway): wire email, tasks routes and start task-runner interval"
```

---

## Task 9: Scaffold SDK Templates

**Files:**
- Modify: `mcp-server/src/tools/scaffold.ts`

- [ ] **Step 1: Read current scaffold.ts to find where SDK files are generated**

Run: Read `mcp-server/src/tools/scaffold.ts` and locate the section where `lib/terminal-ai.ts` (gateway-sdk) is added to the `files` object. The new SDKs go in the same `files` map.

- [ ] **Step 2: Add email-sdk.ts template to the Next.js scaffold**

In `scaffold.ts`, after the gateway SDK (`lib/terminal-ai.ts`) entry in the `files` object, add:

```typescript
    'lib/email-sdk.ts': `const GATEWAY = process.env.TERMINAL_AI_GATEWAY_URL!;

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  embedToken: string,
): Promise<{ sent: boolean; messageId: string }> {
  const res = await fetch(\`\${GATEWAY}/email/send\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: \`Bearer \${embedToken}\`,
    },
    body: JSON.stringify({ to, subject, html }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(\`Email send failed (\${res.status}): \${(err as Record<string, string>).error ?? res.statusText}\`);
  }
  return res.json();
}
`,
```

- [ ] **Step 3: Add task-sdk.ts template to the Next.js scaffold**

In `scaffold.ts`, after the email SDK entry, add:

```typescript
    'lib/task-sdk.ts': `const GATEWAY = process.env.TERMINAL_AI_GATEWAY_URL!;

interface CreateTaskParams {
  name: string;
  schedule: string;
  callbackPath: string;
  payload?: Record<string, unknown>;
  timezone?: string;
}

export async function createTask(
  params: CreateTaskParams,
  embedToken: string,
): Promise<{ id: string; nextRunAt: string }> {
  const res = await fetch(\`\${GATEWAY}/tasks\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: \`Bearer \${embedToken}\`,
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(\`Task creation failed (\${res.status}): \${(err as Record<string, string>).error ?? res.statusText}\`);
  }
  return res.json();
}

export async function listTasks(
  embedToken: string,
): Promise<Array<{ id: string; name: string; schedule: string; enabled: boolean; nextRunAt: string | null }>> {
  const res = await fetch(\`\${GATEWAY}/tasks\`, {
    headers: { Authorization: \`Bearer \${embedToken}\` },
  });
  if (!res.ok) throw new Error(\`Task list failed: \${res.status}\`);
  return res.json();
}

export async function deleteTask(
  taskId: string,
  embedToken: string,
): Promise<{ deleted: boolean }> {
  const res = await fetch(\`\${GATEWAY}/tasks/\${taskId}\`, {
    method: 'DELETE',
    headers: { Authorization: \`Bearer \${embedToken}\` },
  });
  if (!res.ok) throw new Error(\`Task delete failed: \${res.status}\`);
  return res.json();
}
`,
```

- [ ] **Step 4: Update scaffold notes to mention email and task capabilities**

In the `notes` array of the scaffold output, add:

```typescript
'Use lib/email-sdk.ts to send emails to the authenticated user via the gateway',
'Use lib/task-sdk.ts to register cron schedules — the gateway will POST to your callback path on schedule',
'Task callbacks receive a short-lived token in the Authorization header — use it for AI and email calls',
```

- [ ] **Step 5: Run existing scaffold tests to check for regressions**

Run: `cd mcp-server && bun test`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/tools/scaffold.ts
git commit -m "feat(scaffold): add email-sdk.ts and task-sdk.ts to generated app templates"
```

---

## Task 10: MCP Server Task Management Tools

**Files:**
- Modify: `mcp-server/src/index.ts`

- [ ] **Step 1: Read mcp-server/src/index.ts to find where tools are registered**

Read the file and locate the pattern for registering tools (the `server.setRequestHandler(ListToolsRequestSchema, ...)` and `server.setRequestHandler(CallToolRequestSchema, ...)` sections).

- [ ] **Step 2: Add tool definitions to the ListTools handler**

Add these three tool definitions to the tools array:

```typescript
{
  name: 'create_scheduled_task',
  description: 'Create a scheduled task (cron job) for a deployed app. The gateway will POST to the callback path on the given schedule.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      app_id: { type: 'string', description: 'UUID of the deployed app' },
      name: { type: 'string', description: 'Human-readable task name (max 100 chars, unique per app)' },
      schedule: { type: 'string', description: 'Cron expression (5 fields, minimum 1-hour interval). Example: "0 8 * * *" for daily 8am' },
      callback_path: { type: 'string', description: 'Path on the app to POST to. Must start with /. Example: "/api/cron/report"' },
      payload: { type: 'object', description: 'JSON payload sent as POST body on each execution (max 10KB)' },
      timezone: { type: 'string', description: 'IANA timezone. Default: UTC. Example: "Asia/Kolkata"' },
    },
    required: ['app_id', 'name', 'schedule', 'callback_path'],
  },
},
{
  name: 'list_scheduled_tasks',
  description: 'List all scheduled tasks for a deployed app',
  inputSchema: {
    type: 'object' as const,
    properties: {
      app_id: { type: 'string', description: 'UUID of the deployed app' },
    },
    required: ['app_id'],
  },
},
{
  name: 'delete_scheduled_task',
  description: 'Delete a scheduled task',
  inputSchema: {
    type: 'object' as const,
    properties: {
      app_id: { type: 'string', description: 'UUID of the deployed app' },
      task_id: { type: 'string', description: 'UUID of the task to delete' },
    },
    required: ['app_id', 'task_id'],
  },
},
```

- [ ] **Step 3: Add tool handlers to the CallTool handler**

Add cases in the switch/if chain for the three new tools. These call the gateway directly using an internal service token:

```typescript
case 'create_scheduled_task': {
  const { app_id, name, schedule, callback_path, payload, timezone } = args
  const gatewayUrl = process.env.TERMINAL_AI_GATEWAY_URL ?? 'http://gateway:3001'

  // Get creator's embed token for this app
  const tokenResult = await db.query<{ token: string }>(
    `SELECT et.token FROM gateway.embed_tokens et
     WHERE et.app_id = $1 AND et.expires_at > NOW()
     ORDER BY et.created_at DESC LIMIT 1`,
    [app_id],
  )
  if (!tokenResult.rows[0]) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: 'No valid embed token found for app. Deploy the app first.' }) }] }
  }

  const res = await fetch(`${gatewayUrl}/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenResult.rows[0].token}`,
    },
    body: JSON.stringify({ name, schedule, callbackPath: callback_path, payload: payload ?? {}, timezone: timezone ?? 'UTC' }),
  })
  const data = await res.json()
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

case 'list_scheduled_tasks': {
  const { app_id } = args
  const result = await db.query(
    `SELECT id, name, schedule, callback_path, timezone, enabled, next_run_at, last_run_at, last_run_status
     FROM gateway.scheduled_tasks WHERE app_id = $1 ORDER BY created_at`,
    [app_id],
  )
  return { content: [{ type: 'text', text: JSON.stringify(result.rows, null, 2) }] }
}

case 'delete_scheduled_task': {
  const { app_id, task_id } = args
  const result = await db.query(
    `DELETE FROM gateway.scheduled_tasks WHERE id = $1 AND app_id = $2`,
    [task_id, app_id],
  )
  const deleted = (result.rowCount ?? 0) > 0
  return { content: [{ type: 'text', text: JSON.stringify({ deleted, taskId: task_id }) }] }
}
```

- [ ] **Step 4: Run MCP server tests to check for regressions**

Run: `cd mcp-server && bun test`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/index.ts
git commit -m "feat(mcp): add create/list/delete scheduled task tools"
```

---

## Task 11: Final Integration Verification

- [ ] **Step 1: Run all gateway tests**

Run: `cd gateway && bun test`
Expected: all tests PASS

- [ ] **Step 2: Run all mcp-server tests**

Run: `cd mcp-server && bun test`
Expected: all tests PASS

- [ ] **Step 3: Run TypeScript type check on gateway**

Run: `cd gateway && bunx tsc --noEmit`
Expected: no type errors

- [ ] **Step 4: Run TypeScript type check on mcp-server**

Run: `cd mcp-server && bunx tsc --noEmit`
Expected: no type errors

- [ ] **Step 5: Verify all new files are committed**

Run: `cd "/Users/aditya/Documents/Coding Projects/Terminal AI" && git status`
Expected: clean working tree (nothing untracked or modified)

- [ ] **Step 6: Review commit log for this feature**

Run: `git log --oneline -15`
Expected: 10 commits in sequence:
1. `feat(db): add migration 010 for scheduled tasks and email audit tables`
2. `feat(gateway): add cron-utils for schedule validation and next-run calculation`
3. `feat(gateway): add EmailProvider interface with Resend implementation`
4. `feat(gateway): add POST /email/send route with recipient validation and credit deduction`
5. `feat(gateway): add /tasks CRUD routes with schedule validation and app scoping`
6. `feat(gateway): extend embedTokenAuth to accept task_execution JWT tokens`
7. `feat(gateway): add task-runner worker for scheduled task execution`
8. `feat(gateway): wire email, tasks routes and start task-runner interval`
9. `feat(scaffold): add email-sdk.ts and task-sdk.ts to generated app templates`
10. `feat(mcp): add create/list/delete scheduled task tools`
