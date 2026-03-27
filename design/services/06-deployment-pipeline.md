# Terminal AI — Deployment Pipeline Service

**Version:** 1.0
**Date:** 2026-03-27

---

## 1. Responsibilities

The Deployment Manager service handles the full lifecycle of creator apps on VPS 2 (Coolify). It is the only service that communicates with Coolify's API.

- Receives GitHub webhook events (push to configured branch)
- Runs pre-deploy security checks (Gitleaks, framework detection)
- Triggers Coolify builds with injected environment variables
- Manages app lifecycle (start, stop, rollback, health checks)
- Handles secret rotation without full redeployment
- Streams build logs to creator dashboard via SSE
- Configures subdomains and SSL via Coolify API
- Monitors app health every 60 seconds
- Enforces Terminal AI gateway pattern in creator apps

**Tech stack:** Fastify on Node.js
**Port:** 3002 (internal only — never exposed to internet directly)
**Communicates with VPS 2:** via Hetzner private network

---

## 2. Supported Frameworks

```
Detection logic (in priority order):

1. package.json exists AND "next" in dependencies
   → Framework: nextjs
   → Runtime: Node.js 20
   → Build: npm run build
   → Start: npm run start
   → Port: 3000

2. requirements.txt exists AND "streamlit" in contents
   → Framework: streamlit
   → Runtime: Python 3.12
   → Build: pip install -r requirements.txt
   → Start: streamlit run app.py --server.port 8501
   → Port: 8501

3. requirements.txt exists (no streamlit)
   → Framework: python (FastAPI/Flask assumed)
   → Runtime: Python 3.12
   → Build: pip install -r requirements.txt
   → Start: uvicorn main:app --host 0.0.0.0 --port 8000
   → Port: 8000 (or auto-detected from Procfile)

4. index.html exists, no package.json, no requirements.txt
   → Framework: static
   → Runtime: nginx:alpine
   → Build: none
   → Start: nginx
   → Port: 80

5. None of the above → creator must select manually
```

---

## 3. Pre-Deploy Security Checks

Runs before every Coolify build trigger. Blocking failures prevent deployment.

### Gitleaks Secret Scan
```
Tool: gitleaks (runs as ephemeral Docker container, exits after scan)
Command: gitleaks detect --source=/repo --no-git --exit-code 1

Scans for: AWS keys, Anthropic API keys, OpenAI keys, GitHub tokens,
           private keys, connection strings, JWT secrets, etc.

On secret found:
  → Deployment blocked
  → Deploy log: "Secret detected at {file}:{line} — remove before deploying"
  → Creator notified via in-app notification
  → Suggested action: rotate the key immediately, remove from code

On pass: proceed to next check
```

### Gateway Pattern Validation
```
For Next.js and Python apps:
  Scan for direct external AI API calls that bypass our gateway:
    Patterns flagged: OPENAI_API_KEY, ANTHROPIC_API_KEY, client.chat.completions.create
                      anthropic.messages.create, groq.chat.completions.create
                      requests.post("https://api.openai.com"), etc.

  Platform-provided env vars are injected automatically:
    TERMINAL_AI_GATEWAY_URL = https://api.terminalai.app
    TERMINAL_AI_APP_ID      = {app_id}
    TERMINAL_AI_TOKEN       = {rotated_service_token}

  Docs injected into Coolify build (as README notice):
    Creator apps must use TERMINAL_AI_GATEWAY_URL as base URL for all AI calls.
    The MCP server provides SDK snippets for Python and JavaScript.

On direct API key found: warning (not blocking in v1, blocking in v2)
```

### Health Check Endpoint Validation
```
For non-static frameworks:
  Check repo for health endpoint:
    Next.js: GET /api/health must exist in app/api/health/route.ts
    Python:  GET /health must return 200
  On missing: warning shown to creator (deployment proceeds but no health monitoring)
```

---

## 4. Deployment Flow

```
[Creator clicks Deploy App] OR [GitHub push to tracked branch]
        │
        ▼
[Deploy Job created in BullMQ queue]
  priority: creator-triggered > webhook-triggered
        │
        ▼
[Pre-deploy checks] (see Section 3)
  Any blocking failure → mark deployment failed, notify creator
        │
        ▼
[Secrets preparation]
  Decrypt env_secrets_enc (AES-256-GCM) from deployments table
  Merge with system-injected vars:
    TERMINAL_AI_GATEWAY_URL, TERMINAL_AI_APP_ID, TERMINAL_AI_TOKEN
  Build vars object (never logged, never stored decrypted)
        │
        ▼
[Coolify API: create/update app]
  POST https://vps2-private-ip/api/v1/applications
  Body: {
    name: app-slug,
    gitRepository: github_repo,
    gitBranch: github_branch,
    buildPack: detected_framework,
    fqdn: app-slug.apps.terminalai.app,
    environmentVariables: [...encrypted secrets passed as Coolify env vars],
    healthCheckPath: /health,
    healthCheckInterval: 60
  }
        │
        ▼
[Coolify build starts → streams logs via Coolify webhook → SSE to creator]
  Build log events received → stored in deploy_logs → streamed to creator browser
        │
        ├── Build failed
        │     Mark deployment.status = 'failed'
        │     Creator notified: notification + email with log excerpt
        │
        └── Build succeeded → container started
              Coolify reports: healthy
              Update: deployments.status = 'live', deployments.health_status = 'healthy'
              Update: app_versions (new version record, is_live = true)
              Submit for admin review (if first deploy of app)
              Notify creator: "App deployed successfully"
```

---

## 5. Blue-Green Deployments

For app updates (not first deploys):

```
Current state: version N is live → app-slug.apps.terminalai.app

Deploy update:
  1. Coolify builds new container (version N+1) in parallel
  2. Health check passes on N+1
  3. Creator dashboard shows: "Staged: v1.5 ready — [Switch Traffic] [Discard]"
  4. Creator clicks [Switch Traffic]:
       Coolify updates routing: v1.5 now receives all traffic
       v1.4 container kept running for 24h (instant rollback available)
  5. After 24h: v1.4 container stopped and removed

Rollback:
  Creator clicks [Rollback to v1.4]:
    Coolify routing switched back to v1.4 immediately
    v1.5 container stopped
    deploy_logs entry: 'rolled back from v1.5 to v1.4'
    Creator notified of rollback completion

Auto-switch mode (creator opt-in):
  Skip manual approval step
  Auto-switch when health check passes on new version
  Still keeps previous version for 24h rollback window
```

---

## 6. Health Monitoring

```
BullMQ repeatable job: every 60 seconds per live app

  GET https://app-slug.apps.terminalai.app/health
  (timeout: 5s)

  Response 200 → status = 'healthy', no action
  Timeout/error → consecutive_failures++

  consecutive_failures = 1: warning logged, no action
  consecutive_failures = 3: status = 'unhealthy'
                             Creator notified (in-app + email)
                             Admin notified (Telegram)
  consecutive_failures = 10: auto-restart attempt via Coolify API
                              If restart fails: app suspended, status page updated

  Recovery: next successful health check → status = 'healthy', consecutive_failures = 0
```

---

## 7. Secret Rotation

```
PATCH /apps/{appId}/secrets
Body: { key: 'NEW_API_KEY', value: 'new-value' }
Auth: creator session token (platform BFF proxies to deploy-manager)

  1. Fetch current env_secrets_enc
  2. Decrypt, update specific key, re-encrypt
  3. Save new env_secrets_enc to deployments table
  4. Call Coolify API: update env var for running app
     POST /api/v1/applications/{coolifyAppId}/envs
     { key, value, is_preview: false }
  5. Coolify performs rolling restart (zero-downtime):
     - New container started with updated secret
     - Health check passes
     - Old container stopped
  6. Log rotation event to audit.log (key name only, never value)
  7. Return: { status: 'rotated', restartedAt }

New TERMINAL_AI_TOKEN rotation (platform-managed):
  Scheduled: every 30 days automatically
  deploy-manager generates new token → updates Coolify → logs rotation
```

---

## 8. GitHub Integration

```
OAuth flow:
  Creator clicks [Connect GitHub] on deployment setup page
  Platform BFF redirects to GitHub OAuth (scope: repo, read:org)
  GitHub redirects back with code
  Platform exchanges code for access_token
  Token stored encrypted in deployments.github_connections

Webhook setup:
  On first app deployment:
    GitHub API: create webhook on selected repo
    Webhook URL: https://terminalai.app/api/webhooks/github/{deploymentId}
    Secret: HMAC secret (generated per deployment, stored encrypted)
    Events: push

Webhook received:
  POST /api/webhooks/github/{deploymentId}
    1. Verify HMAC signature (X-Hub-Signature-256)
    2. Check: push to tracked branch?
    3. Enqueue BullMQ deploy job
    4. Return 200 immediately (GitHub expects fast response)

Auto-deploy policy (creator-configured):
  ○ Auto-deploy all pushes to main (default)
  ○ Deploy only when tag pushed (e.g., v*)
  ○ Manual deploy only (disable webhook)
```

---

## 9. MCP Server Integration

The MCP server calls the deploy-manager for app scaffolding and status checks. See `08-mcp-server.md` for MCP tool definitions.

```
deploy-manager endpoints called by MCP:
  GET  /apps/{appId}/status       → current deployment status + health
  GET  /apps/{appId}/logs         → recent build logs
  POST /apps/{appId}/deploy       → trigger manual deploy
  POST /apps/validate-gateway     → check if repo uses Terminal AI gateway correctly
  GET  /frameworks/requirements   → returns required file structure per framework
```
