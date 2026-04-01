# P2 — Deployment Pipeline Spec
**Date:** 2026-03-31
**Phases:** P2 (Pipeline Hardening), P2.5 (Deployment Management UX)
**Target:** Reliable, observable deployments with a Vercel/Railway-class management experience

---

## P2 — Deployment Pipeline Hardening

### Goals
- Zero "silent failure" deployments — every failure has a clear cause and message
- Deployment logs streamed to platform DB in real-time
- Retry with exponential backoff for transient Coolify errors
- App deletion is clean: undeploy from Coolify, remove DNS, clean DB
- Resource limits enforced per deployment
- Deployment status is accurate at all times

---

### 1. Schema Additions

```sql
-- migration 012_deployments_v2.sql

-- Extend deployments table (from migration 005)
ALTER TABLE marketplace.deployments
  ADD COLUMN IF NOT EXISTS log_lines JSONB[] NOT NULL DEFAULT '{}',
  -- Each element: { ts: ISO, level: 'info'|'warn'|'error', msg: string }
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coolify_app_uuid TEXT,
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  -- error_code values: PREFLIGHT_FAILED, BUILD_FAILED, HEALTH_CHECK_FAILED,
  --                    GATEWAY_UNREACHABLE, COOLIFY_ERROR, TIMEOUT
  ADD COLUMN IF NOT EXISTS resource_class TEXT NOT NULL DEFAULT 'micro';
  -- resource_class: micro (512MB RAM, 0.5 CPU), small (1GB, 1 CPU), medium (2GB, 2 CPU)

-- Deployment events timeline
CREATE TABLE IF NOT EXISTS marketplace.deployment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID NOT NULL REFERENCES marketplace.deployments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  -- event_types: queued, preflight_start, preflight_ok, preflight_failed,
  --              build_start, build_ok, build_failed,
  --              health_check_start, health_check_ok, health_check_failed,
  --              deployed, failed, retrying, cancelled
  message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON marketplace.deployment_events(deployment_id, created_at);
```

---

### 2. Deploy-Manager Changes

#### 2a. `deploy-manager/src/queue/deploy-queue.ts` — full hardening

##### Job lifecycle with events

```typescript
type DeploymentStep =
  | 'queued'
  | 'preflight'
  | 'creating_app'
  | 'setting_env'
  | 'triggering_build'
  | 'waiting_for_build'
  | 'health_check'
  | 'deployed'
  | 'failed'

async function emitEvent(deploymentId: string, type: string, message: string, metadata?: object) {
  await db.query(
    `INSERT INTO marketplace.deployment_events (deployment_id, event_type, message, metadata)
     VALUES ($1, $2, $3, $4)`,
    [deploymentId, type, message, metadata ? JSON.stringify(metadata) : null]
  )
  // Also update deployments.log_lines for quick access
  await db.query(
    `UPDATE marketplace.deployments
     SET log_lines = log_lines || $2::jsonb
     WHERE id = $1`,
    [deploymentId, JSON.stringify({ ts: new Date().toISOString(), level: 'info', msg: message })]
  )
}
```

##### Retry policy

```typescript
const JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 10_000,  // 10s, 20s, 40s
  },
  removeOnComplete: false,
  removeOnFail: false,
}
```

##### Full job flow

```
1. emitEvent('queued')
2. preflightCheck() → emitEvent('preflight_ok') or throw PREFLIGHT_FAILED
3. coolify.createApp() → store coolify_app_uuid
4. coolify.setEnvVars() × N
5. coolify.deployApplication()
6. emitEvent('triggering_build')
7. Poll Coolify status every 10s (max 5 min):
   - running → emitEvent('build_running', `Build running... ${elapsed}s`)
   - failed  → throw BUILD_FAILED with Coolify error
8. Fetch app URL from Coolify
9. Poll GET {appUrl}/health every 10s (max 2 min):
   - 200 → emitEvent('health_check_ok') → emitEvent('deployed')
   - timeout → throw HEALTH_CHECK_FAILED
10. Update deployment status='success', completed_at=NOW()
```

##### Error classification

```typescript
const ERROR_MESSAGES: Record<string, string> = {
  PREFLIGHT_FAILED: 'Pre-deployment checks failed. Check GATEWAY_URL configuration.',
  BUILD_FAILED: 'Application build failed. Check your Dockerfile or build command.',
  HEALTH_CHECK_FAILED: 'App deployed but did not pass health check within 2 minutes.',
  GATEWAY_UNREACHABLE: 'Terminal AI gateway is unreachable. Platform issue.',
  COOLIFY_ERROR: 'Coolify API returned an error. See logs for details.',
  TIMEOUT: 'Deployment timed out after 5 minutes.',
}
```

---

#### 2b. `deploy-manager/src/services/coolify.ts` — improvements

##### Resource limits per class

```typescript
const RESOURCE_LIMITS = {
  micro:  { memory: '512m', cpus: '0.5' },
  small:  { memory: '1g',   cpus: '1.0' },
  medium: { memory: '2g',   cpus: '2.0' },
}

async function createApp(params: CreateAppParams) {
  const limits = RESOURCE_LIMITS[params.resourceClass ?? 'micro']
  return await coolifyApi.post('/applications', {
    ...params,
    limits_memory: limits.memory,
    limits_cpus: limits.cpus,
  })
}
```

##### Robust status polling

```typescript
async function waitForDeployment(appUuid: string, maxWaitMs = 300_000): Promise<'success' | 'failed'> {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    const status = await coolifyApi.get(`/applications/${appUuid}`)
    if (status.data.status === 'running') return 'success'
    if (status.data.status === 'stopped' || status.data.status === 'exited') return 'failed'
    await sleep(10_000)
  }
  throw new Error('TIMEOUT')
}
```

##### App deletion

```typescript
async function deleteApp(coolifyAppUuid: string): Promise<void> {
  // 1. Stop the app
  await coolifyApi.post(`/applications/${coolifyAppUuid}/stop`)
  // 2. Delete from Coolify
  await coolifyApi.delete(`/applications/${coolifyAppUuid}`)
}
```

---

#### 2c. `deploy-manager/src/routes/apps.ts` — DELETE endpoint

```
DELETE /apps/:appId
```

Steps:
1. Verify ownership (check apps table + auth header)
2. Get `coolify_app_uuid` from deployment record
3. Call `coolify.deleteApp(coolifyAppUuid)`
4. Soft-delete in `marketplace.apps` (`deleted_at = NOW()`)
5. Emit `deployment_events` entry: `app_deleted`

---

#### 2d. `deploy-manager/src/routes/deployments.ts` — log streaming

```
GET /deployments/:id/logs
```

Returns deployment event timeline:
```json
{
  "deployment": { "id": "...", "status": "...", "error_code": null },
  "events": [
    { "ts": "2026-03-31T10:00:00Z", "type": "queued", "message": "Deployment queued" },
    { "ts": "2026-03-31T10:00:01Z", "type": "preflight_ok", "message": "All checks passed" },
    ...
  ]
}
```

SSE variant:
```
GET /deployments/:id/logs/stream
Accept: text/event-stream
```

Polls `deployment_events` every 2s, emits new events as SSE until `deployed` or `failed`.

---

### 3. MCP Server Changes

#### `mcp-server/src/tools/get_deployment_logs.ts`

Update to return structured events from `deployment_events` table, not just raw log text.
Include `error_code` and human-readable error message from `ERROR_MESSAGES`.

---

---

## P2.5 — Deployment Management UX

### Goals
- Deployment page that feels like Vercel's deployment view
- Real-time log streaming to browser
- Clear status indicators: building, live, failed
- One-click redeploy
- App deletion with confirmation

---

### 1. Frontend

#### `platform/app/creator/apps/[appId]/deployments/` — new route

##### Deployment list page

Table columns: Version | Status | Started | Duration | Trigger | Actions
Actions: View logs | Redeploy | (if failed) Retry

Status badges:
- `queued` → gray dot
- `building` → amber pulsing dot
- `deployed` → green dot
- `failed` → red dot

##### Deployment detail page (`/deployments/[deploymentId]`)

Top section:
- App name + deployment ID
- Status badge (large)
- Started at, duration, commit SHA (if available)

Log timeline (main content):
- Ordered list of `deployment_events`
- Each event: timestamp | icon | message
- Error events: red background, `error_code` badge, human-readable explanation

If `status = 'building'`:
- Auto-refresh events every 3s via polling
- Show "Building..." skeleton

If `status = 'failed'`:
- Show error explanation card
- "Redeploy" button

##### Redeploy action

`POST /api/creator/apps/[appId]/redeploy`
- Queues a new deployment job in BullMQ
- Redirects to new deployment detail page

---

### 2. API Routes

#### `POST /api/creator/apps/[appId]/redeploy`
Creates new deployment record, enqueues BullMQ job.
Returns: `{ deploymentId: string }`

#### `GET /api/creator/apps/[appId]/deployments`
List all deployments for an app, sorted by `started_at DESC`.

#### `GET /api/creator/deployments/[deploymentId]`
Deployment detail + events.

#### `GET /api/creator/deployments/[deploymentId]/events`
SSE endpoint: stream events for in-progress deployments.
Closes stream when `deployed` or `failed` event received.

#### `DELETE /api/creator/apps/[appId]`
Proxies to deploy-manager `DELETE /apps/:appId`.
Requires confirmation token in body: `{ confirm: 'DELETE' }`.

---

### 3. Viewer Changes

#### `platform/app/viewer/[channelSlug]/[appSlug]/viewer-shell.tsx`

When app is mid-deployment:
- Show "Deploying…" state with animated progress bar
- Poll `GET /api/app-status/[appId]` every 5s
- When status → `live`: reload iframe

When app deployment has failed:
- Show error state: "This app failed to deploy. The creator has been notified."
- Do not show retry (user can't fix this)

---

---

## P2.6 — App Versioning and Rollback

### Goals
- Creators can push updates to live apps without downtime
- Rollback to previous version if update breaks the app
- Version history visible in deployment log

### Design

Each deployment is inherently a version. The key additions:

1. **Version label**: Auto-increment `v1`, `v2`, etc. per app (derived from deployment count)
2. **Rollback action**: `POST /api/creator/apps/[appId]/rollback` — finds the previous successful deployment, triggers Coolify redeploy from that commit
3. **UI**: On deployment detail page, if the current live deployment is not the latest, show "This is a rollback deployment" badge

### Schema

```sql
-- No new tables. Use existing deployments.deployments.
-- Add version number column:
ALTER TABLE deployments.deployments
  ADD COLUMN IF NOT EXISTS version_number INTEGER;
```

Version number auto-assigned by the platform on deploy:
```sql
UPDATE deployments.deployments SET version_number = (
  SELECT COALESCE(MAX(version_number), 0) + 1
  FROM deployments.deployments WHERE app_id = NEW.app_id
) WHERE id = NEW.id;
```

### API

#### `POST /api/creator/apps/[appId]/rollback`
1. Find the current live deployment
2. Find the previous deployment with `status = 'live'`
3. Trigger redeploy using previous deployment's git commit/branch
4. Return new deployment ID

---

## P2.7 — App Archive and Unpublish

### Goals
- Creators can archive apps (hidden from marketplace, restorable)
- Creators can permanently delete apps (Coolify cleanup + soft delete)

### API

#### `POST /api/creator/apps/[appId]/archive`
Sets `status = 'archived'` on the app. Archived apps are hidden from marketplace queries but remain in creator dashboard.

#### `POST /api/creator/apps/[appId]/restore`
Sets `status = 'draft'` — creator must explicitly re-publish.

### Frontend
- Archive button on app detail page with confirmation dialog
- Archived apps shown in creator dashboard with "Archived" badge and "Restore" action

---

## P2.8 — Gap Analysis Items (Deferred)

| Gap | Description | Deferred Reason |
|-----|-------------|-----------------|
| Creator #3: Staging/preview before live | Preview environment before publishing | Significant infra; use draft status + creator testing for beta |
| Creator #9: Deploy notifications | Email/push on build success/fail | Defer to P1.5 notification system |
| Creator #10: MCP/API error handling | Better error messages for MCP tool failures | Low priority; improve iteratively |

---

## Dependencies

```
P2 requires P0.2 (preflight changes already in P0.2 are extended here)
P2.5 requires P2 (deployment events table must exist)
P2.5 requires P1.1 (creator dashboard context)
P2.6 requires P2.5 (deployment detail page)
P2.7 is independent, can run after P1.1
```

## Acceptance Criteria

### P2
- [ ] Deployment failure always has an `error_code` and human-readable message
- [ ] `deployment_events` table records every step
- [ ] Failed build after 2 retries → `failed` status with `BUILD_FAILED` error code
- [ ] Health check timeout → `HEALTH_CHECK_FAILED` error code
- [ ] App deletion removes from Coolify and soft-deletes in DB
- [ ] Resource limits applied: micro apps capped at 512MB RAM, 0.5 CPU

### P2.5
- [ ] Deployment log page shows ordered event timeline
- [ ] In-progress deployment: events appear in real-time (≤5s delay)
- [ ] Failed deployment: shows error code + explanation card
- [ ] Redeploy button creates new deployment and redirects to its log page
- [ ] Delete app: requires typing confirmation, removes from Coolify
- [ ] Viewer shows "Deploying..." state for apps in-flight

### P2.6
- [ ] Rollback triggers redeploy from previous successful deployment
- [ ] Version numbers auto-increment per app
- [ ] Rollback visible in deployment history

### P2.7
- [ ] Archive hides app from marketplace
- [ ] Restore sets app to draft
- [ ] Delete removes from Coolify and soft-deletes in DB
