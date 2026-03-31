# P1 — Admin Systems Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build channel admin dashboard, superadmin dashboard, moderation tools (ban/suspend), and creator onboarding flow.

**Architecture:** New `app/creator/` route group for channel owners; extend existing `app/admin/` for superadmin. All routes protected by role-checking middleware. Materialized views for analytics performance.

**Tech Stack:** Next.js 15 App Router, PostgreSQL (pg), better-auth, Razorpay (creator balance display), Recharts or similar for charts.

**Prerequisite:** P0 migration 007_pricing.sql must be applied (adds `creator_balance`, `is_superadmin_channel`).

---

## File Map

**New files:**
- `infra/postgres/migrations/008_channel_admin.sql`
- `infra/postgres/migrations/009_superadmin.sql`
- `infra/postgres/migrations/010_moderation.sql`
- `infra/postgres/migrations/011_creator_onboarding.sql`
- `platform/lib/middleware/require-creator.ts`
- `platform/lib/middleware/require-admin.ts`
- `platform/app/api/creator/channel/route.ts`
- `platform/app/api/creator/apps/route.ts`
- `platform/app/api/creator/apps/[appId]/route.ts`
- `platform/app/api/creator/revenue/route.ts`
- `platform/app/api/admin/stats/route.ts`
- `platform/app/api/admin/users/route.ts`
- `platform/app/api/admin/users/[userId]/route.ts`
- `platform/app/api/admin/users/[userId]/ban/route.ts`
- `platform/app/api/admin/channels/route.ts`
- `platform/app/api/admin/channels/[channelId]/route.ts`
- `platform/app/api/admin/revenue/route.ts`
- `platform/app/creator/layout.tsx`
- `platform/app/creator/page.tsx`
- `platform/app/creator/apps/page.tsx`
- `platform/app/creator/apps/[appId]/page.tsx`
- `platform/app/creator/revenue/page.tsx`
- `platform/app/creator/settings/page.tsx`
- `platform/app/creator/onboarding/page.tsx`
- `platform/app/api/creator/onboarding/channel/route.ts`

**Modified files:**
- `platform/app/admin/page.tsx` (extend with stats)
- `platform/app/admin/users/page.tsx` (extend with ban actions)
- `platform/lib/auth.ts` (add ban check hook)
- `gateway/src/middleware/auth.ts` (add channel suspension check)

---

### Task 1: Database Migrations

**Files:**
- Create: `infra/postgres/migrations/008_channel_admin.sql`
- Create: `infra/postgres/migrations/009_superadmin.sql`
- Create: `infra/postgres/migrations/010_moderation.sql`
- Create: `infra/postgres/migrations/011_creator_onboarding.sql`

- [ ] **Step 1: Write migration 008**

```sql
-- infra/postgres/migrations/008_channel_admin.sql
BEGIN;

CREATE SCHEMA IF NOT EXISTS analytics;

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.app_usage AS
SELECT
  ac.app_id,
  DATE_TRUNC('day', ac.created_at) AS day,
  COUNT(*) AS sessions,
  SUM(ac.credits_charged)::INTEGER AS credits_spent,
  COUNT(DISTINCT ac.user_id) AS unique_users
FROM gateway.api_calls ac
GROUP BY ac.app_id, DATE_TRUNC('day', ac.created_at);

CREATE UNIQUE INDEX IF NOT EXISTS app_usage_app_day
  ON analytics.app_usage(app_id, day);

COMMIT;
```

- [ ] **Step 2: Write migration 009**

```sql
-- infra/postgres/migrations/009_superadmin.sql
BEGIN;

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.platform_stats AS
SELECT
  DATE_TRUNC('day', created_at) AS day,
  COUNT(*) AS api_calls,
  SUM(credits_charged)::INTEGER AS total_credits,
  COUNT(DISTINCT user_id) AS active_users,
  COUNT(DISTINCT app_id) AS active_apps,
  COUNT(CASE WHEN status = 'error' THEN 1 END) AS errors
FROM gateway.api_calls
GROUP BY DATE_TRUNC('day', created_at);

CREATE UNIQUE INDEX IF NOT EXISTS platform_stats_day
  ON analytics.platform_stats(day);

COMMIT;
```

- [ ] **Step 3: Write migration 010**

```sql
-- infra/postgres/migrations/010_moderation.sql
BEGIN;

CREATE TABLE IF NOT EXISTS platform.user_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public."user"(id),
  reason TEXT NOT NULL,
  banned_by TEXT NOT NULL REFERENCES public."user"(id),
  banned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS platform.channel_suspensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES marketplace.channels(id),
  reason TEXT NOT NULL,
  suspended_by TEXT NOT NULL REFERENCES public."user"(id),
  suspended_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lifted_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS user_bans_user_active
  ON platform.user_bans(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS channel_suspensions_channel_active
  ON platform.channel_suspensions(channel_id) WHERE is_active = true;

COMMIT;
```

- [ ] **Step 4: Write migration 011**

```sql
-- infra/postgres/migrations/011_creator_onboarding.sql
BEGIN;

ALTER TABLE marketplace.channels
  ADD COLUMN IF NOT EXISTS onboarding_step INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

COMMIT;
```

- [ ] **Step 5: Apply all migrations**

```bash
for migration in 008 009 010 011; do
  docker cp infra/postgres/migrations/${migration}_*.sql $(docker ps -qf "name=postgres"):/tmp/
  docker exec -it $(docker ps -qf "name=postgres") psql -U postgres -d terminalai \
    -f /tmp/$(ls infra/postgres/migrations/${migration}_*.sql | xargs basename)
done
```

Expected: `COMMIT` for each migration.

- [ ] **Step 6: Commit**

```bash
git add infra/postgres/migrations/008_channel_admin.sql infra/postgres/migrations/009_superadmin.sql infra/postgres/migrations/010_moderation.sql infra/postgres/migrations/011_creator_onboarding.sql
git commit -m "feat(db): migrations 008-011 — analytics views, moderation tables, creator onboarding"
```

---

### Task 2: Auth Middleware Helpers

**Files:**
- Create: `platform/lib/middleware/require-creator.ts`
- Create: `platform/lib/middleware/require-admin.ts`

- [ ] **Step 1: Write failing tests**

Create `platform/lib/middleware/require-creator.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/db', () => ({ db: { query: vi.fn() } }))
import { db } from '@/lib/db'
import { getCreatorChannel } from './require-creator'

const mockDb = vi.mocked(db.query)

describe('getCreatorChannel', () => {
  it('returns channel when user owns one', async () => {
    mockDb.mockResolvedValueOnce({ rows: [{ id: 'chan1', name: 'My Channel' }] } as any)
    const channel = await getCreatorChannel('user1')
    expect(channel).toEqual({ id: 'chan1', name: 'My Channel' })
  })

  it('returns null when user has no channel', async () => {
    mockDb.mockResolvedValueOnce({ rows: [] } as any)
    const channel = await getCreatorChannel('user1')
    expect(channel).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd platform && npx vitest run lib/middleware/require-creator.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write require-creator**

```typescript
// platform/lib/middleware/require-creator.ts
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

export interface CreatorChannel {
  id: string
  name: string
  slug: string
  is_superadmin_channel: boolean
  creator_balance: number
}

export async function getCreatorChannel(userId: string): Promise<CreatorChannel | null> {
  const result = await db.query<CreatorChannel>(
    `SELECT id, name, slug, is_superadmin_channel, creator_balance
     FROM marketplace.channels WHERE user_id = $1 LIMIT 1`,
    [userId],
  )
  return result.rows[0] ?? null
}

export async function requireCreator(): Promise<
  { session: { user: { id: string } }; channel: CreatorChannel } | NextResponse
> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const channel = await getCreatorChannel(session.user.id)
  if (!channel) return NextResponse.json({ error: 'No creator channel found' }, { status: 403 })

  return { session: session as { user: { id: string } }, channel }
}
```

- [ ] **Step 4: Write require-admin**

```typescript
// platform/lib/middleware/require-admin.ts
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export async function requireAdmin(): Promise<
  { session: { user: { id: string; role: string } } } | NextResponse
> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return { session: session as { user: { id: string; role: string } } }
}
```

- [ ] **Step 5: Run tests**

```bash
cd platform && npx vitest run lib/middleware/require-creator.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add platform/lib/middleware/
git commit -m "feat(auth): creator and admin middleware helpers"
```

---

### Task 3: Creator Channel API

**Files:**
- Create: `platform/app/api/creator/channel/route.ts`
- Create: `platform/app/api/creator/apps/route.ts`
- Create: `platform/app/api/creator/apps/[appId]/route.ts`
- Create: `platform/app/api/creator/revenue/route.ts`

- [ ] **Step 1: Write tests**

Create `platform/app/api/creator/channel/route.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: { query: vi.fn() } }))
vi.mock('@/lib/middleware/require-creator', () => ({
  requireCreator: vi.fn(),
}))

import { db } from '@/lib/db'
import { requireCreator } from '@/lib/middleware/require-creator'
import { GET } from './route'
import { NextRequest } from 'next/server'

const mockDb = vi.mocked(db.query)
const mockRequireCreator = vi.mocked(requireCreator)

beforeEach(() => vi.clearAllMocks())

describe('GET /api/creator/channel', () => {
  it('returns 403 when user has no channel', async () => {
    // requireCreator returns a NextResponse (error)
    const { NextResponse } = await import('next/server')
    mockRequireCreator.mockResolvedValue(
      NextResponse.json({ error: 'No creator channel found' }, { status: 403 })
    )
    const res = await GET(new NextRequest('http://localhost'))
    expect(res.status).toBe(403)
  })

  it('returns channel stats when creator', async () => {
    mockRequireCreator.mockResolvedValue({
      session: { user: { id: 'user1' } },
      channel: { id: 'chan1', name: 'Test', slug: 'test', is_superadmin_channel: false, creator_balance: 500 },
    } as any)
    mockDb.mockResolvedValueOnce({ rows: [{ sessions: 42, credits_spent: 120 }] } as any)
    mockDb.mockResolvedValueOnce({ rows: [{ count: 3 }] } as any)
    const res = await GET(new NextRequest('http://localhost'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.channel.name).toBe('Test')
    expect(body.stats.totalSessions).toBe(42)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd platform && npx vitest run app/api/creator/channel/route.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write channel route**

```typescript
// platform/app/api/creator/channel/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireCreator } from '@/lib/middleware/require-creator'
import { db } from '@/lib/db'
import { z } from 'zod'

export async function GET() {
  const result = await requireCreator()
  if (result instanceof NextResponse) return result
  const { channel } = result

  const [statsResult, appsResult] = await Promise.all([
    db.query<{ sessions: number; credits_spent: number }>(
      `SELECT COALESCE(SUM(sessions), 0)::INTEGER AS sessions,
              COALESCE(SUM(credits_spent), 0)::INTEGER AS credits_spent
       FROM analytics.app_usage au
       JOIN marketplace.apps a ON a.id = au.app_id
       WHERE a.channel_id = $1
         AND au.day >= NOW() - INTERVAL '30 days'`,
      [channel.id],
    ),
    db.query<{ count: number }>(
      `SELECT COUNT(*)::INTEGER AS count FROM marketplace.apps
       WHERE channel_id = $1 AND deleted_at IS NULL`,
      [channel.id],
    ),
  ])

  const stats = statsResult.rows[0] ?? { sessions: 0, credits_spent: 0 }
  const inrEquivalent = Math.floor(channel.creator_balance * 30)  // ₹0.30 per credit

  return NextResponse.json({
    channel: {
      ...channel,
      appsCount: appsResult.rows[0]?.count ?? 0,
    },
    stats: {
      totalSessions: stats.sessions,
      creditsEarned: channel.creator_balance,
      inrEquivalent,
    },
  })
}

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
})

export async function PATCH(request: NextRequest) {
  const result = await requireCreator()
  if (result instanceof NextResponse) return result
  const { channel } = result

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.flatten() }, { status: 400 })
  }

  const { name, description } = parsed.data
  if (name) {
    await db.query(
      `UPDATE marketplace.channels SET name = $1 WHERE id = $2`,
      [name, channel.id],
    )
  }
  if (description !== undefined) {
    await db.query(
      `UPDATE marketplace.channels SET description = $1 WHERE id = $2`,
      [description, channel.id],
    )
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Write apps route**

```typescript
// platform/app/api/creator/apps/route.ts
import { NextResponse } from 'next/server'
import { requireCreator } from '@/lib/middleware/require-creator'
import { db } from '@/lib/db'

export async function GET() {
  const result = await requireCreator()
  if (result instanceof NextResponse) return result
  const { channel } = result

  const apps = await db.query(
    `SELECT a.id, a.name, a.slug, a.status, a.is_free, a.model_tier,
            a.credits_per_session, a.created_at,
            COALESCE(SUM(au.sessions), 0)::INTEGER AS sessions_30d,
            COALESCE(SUM(au.credits_spent), 0)::INTEGER AS credits_earned_30d
     FROM marketplace.apps a
     LEFT JOIN analytics.app_usage au ON au.app_id = a.id
       AND au.day >= NOW() - INTERVAL '30 days'
     WHERE a.channel_id = $1 AND a.deleted_at IS NULL
     GROUP BY a.id
     ORDER BY a.created_at DESC`,
    [channel.id],
  )

  return NextResponse.json({ apps: apps.rows })
}
```

- [ ] **Step 5: Write app [appId] route**

```typescript
// platform/app/api/creator/apps/[appId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireCreator } from '@/lib/middleware/require-creator'
import { db } from '@/lib/db'
import { MODEL_TIER_CREDITS } from '@/lib/pricing'
import { z } from 'zod'

const MODEL_TIERS = ['standard', 'advanced', 'premium', 'image-fast', 'image-pro'] as const

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(['live', 'draft']).optional(),
  is_free: z.boolean().optional(),
  model_tier: z.enum(MODEL_TIERS).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const result = await requireCreator()
  if (result instanceof NextResponse) return result
  const { channel } = result

  const { appId } = await params

  // Verify ownership
  const appCheck = await db.query(
    `SELECT id FROM marketplace.apps WHERE id = $1 AND channel_id = $2 AND deleted_at IS NULL`,
    [appId, channel.id],
  )
  if (!appCheck.rows[0]) {
    return NextResponse.json({ error: 'App not found' }, { status: 404 })
  }

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.flatten() }, { status: 400 })
  }

  const { name, description, status, is_free, model_tier } = parsed.data

  // Build dynamic update
  const updates: string[] = []
  const values: unknown[] = []
  let idx = 1

  if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name) }
  if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description) }
  if (status !== undefined) { updates.push(`status = $${idx++}`); values.push(status) }
  if (is_free !== undefined) { updates.push(`is_free = $${idx++}`); values.push(is_free) }
  if (model_tier !== undefined) {
    updates.push(`model_tier = $${idx++}`)
    values.push(model_tier)
    updates.push(`credits_per_session = $${idx++}`)
    values.push(MODEL_TIER_CREDITS[model_tier])
  }

  if (updates.length > 0) {
    values.push(appId)
    await db.query(
      `UPDATE marketplace.apps SET ${updates.join(', ')} WHERE id = $${idx}`,
      values,
    )
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 6: Write revenue route**

```typescript
// platform/app/api/creator/revenue/route.ts
import { NextResponse } from 'next/server'
import { requireCreator } from '@/lib/middleware/require-creator'
import { db } from '@/lib/db'

export async function GET() {
  const result = await requireCreator()
  if (result instanceof NextResponse) return result
  const { channel } = result

  const history = await db.query<{
    month: string
    sessions: number
    credits_spent: number
  }>(
    `SELECT TO_CHAR(DATE_TRUNC('month', au.day), 'YYYY-MM') AS month,
            SUM(au.sessions)::INTEGER AS sessions,
            SUM(au.credits_spent)::INTEGER AS credits_spent
     FROM analytics.app_usage au
     JOIN marketplace.apps a ON a.id = au.app_id
     WHERE a.channel_id = $1
     GROUP BY DATE_TRUNC('month', au.day)
     ORDER BY month DESC
     LIMIT 12`,
    [channel.id],
  )

  const monthHistory = history.rows.map(row => ({
    month: row.month,
    sessions: row.sessions,
    creatorShare: Math.floor(row.credits_spent * 0.5),
    inrEquivalent: Math.floor(row.credits_spent * 0.5 * 30),  // ₹0.30 per credit
  }))

  return NextResponse.json({
    balance: {
      credits: channel.creator_balance,
      inrEquivalent: Math.floor(channel.creator_balance * 30),
    },
    history: monthHistory,
  })
}
```

- [ ] **Step 7: Run tests**

```bash
cd platform && npx vitest run app/api/creator/channel/route.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 8: Commit**

```bash
git add platform/app/api/creator/
git commit -m "feat(creator-api): channel stats, app management, revenue endpoints"
```

---

### Task 4: Superadmin API Routes

**Files:**
- Create: `platform/app/api/admin/stats/route.ts`
- Create: `platform/app/api/admin/users/route.ts`
- Create: `platform/app/api/admin/users/[userId]/route.ts`
- Create: `platform/app/api/admin/users/[userId]/ban/route.ts`
- Create: `platform/app/api/admin/channels/route.ts`
- Create: `platform/app/api/admin/channels/[channelId]/route.ts`

- [ ] **Step 1: Write admin stats route**

```typescript
// platform/app/api/admin/stats/route.ts
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/middleware/require-admin'
import { db } from '@/lib/db'

export async function GET() {
  const result = await requireAdmin()
  if (result instanceof NextResponse) return result

  const [users, apps, channels, credits, deployments] = await Promise.all([
    db.query<{ total: number; active30d: number; new_today: number }>(`
      SELECT
        COUNT(*)::INTEGER AS total,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END)::INTEGER AS active30d,
        COUNT(CASE WHEN DATE_TRUNC('day', created_at) = DATE_TRUNC('day', NOW()) THEN 1 END)::INTEGER AS new_today
      FROM public."user"
    `),
    db.query<{ total: number; live: number; draft: number }>(`
      SELECT
        COUNT(*)::INTEGER AS total,
        COUNT(CASE WHEN status = 'live' THEN 1 END)::INTEGER AS live,
        COUNT(CASE WHEN status = 'draft' THEN 1 END)::INTEGER AS draft
      FROM marketplace.apps WHERE deleted_at IS NULL
    `),
    db.query<{ total: number; superadmin: number }>(`
      SELECT COUNT(*)::INTEGER AS total,
             COUNT(CASE WHEN is_superadmin_channel THEN 1 END)::INTEGER AS superadmin
      FROM marketplace.channels
    `),
    db.query<{ issued_today: number; spent_today: number }>(`
      SELECT
        COALESCE(SUM(CASE WHEN delta > 0 AND DATE_TRUNC('day', created_at) = DATE_TRUNC('day', NOW()) THEN delta END), 0)::INTEGER AS issued_today,
        COALESCE(SUM(CASE WHEN delta < 0 AND DATE_TRUNC('day', created_at) = DATE_TRUNC('day', NOW()) THEN ABS(delta) END), 0)::INTEGER AS spent_today
      FROM subscriptions.credit_ledger
    `),
    db.query<{ total: number; running: number; failed: number }>(`
      SELECT
        COUNT(*)::INTEGER AS total,
        COUNT(CASE WHEN status = 'running' THEN 1 END)::INTEGER AS running,
        COUNT(CASE WHEN status = 'failed' THEN 1 END)::INTEGER AS failed
      FROM marketplace.deployments
    `),
  ])

  return NextResponse.json({
    users: users.rows[0],
    apps: apps.rows[0],
    channels: channels.rows[0],
    credits: credits.rows[0],
    deployments: deployments.rows[0],
  })
}
```

- [ ] **Step 2: Write admin users routes**

```typescript
// platform/app/api/admin/users/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/middleware/require-admin'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  const result = await requireAdmin()
  if (result instanceof NextResponse) return result

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') ?? ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '20', 10))
  const offset = (page - 1) * limit

  const users = await db.query(
    `SELECT u.id, u.email, u.name, u.role, u.credits, u.created_at,
            us.plan_id AS subscription_plan, us.status AS subscription_status,
            EXISTS(SELECT 1 FROM platform.user_bans ub WHERE ub.user_id = u.id AND ub.is_active = true) AS is_banned
     FROM public."user" u
     LEFT JOIN subscriptions.user_subscriptions us ON us.user_id = u.id AND us.status = 'active'
     WHERE ($1 = '' OR u.email ILIKE '%' || $1 || '%' OR u.name ILIKE '%' || $1 || '%')
     ORDER BY u.created_at DESC
     LIMIT $2 OFFSET $3`,
    [search, limit, offset],
  )

  const total = await db.query<{ count: number }>(
    `SELECT COUNT(*)::INTEGER AS count FROM public."user"
     WHERE ($1 = '' OR email ILIKE '%' || $1 || '%' OR name ILIKE '%' || $1 || '%')`,
    [search],
  )

  return NextResponse.json({
    users: users.rows,
    pagination: { page, limit, total: total.rows[0]?.count ?? 0 },
  })
}
```

```typescript
// platform/app/api/admin/users/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/middleware/require-admin'
import { db } from '@/lib/db'
import { grantCredits } from '@/lib/credits'
import { z } from 'zod'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const result = await requireAdmin()
  if (result instanceof NextResponse) return result
  const { userId } = await params

  const [user, ledger] = await Promise.all([
    db.query(
      `SELECT id, email, name, role, credits, created_at FROM public."user" WHERE id = $1`,
      [userId],
    ),
    db.query(
      `SELECT delta, balance_after, reason, created_at FROM subscriptions.credit_ledger
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [userId],
    ),
  ])

  if (!user.rows[0]) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  return NextResponse.json({ user: user.rows[0], ledger: ledger.rows })
}

const patchSchema = z.object({
  role: z.enum(['user', 'admin']).optional(),
  credits: z.number().int().optional(),
  reason: z.string().min(1).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const result = await requireAdmin()
  if (result instanceof NextResponse) return result
  const { session } = result
  const { userId } = await params

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.flatten() }, { status: 400 })
  }

  const { role, credits, reason } = parsed.data

  if (role) {
    await db.query(`UPDATE public."user" SET role = $1 WHERE id = $2`, [role, userId])
  }

  if (credits !== undefined) {
    if (!reason) {
      return NextResponse.json({ error: 'reason required when adjusting credits' }, { status: 400 })
    }
    await grantCredits(userId, credits, `admin_grant_${reason.replace(/\s+/g, '_')}`)
    // Audit log
    await db.query(
      `INSERT INTO platform.audit_log (actor_id, action, resource_type, resource_id, metadata)
       VALUES ($1, 'grant_credits', 'user', $2, $3)`,
      [session.user.id, userId, JSON.stringify({ credits, reason })],
    )
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Write ban routes**

```typescript
// platform/app/api/admin/users/[userId]/ban/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/middleware/require-admin'
import { db } from '@/lib/db'
import { z } from 'zod'

const banSchema = z.object({
  reason: z.string().min(1).max(500),
  durationDays: z.number().int().positive().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const result = await requireAdmin()
  if (result instanceof NextResponse) return result
  const { session } = result
  const { userId } = await params

  const parsed = banSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.flatten() }, { status: 400 })
  }
  const { reason, durationDays } = parsed.data

  const expiresAt = durationDays
    ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
    : null

  await db.query(
    `INSERT INTO platform.user_bans (user_id, reason, banned_by, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, reason, session.user.id, expiresAt],
  )

  await db.query(
    `INSERT INTO platform.audit_log (actor_id, action, resource_type, resource_id, metadata)
     VALUES ($1, 'ban_user', 'user', $2, $3)`,
    [session.user.id, userId, JSON.stringify({ reason, durationDays })],
  )

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const result = await requireAdmin()
  if (result instanceof NextResponse) return result
  const { userId } = await params

  await db.query(
    `UPDATE platform.user_bans SET is_active = false WHERE user_id = $1 AND is_active = true`,
    [userId],
  )

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Write channels admin routes**

```typescript
// platform/app/api/admin/channels/route.ts
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/middleware/require-admin'
import { db } from '@/lib/db'

export async function GET() {
  const result = await requireAdmin()
  if (result instanceof NextResponse) return result

  const channels = await db.query(
    `SELECT c.id, c.name, c.slug, c.is_superadmin_channel, c.creator_balance, c.created_at,
            u.email AS owner_email, u.name AS owner_name,
            COUNT(DISTINCT a.id)::INTEGER AS apps_count,
            EXISTS(SELECT 1 FROM platform.channel_suspensions cs WHERE cs.channel_id = c.id AND cs.is_active = true) AS is_suspended
     FROM marketplace.channels c
     JOIN public."user" u ON u.id = c.user_id
     LEFT JOIN marketplace.apps a ON a.channel_id = c.id AND a.deleted_at IS NULL
     GROUP BY c.id, u.email, u.name
     ORDER BY c.created_at DESC`,
  )

  return NextResponse.json({ channels: channels.rows })
}
```

```typescript
// platform/app/api/admin/channels/[channelId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/middleware/require-admin'
import { db } from '@/lib/db'
import { z } from 'zod'

const patchSchema = z.object({
  is_superadmin_channel: z.boolean().optional(),
  is_suspended: z.boolean().optional(),
  suspension_reason: z.string().min(1).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const result = await requireAdmin()
  if (result instanceof NextResponse) return result
  const { session } = result
  const { channelId } = await params

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.flatten() }, { status: 400 })
  }

  const { is_superadmin_channel, is_suspended, suspension_reason } = parsed.data

  if (is_superadmin_channel !== undefined) {
    await db.query(
      `UPDATE marketplace.channels SET is_superadmin_channel = $1 WHERE id = $2`,
      [is_superadmin_channel, channelId],
    )
    await db.query(
      `INSERT INTO platform.audit_log (actor_id, action, resource_type, resource_id, metadata)
       VALUES ($1, 'toggle_superadmin_channel', 'channel', $2, $3)`,
      [session.user.id, channelId, JSON.stringify({ is_superadmin_channel })],
    )
  }

  if (is_suspended !== undefined) {
    if (is_suspended) {
      if (!suspension_reason) {
        return NextResponse.json({ error: 'suspension_reason required' }, { status: 400 })
      }
      await db.query(
        `INSERT INTO platform.channel_suspensions (channel_id, reason, suspended_by)
         VALUES ($1, $2, $3)`,
        [channelId, suspension_reason, session.user.id],
      )
    } else {
      await db.query(
        `UPDATE platform.channel_suspensions SET is_active = false, lifted_at = NOW()
         WHERE channel_id = $1 AND is_active = true`,
        [channelId],
      )
    }
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 5: Commit**

```bash
git add platform/app/api/admin/
git commit -m "feat(admin-api): platform stats, user management, ban/unban, channel superadmin toggle, suspension"
```

---

### Task 5: Ban Enforcement in Auth + Gateway

**Files:**
- Modify: `platform/lib/auth.ts`
- Modify: `gateway/src/middleware/auth.ts`

- [ ] **Step 1: Add ban check to auth session validation**

In `platform/lib/auth.ts`, find the better-auth hooks or callbacks section. Add a session hook that checks for active bans:

```typescript
// Add to better-auth config
hooks: {
  after: [
    {
      matcher: (ctx) => ctx.path.startsWith('/get-session'),
      handler: async (ctx) => {
        const userId = ctx.context.session?.user?.id
        if (!userId) return

        const ban = await db.query(
          `SELECT id FROM platform.user_bans
           WHERE user_id = $1 AND is_active = true
             AND (expires_at IS NULL OR expires_at > NOW())`,
          [userId],
        )
        if (ban.rows[0]) {
          // Clear session and throw
          throw new Error('Account suspended')
        }
      },
    },
  ],
}
```

> **Note:** Check the exact better-auth hook/interceptor API for your installed version. The key is: on every session fetch, check the ban table. If banned, invalidate.

- [ ] **Step 2: Add channel suspension check in gateway**

In `gateway/src/middleware/auth.ts`, after `c.set('embedToken', payload)` and before `await next()`, add:

```typescript
// Check if app's channel is suspended
const suspension = await db.query<{ id: string }>(
  `SELECT cs.id FROM platform.channel_suspensions cs
   JOIN marketplace.apps a ON a.channel_id = cs.channel_id
   WHERE a.id = $1 AND cs.is_active = true`,
  [payload.appId],
)
if (suspension.rows[0]) {
  return c.json({ error: 'This channel has been suspended' }, 403)
}
```

- [ ] **Step 3: Commit**

```bash
git add platform/lib/auth.ts gateway/src/middleware/auth.ts
git commit -m "feat(moderation): ban check on session, channel suspension check in gateway"
```

---

### Task 6: Creator Dashboard Frontend

**Files:**
- Create: `platform/app/creator/layout.tsx`
- Create: `platform/app/creator/page.tsx`
- Create: `platform/app/creator/apps/page.tsx`
- Create: `platform/app/creator/revenue/page.tsx`

- [ ] **Step 1: Create creator layout**

```typescript
// platform/app/creator/layout.tsx
import Link from 'next/link'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

const NAV = [
  { href: '/creator', label: 'Dashboard' },
  { href: '/creator/apps', label: 'My Apps' },
  { href: '/creator/revenue', label: 'Revenue' },
  { href: '/creator/settings', label: 'Settings' },
]

export default async function CreatorLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/sign-in')

  return (
    <div className="dark flex min-h-screen bg-[--background]">
      <aside className="w-56 border-r border-[--border] flex flex-col">
        <div className="p-5 border-b border-[--border]">
          <span className="text-xs font-medium uppercase tracking-widest text-[--muted-foreground]">
            Creator
          </span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2 text-sm text-[--muted-foreground] hover:text-[--foreground] hover:bg-[--muted] rounded-[--radius-sm] transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Create creator dashboard page**

```typescript
// platform/app/creator/page.tsx
import { headers } from 'next/headers'

export default async function CreatorDashboardPage() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/creator/channel`, {
    headers: Object.fromEntries(await headers()),
    cache: 'no-store',
  })
  const data = await res.json()

  if (!data.channel) {
    return (
      <div className="text-center py-20">
        <p className="text-[--muted-foreground]">No channel found.</p>
        <a href="/creator/onboarding" className="text-[--primary] text-sm mt-2 block">
          Create your channel →
        </a>
      </div>
    )
  }

  const { channel, stats } = data

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-[--foreground] mb-1">{channel.name}</h1>
      <p className="text-sm text-[--muted-foreground] mb-8">@{channel.slug}</p>

      <div className="flex gap-8 pb-8 border-b border-[--border] mb-8">
        <div>
          <p className="text-xs uppercase tracking-widest text-[--muted-foreground] mb-1">Balance</p>
          <p className="text-3xl font-mono text-[--foreground]">{stats.creditsEarned}</p>
          <p className="text-sm text-[--muted-foreground]">≈ ₹{stats.inrEquivalent}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-[--muted-foreground] mb-1">Sessions (30d)</p>
          <p className="text-3xl font-mono text-[--foreground]">{stats.totalSessions}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-[--muted-foreground] mb-1">Active Apps</p>
          <p className="text-3xl font-mono text-[--foreground]">{channel.appsCount}</p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create apps list page**

```typescript
// platform/app/creator/apps/page.tsx
import { headers } from 'next/headers'

export default async function CreatorAppsPage() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/creator/apps`, {
    headers: Object.fromEntries(await headers()),
    cache: 'no-store',
  })
  const { apps } = await res.json()

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold text-[--foreground] mb-6">My Apps</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[--border] text-[--muted-foreground] text-xs uppercase tracking-widest">
            <th className="text-left pb-3">App</th>
            <th className="text-left pb-3">Status</th>
            <th className="text-right pb-3">Sessions (30d)</th>
            <th className="text-right pb-3">Credits Earned</th>
            <th className="text-left pb-3">Tier</th>
            <th className="text-left pb-3">Free</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[--border]">
          {apps?.map((app: {
            id: string; name: string; slug: string; status: string;
            model_tier: string; is_free: boolean;
            sessions_30d: number; credits_earned_30d: number
          }) => (
            <tr key={app.id} className="hover:bg-[--muted] transition-colors">
              <td className="py-3">
                <a href={`/creator/apps/${app.id}`} className="font-medium text-[--foreground] hover:text-[--primary]">
                  {app.name}
                </a>
              </td>
              <td className="py-3">
                <span className={`text-xs font-medium ${app.status === 'live' ? 'text-green-500' : 'text-[--muted-foreground]'}`}>
                  {app.status}
                </span>
              </td>
              <td className="py-3 text-right font-mono text-[--foreground]">{app.sessions_30d}</td>
              <td className="py-3 text-right font-mono text-[--foreground]">{app.credits_earned_30d}</td>
              <td className="py-3 text-[--muted-foreground] text-xs">{app.model_tier}</td>
              <td className="py-3 text-xs">{app.is_free ? '✓' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Create revenue page**

```typescript
// platform/app/creator/revenue/page.tsx
import { headers } from 'next/headers'

export default async function CreatorRevenuePage() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/creator/revenue`, {
    headers: Object.fromEntries(await headers()),
    cache: 'no-store',
  })
  const { balance, history } = await res.json()

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-[--foreground] mb-6">Revenue</h1>

      <div className="flex gap-8 pb-8 border-b border-[--border] mb-8">
        <div>
          <p className="text-xs uppercase tracking-widest text-[--muted-foreground] mb-1">Balance</p>
          <p className="text-3xl font-mono text-[--foreground]">{balance?.credits ?? 0}</p>
          <p className="text-sm text-[--muted-foreground]">≈ ₹{balance?.inrEquivalent ?? 0}</p>
        </div>
      </div>

      <p className="text-xs text-[--muted-foreground] mb-4 uppercase tracking-widest">Monthly History</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[--border] text-[--muted-foreground] text-xs uppercase tracking-widest">
            <th className="text-left pb-3">Month</th>
            <th className="text-right pb-3">Sessions</th>
            <th className="text-right pb-3">Creator Share (cr)</th>
            <th className="text-right pb-3">≈ INR</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[--border]">
          {history?.map((row: { month: string; sessions: number; creatorShare: number; inrEquivalent: number }) => (
            <tr key={row.month}>
              <td className="py-3 text-[--foreground]">{row.month}</td>
              <td className="py-3 text-right font-mono text-[--foreground]">{row.sessions}</td>
              <td className="py-3 text-right font-mono text-[--foreground]">{row.creatorShare}</td>
              <td className="py-3 text-right font-mono text-[--muted-foreground]">₹{row.inrEquivalent}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-xs text-[--muted-foreground] mt-6">
        Payout system coming soon. Balance accumulates and will be withdrawable in a future update.
      </p>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add platform/app/creator/
git commit -m "feat(creator-ui): dashboard, apps list, revenue page with dark theme"
```

---

### Task 7: Superadmin Dashboard Frontend (extend existing)

**Files:**
- Modify: `platform/app/admin/page.tsx`
- Modify: `platform/app/admin/users/page.tsx` (or create if missing)

- [ ] **Step 1: Update admin overview page**

In `platform/app/admin/page.tsx`, replace or add stats fetch from `/api/admin/stats`:

```typescript
// platform/app/admin/page.tsx
import { headers } from 'next/headers'

export default async function AdminPage() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/admin/stats`, {
    headers: Object.fromEntries(await headers()),
    cache: 'no-store',
  })
  const { users, apps, channels, credits, deployments } = await res.json()

  return (
    <div className="dark bg-[--background] min-h-screen p-8">
      <h1 className="text-xl font-semibold text-[--foreground] mb-8">Platform Overview</h1>

      <div className="flex gap-8 pb-8 border-b border-[--border] mb-8 flex-wrap">
        {[
          { label: 'Total Users', value: users?.total },
          { label: 'New Today', value: users?.new_today },
          { label: 'Live Apps', value: apps?.live },
          { label: 'Credits Spent Today', value: credits?.spent_today },
          { label: 'Active Deployments', value: deployments?.running },
          { label: 'Failed Deployments', value: deployments?.failed },
        ].map(stat => (
          <div key={stat.label}>
            <p className="text-xs uppercase tracking-widest text-[--muted-foreground] mb-1">{stat.label}</p>
            <p className="text-3xl font-mono text-[--foreground]">{stat.value ?? '—'}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-4">
        <a href="/admin/users" className="text-sm text-[--primary]">Manage Users →</a>
        <a href="/admin/channels" className="text-sm text-[--primary]">Manage Channels →</a>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add channel superadmin toggle to channels admin page**

Create or modify `platform/app/admin/channels/page.tsx` — renders channels list with a `is_superadmin_channel` toggle. On change, calls `PATCH /api/admin/channels/[channelId]` with `{ is_superadmin_channel: true/false }`. Mark this as `'use client'` since it has interactive toggle.

- [ ] **Step 3: Commit**

```bash
git add platform/app/admin/
git commit -m "feat(admin-ui): platform stats overview, channels superadmin toggle"
```

---

### Task 8: Creator Onboarding Flow

**Files:**
- Create: `platform/app/api/creator/onboarding/channel/route.ts`
- Create: `platform/app/creator/onboarding/page.tsx`

- [ ] **Step 1: Write onboarding API**

```typescript
// platform/app/api/creator/onboarding/channel/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().max(500).optional(),
})

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check user doesn't already have a channel
  const existing = await db.query(
    `SELECT id FROM marketplace.channels WHERE user_id = $1`,
    [session.user.id],
  )
  if (existing.rows[0]) {
    return NextResponse.json({ error: 'You already have a channel', channelId: existing.rows[0].id }, { status: 409 })
  }

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.flatten() }, { status: 400 })
  }
  const { name, slug, description } = parsed.data

  // Check slug uniqueness
  const slugCheck = await db.query(
    `SELECT id FROM marketplace.channels WHERE slug = $1`,
    [slug],
  )
  if (slugCheck.rows[0]) {
    return NextResponse.json({ error: 'Slug already taken' }, { status: 409 })
  }

  const result = await db.query<{ id: string }>(
    `INSERT INTO marketplace.channels (user_id, name, slug, description, onboarding_step)
     VALUES ($1, $2, $3, $4, 1)
     RETURNING id`,
    [session.user.id, name, slug, description ?? null],
  )

  return NextResponse.json({ channelId: result.rows[0].id }, { status: 201 })
}
```

- [ ] **Step 2: Write onboarding page (client component)**

```typescript
// platform/app/creator/onboarding/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [channelId, setChannelId] = useState('')

  function slugify(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  async function handleCreate() {
    setError('')
    const res = await fetch('/api/creator/onboarding/channel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug, description }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); return }
    setChannelId(data.channelId)
    setStep(3)
  }

  if (step === 1) {
    return (
      <div className="dark max-w-md mx-auto pt-20 px-6">
        <h1 className="text-2xl font-semibold text-[--foreground] mb-1">Create your channel</h1>
        <p className="text-[--muted-foreground] mb-8 text-sm">Your channel is where your AI apps live.</p>
        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-widest text-[--muted-foreground] mb-2">Channel Name</label>
            <input
              value={name}
              onChange={e => { setName(e.target.value); setSlug(slugify(e.target.value)) }}
              placeholder="My AI Studio"
              className="w-full px-3 py-2 border border-[--border] rounded-[--radius-sm] bg-[--muted] text-[--foreground] text-sm focus:outline-none focus:border-[--primary]"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-[--muted-foreground] mb-2">Channel Slug</label>
            <input
              value={slug}
              onChange={e => setSlug(slugify(e.target.value))}
              placeholder="my-ai-studio"
              className="w-full px-3 py-2 border border-[--border] rounded-[--radius-sm] bg-[--muted] text-[--foreground] text-sm focus:outline-none focus:border-[--primary] font-mono"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-[--muted-foreground] mb-2">Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-[--border] rounded-[--radius-sm] bg-[--muted] text-[--foreground] text-sm focus:outline-none focus:border-[--primary]"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={!name || !slug}
            className="w-full py-2 bg-[--primary] text-[--primary-foreground] rounded-[--radius-sm] text-sm font-medium disabled:opacity-50"
          >
            Create Channel
          </button>
        </div>
      </div>
    )
  }

  // Step 3: scaffold instructions
  return (
    <div className="dark max-w-lg mx-auto pt-20 px-6">
      <h1 className="text-2xl font-semibold text-[--foreground] mb-1">Deploy your first app</h1>
      <p className="text-[--muted-foreground] mb-8 text-sm">
        Use the Terminal AI MCP tool in Claude Desktop or any MCP client to scaffold and deploy your first app.
      </p>
      <div className="bg-[--muted] border border-[--border] rounded-[--radius-md] p-4 text-sm font-mono text-[--foreground] mb-6">
        <p className="text-[--muted-foreground] text-xs mb-2"># In your MCP client:</p>
        <p>scaffold_app</p>
        <p className="text-[--muted-foreground]">→ channel_id: <span className="text-[--primary]">{channelId}</span></p>
      </div>
      <button
        onClick={() => router.push('/creator')}
        className="text-sm text-[--primary]"
      >
        Go to dashboard →
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Add "Become a creator" CTA to dashboard**

In `platform/app/dashboard/page.tsx`, check if user has a channel. If not, show:
```typescript
<a href="/creator/onboarding" className="block border border-[--border] rounded-[--radius-md] p-4 mt-6 hover:border-[--primary] transition-colors">
  <p className="text-sm font-medium text-[--foreground]">Become a creator</p>
  <p className="text-xs text-[--muted-foreground] mt-1">Build and publish your own AI apps →</p>
</a>
```

- [ ] **Step 4: Commit**

```bash
git add platform/app/api/creator/onboarding/ platform/app/creator/onboarding/ platform/app/dashboard/page.tsx
git commit -m "feat(onboarding): creator channel creation wizard with scaffold instructions"
```

---

## P1 Final Checklist

- [ ] Creator sees sessions, credits, INR equivalent on dashboard
- [ ] Creator can toggle app live/draft
- [ ] Creator can mark app as free
- [ ] Creator can change model tier (updates credits_per_session automatically)
- [ ] Superadmin sees platform stats on admin page
- [ ] Superadmin can grant credits with required reason (creates audit log entry)
- [ ] Superadmin can toggle is_superadmin_channel
- [ ] Banning a user blocks their next session fetch
- [ ] Suspending a channel: gateway returns 403 on next embed-token use
- [ ] Creator onboarding: slug uniqueness validated, channelId shown in scaffold instructions

```bash
cd platform && npm test
```
