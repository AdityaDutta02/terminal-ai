# Scheduled Tasks & Email Gateway Routes — Design Spec

**Date:** 2026-04-08  
**Status:** Draft  
**Scope:** Gateway email route, task CRUD routes, task execution engine, scaffold/MCP updates

---

## Problem

Deployed apps on VPS2 can call AI models, read/write to a database, and use object storage — all via the gateway. But they cannot:

1. **Send emails** — needed for notifications, reports, alerts
2. **Run on a schedule** — needed for daily/weekly automated tasks (e.g., "Daily Market Update" app)

These two gaps prevent an entire class of apps: scheduled report generators, monitoring alerts, digest emails, and any app that needs to do work without a user actively viewing it.

## Goal

Add email sending and scheduled task execution as gateway routes, following the existing pattern: embed-token auth, credit-based billing, app-scoped isolation. Apps call the gateway for everything — AI, DB, storage, email, and now scheduling.

**Target use case:** A "Daily Market Update" app where the user selects a market index, picks an email time, and receives a formatted AI-generated report daily. The app:
1. Saves config via `POST /db/configs`
2. Registers a cron task via `POST /tasks` (e.g., "0 8 * * *" in Asia/Kolkata)
3. At 8:00 AM, the task runner POSTs to the app's callback URL
4. The callback handler calls `/v1/chat/completions` with a grounded model (Perplexity/Gemini) for live data
5. Sends the formatted report via `POST /email/send`

---

## Architecture

```
App on VPS2 (embed token in Authorization header)
        │
        ├── POST /email/send         ← EmailRouter   (gateway/src/routes/email.ts)
        ├── POST/GET/PATCH/DELETE /tasks/*  ← TaskRouter  (gateway/src/routes/tasks.ts)
        │         both protected by existing embedTokenAuth middleware
        │
        ▼
   Email: gateway dispatches via Resend (swappable to Postal for self-hosting)
   Tasks: gateway stores schedule in DB, task-runner worker fires HTTP callbacks

Task Runner (BullMQ repeatable job inside gateway process):
        │
        ├── Every 60s: query gateway.scheduled_tasks for due tasks
        ├── For each due task:
        │     1. Mint a task-execution JWT (2min TTL)
        │     2. POST to app's callback URL with token + payload
        │     3. Log result to gateway.task_executions
        └── Retry failed callbacks: 3 attempts (1m, 5m, 15m backoff)
```

### Files Changed

**New — gateway:**
- `gateway/src/routes/email.ts` — email send route
- `gateway/src/routes/tasks.ts` — task CRUD routes
- `gateway/src/services/email-provider.ts` — EmailProvider interface + Resend implementation
- `gateway/src/workers/task-runner.ts` — BullMQ repeatable job for task execution

**Modified — gateway:**
- `gateway/src/index.ts` — register `/email` and `/tasks` routers, CORS allowMethods fix, start task-runner worker
- `gateway/src/middleware/auth.ts` — extend embedTokenAuth to accept `type: "task_execution"` tokens
- `gateway/package.json` — add `bullmq`, `resend` dependencies

**Modified — mcp-server:**
- `mcp-server/src/tools/scaffold.ts` — add `email-sdk.ts` and `task-sdk.ts` to generated files

**Modified — mcp-server:**
- `mcp-server/src/index.ts` — add `create_scheduled_task`, `list_scheduled_tasks`, `delete_scheduled_task` tools

**New migration — platform:**
- `platform/lib/db/migrations/010_tasks_email.sql` — new gateway tables

---

## Email Route

### `POST /email/send`

Requires valid embed token. Sends a transactional email via the platform's email provider.

**Request:**
```json
{
  "to": "user@example.com",
  "subject": "Your Daily NIFTY50 Report",
  "html": "<div>Formatted report content...</div>"
}
```

**Response (200):**
```json
{ "sent": true, "messageId": "resend-msg-id" }
```

### Recipient Restriction

The `to` address must match the authenticated user's email. The route looks up the user's email from `public.user` via `embedToken.userId`:

```sql
SELECT email FROM public."user" WHERE id = $1
```

If `to` does not match the user's email → 403 `{ "error": "Can only send emails to the authenticated user" }`.

For task-execution tokens, the `userId` is looked up from `gateway.scheduled_tasks.user_id`.

### Credit Cost

1 credit per email sent. Deducted from the task creator's credit balance using the same ledger pattern as the AI proxy:

```sql
INSERT INTO subscriptions.credit_ledger (user_id, delta, balance_after, reason, app_id)
VALUES ($1, -1, (SELECT COALESCE(SUM(delta), 0) - 1 FROM subscriptions.credit_ledger WHERE user_id = $1), 'email_send', $2)
```

Insufficient credits → 402 `{ "error": "Insufficient credits", "redirect": "/pricing?reason=insufficient_credits" }`.

### Rate Limiting

10 emails per hour per app per user. Tracked via Redis sorted set (`rl:email:{appId}:{userId}`), same pattern as `gateway/src/middleware/rate-limit.ts`.

### Sender

Always `Terminal AI <noreply@terminalai.studioionique.com>`. Apps cannot set or spoof the from address.

### Email Provider Interface

```typescript
interface EmailProvider {
  send(params: { from: string; to: string; subject: string; html: string }): Promise<{ messageId: string }>
}
```

Initial implementation: `ResendEmailProvider` wrapping the Resend SDK.  
Future: `PostalEmailProvider` for self-hosted email at scale.

### Audit Table

```sql
gateway.email_sends (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id        UUID NOT NULL,
  user_id       TEXT NOT NULL,
  recipient     TEXT NOT NULL,
  subject       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'sent',
  message_id    TEXT,
  credits_charged INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

### Error Handling

| Scenario | Status | Response |
|---|---|---|
| Recipient doesn't match user email | 403 | `{ "error": "Can only send emails to the authenticated user" }` |
| Insufficient credits | 402 | `{ "error": "Insufficient credits" }` |
| Rate limit exceeded | 429 | `{ "error": "Email rate limit exceeded (10/hour)" }` |
| Resend API failure | 502 | `{ "error": "Email delivery failed" }` |
| Missing required fields | 400 | `{ "error": "Missing required field: subject" }` |

---

## Scheduled Tasks Routes

All routes require a valid embed token. Tasks are scoped to `appId` from the token — apps can only manage their own tasks.

### `POST /tasks` — Create Task

**Request:**
```json
{
  "name": "daily-market-report",
  "schedule": "0 8 * * *",
  "callbackPath": "/api/cron/market-report",
  "payload": { "market": "NIFTY50", "email": "user@example.com" },
  "timezone": "Asia/Kolkata",
  "enabled": true
}
```

**Response (201):**
```json
{
  "id": "task-uuid",
  "name": "daily-market-report",
  "schedule": "0 8 * * *",
  "callbackPath": "/api/cron/market-report",
  "callbackUrl": "https://daily-market.apps.terminalai.app/api/cron/market-report",
  "timezone": "Asia/Kolkata",
  "enabled": true,
  "nextRunAt": "2026-04-09T02:30:00Z",
  "createdAt": "2026-04-08T12:00:00Z"
}
```

**Field details:**
- `name` — human-readable label, unique per app (max 100 chars)
- `schedule` — standard cron expression (5 fields). Minimum interval: 1 hour. Validated server-side.
- `callbackPath` — path relative to the app's deployed URL. Must start with `/`.
- `payload` — arbitrary JSON object stored and sent as POST body on execution (max 10KB)
- `timezone` — IANA timezone string (default: `UTC`). Cron expression is evaluated in this timezone.
- `enabled` — whether the task is active (default: `true`)

The `callbackUrl` is resolved by looking up the app's live deployment URL:
```sql
SELECT subdomain FROM deployments.deployments
WHERE app_id = $1 AND status = 'live'
ORDER BY created_at DESC LIMIT 1
```

### `GET /tasks` — List Tasks

**Response (200):**
```json
[
  {
    "id": "task-uuid",
    "name": "daily-market-report",
    "schedule": "0 8 * * *",
    "callbackPath": "/api/cron/market-report",
    "timezone": "Asia/Kolkata",
    "enabled": true,
    "nextRunAt": "2026-04-09T02:30:00Z",
    "lastRunAt": "2026-04-08T02:30:00Z",
    "lastRunStatus": "success"
  }
]
```

### `GET /tasks/:id` — Get Task + Execution History

Returns the task plus the last 20 executions:

```json
{
  "id": "task-uuid",
  "name": "daily-market-report",
  "schedule": "0 8 * * *",
  "callbackPath": "/api/cron/market-report",
  "timezone": "Asia/Kolkata",
  "enabled": true,
  "nextRunAt": "2026-04-09T02:30:00Z",
  "executions": [
    {
      "id": "exec-uuid",
      "firedAt": "2026-04-08T02:30:00Z",
      "status": "success",
      "responseCode": 200,
      "latencyMs": 4523,
      "retryCount": 0
    }
  ]
}
```

### `PATCH /tasks/:id` — Update Task

Accepts any subset of: `name`, `schedule`, `callbackPath`, `payload`, `timezone`, `enabled`.

Recalculates `nextRunAt` if `schedule` or `timezone` changes.

### `DELETE /tasks/:id` — Delete Task

**Response (200):** `{ "deleted": true }`

### Limits (v1)

- Max **5 active tasks** per app
- Minimum schedule interval: **1 hour** (cron expressions resolving to sub-hour rejected)
- Payload max size: **10KB**
- Callback timeout: **30 seconds**
- Max retry attempts: **3** (backoff: 1m, 5m, 15m)

---

## Task Execution Engine

### Worker: `gateway/src/workers/task-runner.ts`

A BullMQ repeatable job running inside the gateway process. Ticks every 60 seconds.

### Execution Flow

```
Every 60 seconds:
  1. Query: SELECT * FROM gateway.scheduled_tasks
           WHERE enabled = true AND next_run_at <= NOW()
  2. For each due task:
     a. Mint task-execution JWT:
        { appId, taskId, userId, type: "task_execution", exp: +2min }
     b. Resolve callback URL from deployment record
     c. POST to callbackUrl:
        - Authorization: Bearer <task-execution-jwt>
        - Content-Type: application/json
        - Body: task.payload
     d. Record result in gateway.task_executions
     e. Calculate next_run_at from cron expression + timezone
     f. UPDATE gateway.scheduled_tasks SET
          next_run_at = <calculated>,
          last_run_at = NOW(),
          last_run_status = 'success' | 'failed'
  3. If callback fails (5xx, timeout, connection error):
     - Queue retry with BullMQ delayed job (1m, 5m, 15m)
     - After 3 failures: mark execution as 'failed', do NOT disable the task
```

### Task Execution Token

A new JWT type accepted by `embedTokenAuth`:

```json
{
  "appId": "550e8400-...",
  "taskId": "task-uuid",
  "userId": "user-id",
  "type": "task_execution",
  "isFree": false,
  "creditsPerCall": 1,
  "iat": 1712560000,
  "exp": 1712560120
}
```

- **2-minute TTL** — enough for the callback to make AI + email calls
- **Signed with same `EMBED_TOKEN_SECRET`**
- **Not stored in `gateway.embed_tokens`** — validated by signature + expiry only (no DB lookup for task tokens)
- `creditsPerCall` inherited from the app's configuration
- `userId` is the task creator — their credits are charged for AI/email calls during execution

### Auth Middleware Extension

`embedTokenAuth` in `gateway/src/middleware/auth.ts` modified:

```
1. Verify JWT signature + expiry (existing)
2. Check token type:
   - If type === "task_execution":
     → Skip embed_tokens DB lookup (task tokens aren't stored)
     → Still check channel suspension (task tokens carry appId)
     → Set embedToken context from JWT payload directly
   - Else (regular embed token):
     → Existing flow: DB lookup, channel suspension check
3. Continue to route handler
```

### Database Tables

```sql
-- 010_tasks_email.sql

-- Scheduled tasks
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

CREATE INDEX idx_scheduled_tasks_due ON gateway.scheduled_tasks (next_run_at)
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

CREATE INDEX idx_task_executions_task ON gateway.task_executions (task_id, fired_at DESC);

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

CREATE INDEX idx_email_sends_app ON gateway.email_sends (app_id, created_at DESC);
```

---

## CORS Fix

In `gateway/src/index.ts`, line 23:

```diff
- allowMethods: ['POST', 'OPTIONS'],
+ allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
```

Required for `/db/*` (GET, PATCH, DELETE), `/storage/*` (GET, PUT, DELETE), `/tasks/*` (GET, PATCH, DELETE), and `/email/*` (POST only, but consistency).

---

## Scaffold Updates

### `email-sdk.ts` (generated by scaffold.ts)

```typescript
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  embedToken: string,
): Promise<{ sent: boolean; messageId: string }> {
  const res = await fetch(`${process.env.TERMINAL_AI_GATEWAY_URL}/email/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${embedToken}`,
    },
    body: JSON.stringify({ to, subject, html }),
  })
  if (!res.ok) throw new Error(`Email send failed: ${res.status}`)
  return res.json()
}
```

### `task-sdk.ts` (generated by scaffold.ts)

```typescript
export async function createTask(
  params: {
    name: string
    schedule: string
    callbackPath: string
    payload?: Record<string, unknown>
    timezone?: string
  },
  embedToken: string,
): Promise<{ id: string; nextRunAt: string }> {
  const res = await fetch(`${process.env.TERMINAL_AI_GATEWAY_URL}/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${embedToken}`,
    },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(`Task creation failed: ${res.status}`)
  return res.json()
}

export async function listTasks(embedToken: string): Promise<Array<{ id: string; name: string; schedule: string; enabled: boolean }>> {
  const res = await fetch(`${process.env.TERMINAL_AI_GATEWAY_URL}/tasks`, {
    headers: { Authorization: `Bearer ${embedToken}` },
  })
  if (!res.ok) throw new Error(`Task list failed: ${res.status}`)
  return res.json()
}

export async function deleteTask(taskId: string, embedToken: string): Promise<{ deleted: boolean }> {
  const res = await fetch(`${process.env.TERMINAL_AI_GATEWAY_URL}/tasks/${taskId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${embedToken}` },
  })
  if (!res.ok) throw new Error(`Task delete failed: ${res.status}`)
  return res.json()
}
```

---

## MCP Server New Tools

Added to `mcp-server/src/index.ts`:

### `create_scheduled_task`
- Input: `app_id`, `name`, `schedule`, `callback_path`, `payload`, `timezone`
- Calls platform internal API which proxies to gateway
- Returns: task ID, next run time

### `list_scheduled_tasks`
- Input: `app_id`
- Returns: array of tasks with last execution status

### `delete_scheduled_task`
- Input: `app_id`, `task_id`
- Returns: deletion confirmation

---

## Testing

- `gateway/src/routes/email.test.ts` — recipient validation, credit deduction, rate limiting, Resend failure handling
- `gateway/src/routes/tasks.test.ts` — CRUD happy paths, 5-task limit, sub-hour schedule rejection, payload size limit
- `gateway/src/workers/task-runner.test.ts` — due task pickup, JWT minting, callback success/failure, retry logic, next_run_at calculation
- `gateway/src/middleware/auth.test.ts` — extend: task-execution token acceptance, skip DB lookup for task tokens

---

## Out of Scope (v1)

- Email templates / rich template engine
- Email attachments
- Multi-recipient emails (only authenticated user)
- Task execution dashboard in platform UI
- Webhook-style tasks (event-triggered, not cron)
- Sub-hour cron schedules
- Task chaining / dependencies
- Self-hosted email provider (Postal) — architecture supports it via EmailProvider interface
