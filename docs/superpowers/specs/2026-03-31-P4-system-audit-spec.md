# P4 — System Audit Spec
**Date:** 2026-03-31
**Target:** Harden production security, observability, and operational readiness

---

## Goals

- Enforce security baseline across all services
- Add structured logging to replace any remaining console.log usage
- Rate limiting on all public endpoints
- Audit log for all admin actions
- Database index audit and query performance
- Secrets rotation checklist
- Public status page

---

## 1. Security Audit

### 1a. Input Validation

All API routes that accept user input must validate with Zod before processing.

Routes to audit and add Zod validation:

| Route | Current State | Fix |
|-------|--------------|-----|
| POST /api/embed-token | Basic type cast | Add Zod schema |
| POST /api/subscriptions | Unknown | Add Zod schema |
| POST /api/credits/purchase | Unknown | Add Zod schema |
| PATCH /api/creator/apps/[appId] | Unknown | Add Zod schema |
| POST /api/creator/onboarding/channel | New | Zod from start |
| POST /api/admin/users/[userId]/ban | New | Zod from start |
| All PATCH /api/admin/* routes | New | Zod from start |

Schema pattern (all routes must follow):

```typescript
import { z } from 'zod'
const schema = z.object({ ... })
export async function POST(req: NextRequest) {
  const body = schema.safeParse(await req.json())
  if (!body.success) {
    return NextResponse.json({ error: 'Invalid request', details: body.error.flatten() }, { status: 400 })
  }
  // body.data is now typed
}
```

### 1b. SQL Injection Audit

Verify all DB queries use parameterized queries (no string interpolation).

Files to audit:
- platform/lib/credits.ts — OK (parameterized CTEs)
- platform/app/api/embed-token/route.ts — OK
- gateway/src/middleware/auth.ts — OK
- gateway/src/routes/proxy.ts — OK
- All new admin routes (P1.2, P1.3)
- All new creator routes (P1.1)

### 1c. Authorization Audit

Every API route must have explicit auth check. Audit pattern:

```typescript
// Every route must have ONE of:
const session = await auth.api.getSession(...)
if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

// PLUS one of:
// a) Creator check: user owns the channel/app
// b) Admin check: session.user.role === 'admin'
// c) Internal check: x-internal-secret header matches INTERNAL_SECRET env var
```

Routes that call other services internally (platform to deploy-manager, gateway to platform):
- Use INTERNAL_SECRET env var
- Set x-internal-secret: ${INTERNAL_SECRET} header
- Receiving service validates header

### 1d. Secrets Audit

Run gitleaks scan across entire repo. Expected findings: none.

Env vars that must exist in production:
- EMBED_TOKEN_SECRET — min 32 chars, random
- INTERNAL_SECRET — min 32 chars, random
- CRON_SECRET — min 32 chars, random
- BETTER_AUTH_SECRET — min 32 chars, random
- RAZORPAY_KEY_SECRET — from Razorpay dashboard
- OPENROUTER_API_KEY — from OpenRouter
- COOLIFY_TOKEN — from Coolify
- COOLIFY_PROJECT_UUID — from Coolify
- COOLIFY_SERVER_UUID — from Coolify
- DATABASE_URL — postgres connection string
- REDIS_URL — redis connection string
- NEXT_PUBLIC_APP_URL — https://terminalai.app

### 1e. CORS Configuration

gateway/src/index.ts:
- Allow: https://terminalai.app, https://*.apps.terminalai.app
- Block: all other origins for /v1/chat/completions
- Verify OPTIONS preflight returns correct headers

---

## 2. Observability

### 2a. Structured Logging

Replace all console.log/error/warn with a structured logger.

Create platform/lib/logger.ts:
```typescript
import pino from 'pino'
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: { level: (label) => ({ level: label }) },
  base: { service: 'platform' },
})
```

Create gateway/src/logger.ts and deploy-manager/src/logger.ts similarly.

Grep for console.log across all services and replace with logger calls.

### 2b. Request ID Propagation

Add x-request-id header to all inter-service calls:
- Platform to Gateway: attach session user ID + request ID
- Platform to Deploy-manager: attach deployment ID + request ID
- Log request ID on every log line for correlation

### 2c. Error Tracking

Add error boundary logging to platform:
```typescript
// platform/app/global-error.tsx
'use client'
export default function GlobalError({ error }) {
  logger.error({ msg: 'Unhandled client error', error: error.message })
  return <html><body><h2>Something went wrong</h2></body></html>
}
```

---

## 3. Rate Limiting

### 3a. Gateway Rate Limiting

gateway/src/middleware/rate-limit.ts — new file:
```typescript
// Per-user, per-minute limit using Redis sliding window
const LIMITS = {
  authenticated: 60,   // 60 requests/minute
  anonymous: 5,        // 5 requests/minute
}
```

Use Redis ZADD + ZREMRANGEBYSCORE for sliding window.

### 3b. Platform API Rate Limiting

Apply to public-facing platform routes:
- POST /api/embed-token: 10/minute per user
- POST /api/embed-token/preview: 5/hour per IP
- POST /api/credits/purchase: 3/minute per user
- POST /api/subscriptions: 5/minute per user

Use middleware in Next.js API routes, backed by Redis.

---

## 4. Audit Log

### 4a. Schema

```sql
-- migration 013_audit_log_v2.sql
ALTER TABLE platform.audit_log
  ADD COLUMN IF NOT EXISTS ip_address INET,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS request_id TEXT;
```

### 4b. Events to Audit

All admin actions:
- User ban/unban
- Credit grant
- Role change
- Channel suspension/unsuspension
- App status override
- Superadmin channel toggle

All billing events:
- Subscription activation
- Subscription cancellation
- Credit pack purchase
- Welcome credit grant
- Session credit deduction (already in credit_ledger)

---

## 5. Database Performance

### 5a. Index Audit

Critical queries to add indexes for:

```sql
-- migration 014_indexes.sql
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_recent
  ON subscriptions.credit_ledger(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_embed_tokens_hash_active
  ON gateway.embed_tokens(token_hash)
  WHERE expires_at > NOW();

CREATE INDEX IF NOT EXISTS idx_apps_active
  ON marketplace.apps(id)
  WHERE deleted_at IS NULL AND status = 'live';

CREATE INDEX IF NOT EXISTS idx_api_calls_user_app
  ON gateway.api_calls(user_id, app_id, created_at DESC);
```

### 5b. Connection Pool

Verify pg connection pool settings in platform/lib/db.ts:
- max: 20 (platform)
- max: 10 (gateway)
- idleTimeoutMillis: 30000
- connectionTimeoutMillis: 5000

---

## 6. Public Status Page

### 6a. Status API

GET /api/status returns:
```json
{
  "status": "operational",
  "services": {
    "platform": "operational",
    "gateway": "operational",
    "database": "operational",
    "deploy_manager": "operational"
  },
  "latency": { "gateway_p99_ms": 145, "db_query_ms": 12 },
  "uptime_30d": 99.8
}
```

### 6b. Status Page Frontend

platform/app/(marketplace)/status/page.tsx:
- Service list with status indicators
- Incident history (last 5 incidents)
- Auto-refreshes every 30s

---

## 7. Operational Runbook

Create docs/runbook.md with:
- How to grant credits manually (SQL + admin UI)
- How to force-redeploy an app
- How to rotate secrets
- How to investigate a billing discrepancy
- How to check Coolify app health
- How to clear BullMQ stuck jobs
- Emergency: how to disable anonymous usage

---

## Acceptance Criteria

- [ ] gitleaks scan returns 0 findings
- [ ] All public API routes have Zod input validation
- [ ] All admin routes have explicit role check
- [ ] No console.log in any service
- [ ] All inter-service calls use INTERNAL_SECRET header
- [ ] Rate limiting: embed-token endpoint rejects more than 10 req/min per user
- [ ] Audit log: admin credit grant creates audit log entry
- [ ] All 4 critical DB indexes exist
- [ ] Status page at /status shows live service health
- [ ] Runbook exists at docs/runbook.md with all 7 topics
