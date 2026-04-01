# Pending Testing

## P1 Admin Systems (2026-04-02)

### Creator Flow (logged in as creator/admin)
- [ ] `/creator` — updated sidebar shows Apps, Revenue, Settings, Developer API tabs
- [ ] `/creator/apps` — apps table with status, sessions (30d), credits earned, tier, free flag
- [ ] `/creator/revenue` — balance card (credits + INR) + monthly history table
- [ ] `/creator/settings` — channel name, slug, superadmin status display
- [ ] `/creator/onboarding` — create channel wizard (name, slug, description) → MCP scaffold instructions

### Admin Flow (logged in as admin)
- [ ] `/admin/channels` — channels table with owner, apps count, balance
- [ ] `/admin/channels` — superadmin toggle pill works (click to toggle)
- [ ] `/admin/channels` — suspend/unsuspend button works, status badge updates
- [ ] `/admin/users` — user list with search, pagination, ban status
- [ ] `/admin/users/[userId]` — user detail with credit ledger
- [ ] `/admin/users/[userId]` — grant credits with reason (audit log created)
- [ ] `/admin/users/[userId]` — ban/unban user

### Ban Enforcement
- [ ] Banned user cannot create new sessions (better-auth databaseHooks blocks it)
- [ ] Suspended channel's apps return 403 from gateway embed-token auth

### APIs (curl or Postman)
- [ ] `GET /api/admin/stats` — returns users, apps, channels, credits, deployments stats
- [ ] `GET /api/creator/channel` — returns channel info + 30d stats
- [ ] `GET /api/creator/apps` — returns apps with 30d usage
- [ ] `PATCH /api/creator/apps/[appId]` — update status/tier/free flag
- [ ] `GET /api/creator/revenue` — balance + 12-month history
- [ ] `POST /api/creator/onboarding/channel` — creates channel with slug validation
- [ ] `GET /api/admin/users?search=&page=1` — paginated user search
- [ ] `GET /api/admin/users/[userId]` — user detail + ledger
- [ ] `PATCH /api/admin/users/[userId]` — role change, credit grant with audit
- [ ] `POST /api/admin/users/[userId]/ban` — ban with optional duration
- [ ] `DELETE /api/admin/users/[userId]/ban` — unban
- [ ] `GET /api/admin/channels` — all channels with suspension status
- [ ] `PATCH /api/admin/channels/[channelId]` — toggle superadmin, suspend/unsuspend

### Post-Deploy Tasks
- [ ] Refresh materialized views after deploy:
  ```bash
  docker exec $(docker ps -qf "name=postgres") psql -U postgres -d terminalai \
    -c "REFRESH MATERIALIZED VIEW analytics.app_usage; REFRESH MATERIALIZED VIEW analytics.platform_stats;"
  ```
- [ ] Set up cron job for materialized view refresh (every 15 minutes recommended)

---

## P2 Deployment Pipeline (2026-04-02)

### Migration
- [ ] Migration 014 applied: `deployment_events` table exists
- [ ] `deployments.deployments` has new columns: `log_lines`, `retry_count`, `started_at`, `error_code`, `resource_class`

### Deploy-Manager Endpoints
- [ ] `GET /deployments/:id/logs` — returns `{ deployment, events }` with structured event list
- [ ] `GET /deployments/:id/logs/stream` — returns SSE stream of deployment events
- [ ] `POST /deploy` — uses retry/backoff (3 attempts, exponential 10s/20s/40s)
- [ ] `POST /deployments/:id/retry` — re-queues failed deployment with JOB_OPTIONS

### Event Emission (trigger a deploy and verify events are recorded)
- [ ] `queued` event emitted when worker picks up job
- [ ] `preflight_start` / `preflight_ok` events emitted during gateway check
- [ ] `creating_app` event emitted before Coolify app creation
- [ ] `build_start` / `build_running` / `build_ok` events emitted during build
- [ ] `health_check_start` / `health_check_ok` events emitted during health check
- [ ] `deployed` event emitted on success with final URL
- [ ] `failed` event emitted on failure with error_code

### Resource Limits
- [ ] Coolify app created with `limits_memory: 512m` and `limits_cpus: 0.5` (micro class)

### Platform API Routes
- [ ] `GET /api/creator/apps/[appId]/deployments` — returns deployment list (requires auth + ownership)
- [ ] `GET /api/creator/deployments/[deploymentId]` — proxies to deploy-manager logs endpoint
- [ ] `GET /api/creator/deployments/[deploymentId]/events` — proxies SSE stream
- [ ] `POST /api/creator/apps/[appId]/redeploy` — triggers redeploy (requires auth + ownership)

### Creator Deployment List Page
- [ ] `/creator/apps/[appId]/deployments` — shows deployment table
- [ ] Table has columns: Status (with color dot), Started, Duration, Retries, Actions
- [ ] Building deployments show amber pulsing dot
- [ ] Live deployments show green dot
- [ ] Failed deployments show red dot + error code
- [ ] "View logs" link navigates to deployment detail

### Creator Deployment Detail Page
- [ ] `/creator/apps/[appId]/deployments/[id]` — shows deployment detail
- [ ] Status header shows deployment ID and current status with color
- [ ] Failed deployments show error card with error code + human-readable message
- [ ] Failed deployments show "Redeploy →" button that triggers `/api/creator/apps/[appId]/redeploy`
- [ ] Event timeline shows all deployment events with icons and timestamps
- [ ] In-progress deployments stream events live via SSE (events appear in real-time)
- [ ] "Processing…" pulse indicator shown while deployment is in progress
- [ ] Stream closes when deployment reaches terminal state (live/failed)

### Viewer Deploying State
- [ ] Deploying state shows animated progress bar
- [ ] Step text progresses: Queuing → Cloning → Building → Starting → Almost ready
- [ ] Steps advance every ~25 seconds
- [ ] "Usually 2–5 minutes" subtitle shown

### Error Handling
- [ ] `PREFLIGHT_FAILED` — shows human-readable message about GATEWAY_URL
- [ ] `BUILD_FAILED` — shows message about Dockerfile/build command
- [ ] `HEALTH_CHECK_FAILED` — shows message about health check timeout
- [ ] `GATEWAY_UNREACHABLE` — shows platform issue message
- [ ] `COOLIFY_ERROR` — shows Coolify API error message
- [ ] `TIMEOUT` — shows 5-minute timeout message
- [ ] `SECRETS_DETECTED` — shows message about removing credentials
