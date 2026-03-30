# MCP retry_deployment Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `retry_deployment` MCP tool so AI coding agents can retry a failed app deployment without creating a new app.

**Architecture:** The MCP server queries the DB to find the latest failed deployment for a given `app_id` (verifying creator ownership), then calls the existing `POST /deployments/:id/retry` endpoint on deploy-manager. The `DEPLOY_MANAGER_URL` env var is added to the mcp-server service in docker-compose.

**Tech Stack:** TypeScript, BullMQ (via deploy-manager), PostgreSQL, Hono (deploy-manager), `@modelcontextprotocol/sdk`

---

## File Structure

| File | Change |
|------|--------|
| `mcp-server/src/index.ts` | Add `retry_deployment` tool (one new `server.tool(...)` block) |
| `docker-compose.yml` | Add `DEPLOY_MANAGER_URL` env var to the `mcp-server` service |

---

### Task 1: Add DEPLOY_MANAGER_URL to mcp-server in docker-compose

**Files:**
- Modify: `docker-compose.yml` (mcp-server environment block, around line 209–212)

**Context:**
The mcp-server service currently has no reference to deploy-manager. The deploy-manager runs on port 3002 and is reachable at `http://deploy-manager:3002` within the `internal` Docker network. The mcp-server is already on that network.

- [ ] **Step 1: Add the env var**

In `docker-compose.yml`, find the `mcp-server` environment block:

```yaml
  mcp-server:
    ...
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/terminalai
      INTERNAL_SERVICE_TOKEN: ${INTERNAL_SERVICE_TOKEN}
      PORT: '3003'
```

Add one line so it becomes:

```yaml
  mcp-server:
    ...
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/terminalai
      INTERNAL_SERVICE_TOKEN: ${INTERNAL_SERVICE_TOKEN}
      DEPLOY_MANAGER_URL: http://deploy-manager:3002
      PORT: '3003'
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "chore(mcp-server): add DEPLOY_MANAGER_URL env var"
```

---

### Task 2: Add the retry_deployment MCP tool

**Files:**
- Modify: `mcp-server/src/index.ts` (add one `server.tool(...)` block after the `deploy_app` tool, before the transport setup at line 200)

**Context — existing pattern:**
Every tool in this file is registered with `server.tool(name, description, schema, handler)`.
`creatorId` is in scope for all tool handlers (resolved from the API key at the top of `app.all('/mcp', ...)`).
`db` is imported from `./lib/db`.
`logger` is imported from `./lib/logger`.
The deploy-manager retry endpoint is `POST /deployments/:deploymentId/retry` — it returns `{ queued: true }` on success or `{ error: string }` on failure. It only accepts deployments with `status = 'failed'`.

- [ ] **Step 1: Add the tool block**

In `mcp-server/src/index.ts`, after the closing `})` of the `deploy_app` tool (around line 198) and before:

```typescript
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
```

Insert:

```typescript
  server.tool(
    'retry_deployment',
    'Retry the most recent failed deployment for an app. Use this when get_deployment_status shows status="failed". Returns the deployment ID and queued status.',
    { app_id: z.string().uuid().describe('The app ID returned by deploy_app') },
    async ({ app_id }) => {
      // Look up the latest failed deployment, verify the app belongs to this creator
      const depResult = await db.query<{ deployment_id: string }>(
        `SELECT d.id AS deployment_id
         FROM deployments.deployments d
         JOIN marketplace.apps a ON a.id = d.app_id
         JOIN marketplace.channels ch ON ch.id = a.channel_id
         WHERE a.id = $1 AND ch.creator_id = $2 AND d.status = 'failed'
         ORDER BY d.created_at DESC LIMIT 1`,
        [app_id, creatorId]
      )
      if (!depResult.rows[0]) {
        return {
          content: [{
            type: 'text',
            text: 'No failed deployment found for this app. Use get_deployment_status to check the current state.',
          }],
        }
      }
      const deploymentId = depResult.rows[0].deployment_id

      const deployManagerUrl = process.env.DEPLOY_MANAGER_URL ?? 'http://deploy-manager:3002'
      let res: Response
      try {
        res = await fetch(`${deployManagerUrl}/deployments/${deploymentId}/retry`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}`,
          },
        })
      } catch (err) {
        logger.error({ msg: 'retry_deployment_fetch_failed', app_id, deploymentId, err, creatorId })
        return { content: [{ type: 'text', text: 'Failed to reach deploy-manager: network error' }], isError: true }
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'unknown' })) as { error?: string }
        logger.warn({ msg: 'retry_deployment_error', app_id, deploymentId, status: res.status, error: body.error, creatorId })
        return { content: [{ type: 'text', text: `Retry failed: ${body.error ?? res.statusText}` }], isError: true }
      }

      logger.info({ msg: 'retry_deployment_success', app_id, deploymentId, creatorId })
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            deploymentId,
            queued: true,
            message: 'Retry queued. Use get_deployment_status with app_id to poll for progress.',
          }),
        }],
      }
    }
  )
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd mcp-server && npx tsc --noEmit
```

Expected: no output (no errors).

- [ ] **Step 3: Commit**

```bash
git add mcp-server/src/index.ts
git commit -m "feat(mcp): add retry_deployment tool"
```

---

## Self-Review

**Spec coverage:**
- ✅ Takes `app_id` (what the agent has after `deploy_app`)
- ✅ Verifies creator ownership before retrying
- ✅ Calls existing deploy-manager retry endpoint
- ✅ Returns structured response with `deploymentId` so agent can poll via `get_deployment_status`
- ✅ Handles network error and non-2xx responses with `isError: true`
- ✅ No-op with clear message when deployment is not in failed state

**Placeholder scan:** None found.

**Type consistency:** `deployment_id` is typed as `string` on the query row and used directly as a string in the fetch URL. Matches the UUID stored in the DB.
