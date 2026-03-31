# P1 — Admin Systems Spec
**Date:** 2026-03-31
**Phases:** P1.1 (Channel Admin Dashboard), P1.2 (Superadmin Dashboard), P1.3 (Moderation Tools), P1.4 (Creator Onboarding Flow)
**Target:** Full admin control surface for channel owners and superadmin; creator self-serve after P1.3

---

## P1.1 — Channel Admin Dashboard

### Goals
- Channel owners can manage their apps, view analytics, see revenue
- Channel settings: name, slug, description, logo
- App management: toggle live/draft, mark as free, set model tier
- Revenue view: credits earned, INR equivalent

---

### 1. Schema Additions

```sql
-- migration 008_channel_admin.sql

-- Channel admin role (already in channels table via user_id FK)
-- No new tables needed; use existing channels.user_id

-- Per-app analytics view (materialized for performance)
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.app_usage AS
SELECT
  ac.app_id,
  DATE_TRUNC('day', ac.created_at) AS day,
  COUNT(*) AS sessions,
  SUM(ac.credits_charged) AS credits_spent,
  COUNT(DISTINCT ac.user_id) AS unique_users
FROM gateway.api_calls ac
GROUP BY ac.app_id, DATE_TRUNC('day', ac.created_at);

CREATE UNIQUE INDEX ON analytics.app_usage(app_id, day);

-- Refresh daily via cron
```

---

### 2. API Routes

All routes under `platform/app/api/creator/`:

#### `GET /api/creator/channel`
Returns channel info + stats:
```typescript
{
  channel: { id, name, slug, description, logoUrl, createdAt, isActive },
  stats: {
    appsCount: number,
    totalSessions: number,
    creditsEarned: number,
    inrEquivalent: number,  // creditsEarned * 0.30 (50% of ₹0.60)
  }
}
```

Auth: `requireCreatorRole` middleware — user must own the channel.

#### `PATCH /api/creator/channel`
Update channel name, description, logo.

#### `GET /api/creator/apps`
List apps with per-app stats (sessions last 30d, credits earned, status).

#### `PATCH /api/creator/apps/[appId]`
Update app settings:
```typescript
{
  is_free?: boolean,
  model_tier?: 'standard' | 'advanced' | 'premium' | 'image-fast' | 'image-pro',
  status?: 'live' | 'draft',
  name?: string,
  description?: string,
}
```

Validation:
- `model_tier` must be one of the valid values
- Changing `is_free` to `true` requires `channel.creator_balance > 0` (warn, don't block)
- Only channel owner can edit their own apps

#### `GET /api/creator/revenue`
Monthly revenue breakdown:
```typescript
{
  currentMonth: { sessions: number, creditsSpent: number, creatorShare: number, inrEquivalent: number },
  history: Array<{ month: string, sessions: number, creatorShare: number, inrEquivalent: number }>,
  balance: { credits: number, inrEquivalent: number },
}
```

#### `GET /api/creator/apps/[appId]/analytics`
Per-app analytics: daily sessions, unique users, top models used, credits spent.

---

### 3. Frontend

#### `platform/app/creator/` — new route group

```
app/
  creator/
    layout.tsx          — Creator sidebar layout (dark, professional)
    page.tsx            — Dashboard overview
    apps/
      page.tsx          — App list with quick stats
      [appId]/
        page.tsx        — Per-app settings + analytics
    revenue/
      page.tsx          — Revenue dashboard
    settings/
      page.tsx          — Channel settings
```

#### Creator Sidebar Nav
- Dashboard
- My Apps
- Revenue
- Settings

#### Dashboard Overview
- Total credits earned (+ INR equivalent)
- Active apps count
- Sessions this month (chart: last 30d)
- Top apps by usage

#### App Management Table
Columns: App name | Status | Sessions (30d) | Credits earned | Free? | Model tier | Actions
Actions: Edit | Toggle live/draft | Mark free

#### Revenue Page
- Monthly earnings chart
- Credits breakdown table: month | sessions | credits | INR equivalent
- Current balance with "Request payout" CTA (disabled for beta, shows "coming soon")
- Note: INR equivalent shown as informational only; actual payout mechanism is post-beta

---

### 4. Middleware

`platform/middleware/creator.ts`:
```typescript
export async function requireCreatorRole(req, session) {
  const channel = await db.query(
    `SELECT id FROM marketplace.channels WHERE user_id = $1`,
    [session.user.id]
  )
  if (!channel.rows[0]) throw new UnauthorizedError('No channel found for user')
  return channel.rows[0]
}
```

---

---

## P1.2 — Superadmin Dashboard

### Goals
- Platform-wide visibility: users, channels, apps, revenue
- Mark channels as superadmin channels
- View all deployments and their status
- Platform health: API call volume, error rates, credit flow

---

### 1. Schema Additions

```sql
-- migration 009_superadmin.sql

-- Superadmin role (use better-auth role system)
-- Already exists: public.user.role field from better-auth
-- superadmin role = 'admin' in better-auth

-- Platform-wide stats view
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.platform_stats AS
SELECT
  DATE_TRUNC('day', created_at) AS day,
  COUNT(*) AS api_calls,
  SUM(credits_charged) AS total_credits,
  COUNT(DISTINCT user_id) AS active_users,
  COUNT(DISTINCT app_id) AS active_apps,
  COUNT(CASE WHEN status = 'error' THEN 1 END) AS errors
FROM gateway.api_calls
GROUP BY DATE_TRUNC('day', created_at);
```

---

### 2. API Routes

All routes under `platform/app/api/admin/`:

#### `GET /api/admin/stats`
Platform overview:
```typescript
{
  users: { total: number, active30d: number, newToday: number },
  apps: { total: number, live: number, draft: number },
  channels: { total: number, superadmin: number },
  credits: { issuedToday: number, spentToday: number, revenue30dInr: number },
  deployments: { total: number, running: number, failed: number },
}
```

#### `GET /api/admin/users`
Paginated user list with search:
- Query params: `search`, `role`, `page`, `limit`
- Returns: id, email, name, role, credits, createdAt, lastActive, subscriptionStatus

#### `GET /api/admin/users/[userId]`
User detail: full profile + credit ledger + sessions + subscriptions

#### `PATCH /api/admin/users/[userId]`
```typescript
{
  role?: 'user' | 'admin',
  credits?: number,  // grant/adjust
  reason?: string,   // required when adjusting credits
}
```

#### `POST /api/admin/users/[userId]/ban`
```typescript
{ reason: string, durationDays?: number }  // omit duration for permanent
```

Inserts to `platform.user_bans` table. Better-auth session invalidated.

#### `GET /api/admin/channels`
Channel list with owner info, app count, total revenue, superadmin flag.

#### `PATCH /api/admin/channels/[channelId]`
```typescript
{
  is_superadmin_channel?: boolean,
  is_suspended?: boolean,
  suspension_reason?: string,
}
```

#### `GET /api/admin/apps`
All apps across all channels: status, channel, creator, usage, credits.

#### `PATCH /api/admin/apps/[appId]`
Override status: live | draft | suspended.

#### `GET /api/admin/deployments`
All deployments with logs preview, status, timestamps.

#### `GET /api/admin/revenue`
Platform revenue: gross credits issued, spent, creator payouts, net platform revenue.

---

### 3. Schema for Moderation (used in P1.3)

```sql
-- migration 010_moderation.sql

CREATE TABLE IF NOT EXISTS platform.user_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.user(id),
  reason TEXT NOT NULL,
  banned_by TEXT NOT NULL REFERENCES public.user(id),
  banned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,  -- NULL = permanent
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS platform.channel_suspensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES marketplace.channels(id),
  reason TEXT NOT NULL,
  suspended_by TEXT NOT NULL REFERENCES public.user(id),
  suspended_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lifted_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true
);
```

---

### 4. Frontend

#### `platform/app/admin/` — existing, extend

```
app/
  admin/
    layout.tsx         — Admin sidebar (dark, high-density)
    page.tsx           — Platform overview
    users/
      page.tsx         — User list + search
      [userId]/
        page.tsx       — User detail + actions
    channels/
      page.tsx         — Channel list
      [channelId]/
        page.tsx       — Channel detail + superadmin toggle
    apps/
      page.tsx         — All apps
    deployments/
      page.tsx         — Deployment log
    revenue/
      page.tsx         — Platform revenue
```

#### Key UI Components
- **Stats cards**: total users, active today, revenue this month, API calls today
- **User table**: searchable, sortable, with role badge + ban status
- **Channel table**: superadmin toggle as inline checkbox
- **Deployment feed**: live-ish (polling every 30s), color-coded by status

---

---

## P1.3 — Moderation: Ban, Block, Suspend

### Goals
- Superadmin can ban users (temporary or permanent)
- Superadmin can suspend channels
- Suspended channels: all apps go offline, creator notified
- Banned users: all sessions invalidated, login blocked

---

### 1. Ban Enforcement

#### `platform/lib/auth.ts` — ban check hook

In better-auth config, add `onSession` hook:
```typescript
onSession: async ({ user, session }) => {
  const ban = await db.query(
    `SELECT id FROM platform.user_bans
     WHERE user_id = $1 AND is_active = true
     AND (expires_at IS NULL OR expires_at > NOW())`,
    [user.id]
  )
  if (ban.rows[0]) throw new SessionError('Account suspended')
}
```

#### `platform/app/api/admin/users/[userId]/ban/route.ts`
```typescript
POST: ban user
DELETE: lift ban
GET: ban history
```

---

### 2. Channel Suspension Enforcement

#### `gateway/src/middleware/auth.ts` — check channel suspension

After token verification, before routing:
```typescript
const suspension = await db.query(
  `SELECT cs.id FROM platform.channel_suspensions cs
   JOIN marketplace.apps a ON a.channel_id = cs.channel_id
   WHERE a.id = $1 AND cs.is_active = true`,
  [payload.appId]
)
if (suspension.rows[0]) {
  return c.json({ error: 'This channel has been suspended' }, 403)
}
```

---

### 3. Email Notifications

When banning a user:
- Send email: "Your account has been suspended. Reason: {reason}. Contact support@terminalai.app to appeal."

When suspending a channel:
- Send email to channel owner: "Your channel has been suspended. Reason: {reason}. Contact support@terminalai.app."

Use existing email provider (better-auth email config or Resend — check current setup).

---

---

## P1.4 — Creator Onboarding Flow

### Goals
- New channel creation for users who want to be creators
- Guided flow: channel name → logo → first app deployment
- Linked from dashboard: "Create your own AI app →"

Note: Deferred from P0 because the user will be the sole creator during beta. Implement before wider creator access.

---

### 1. Schema Additions

```sql
-- migration 011_creator_onboarding.sql

-- Onboarding state tracking
ALTER TABLE marketplace.channels
  ADD COLUMN IF NOT EXISTS onboarding_step INTEGER NOT NULL DEFAULT 0,
  -- 0: channel created, 1: profile set, 2: first app deployed
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
```

---

### 2. API Routes

#### `POST /api/creator/onboarding/channel`
Create a new channel for the logged-in user:
```typescript
{ name: string, slug: string, description?: string }
```
- Validate slug uniqueness
- Creates `marketplace.channels` record with `user_id = session.user.id`
- Returns channel ID and redirect URL

#### `POST /api/creator/onboarding/profile`
Set channel logo + description:
```typescript
{ logoUrl?: string, description: string }
```

#### `GET /api/creator/onboarding/status`
Current onboarding step + what's next.

---

### 3. Frontend

#### `platform/app/creator/onboarding/` — new route

3-step wizard:
1. **Create channel**: name, slug (auto-generated from name, editable), description
2. **Set up profile**: logo upload, public description
3. **Deploy first app**: links to MCP tool (`scaffold_app`) with instructions

Step 3 shows:
> "Open Claude Desktop or any MCP client. Run the `scaffold_app` tool with your channel ID: `{channelId}`. Follow the prompts to deploy your first app."

#### `platform/app/dashboard/page.tsx` — creator CTA
- If user has no channel: show "Become a creator" card
- Links to `/creator/onboarding`

---

## Dependencies

```
P1.1 requires P0.1 (creator_balance column)
P1.2 requires P0.1 (subscription tables)
P1.3 requires P1.2 (admin UI to trigger bans)
P1.4 is independent, can run after P1.1
```

## Acceptance Criteria

### P1.1
- [ ] Creator can view their channel's revenue in credits and INR equivalent
- [ ] Creator can toggle app live/draft
- [ ] Creator can mark app as free (charges their creator_balance)
- [ ] Creator can change model tier per app
- [ ] Analytics: sessions per day chart, last 30d

### P1.2
- [ ] Superadmin sees platform-wide stats
- [ ] Superadmin can search and view any user
- [ ] Superadmin can grant/adjust credits with required reason
- [ ] Superadmin can toggle `is_superadmin_channel` on channels
- [ ] Superadmin can override any app's status

### P1.3
- [ ] Banning a user blocks their login and invalidates sessions
- [ ] Temporary ban auto-lifts after expiry
- [ ] Suspending a channel blocks all its apps at gateway
- [ ] Ban/suspension emails are sent

### P1.4
- [ ] User can create a channel from dashboard
- [ ] Onboarding wizard reaches step 3 (scaffold instructions)
- [ ] Channel slug is validated for uniqueness
