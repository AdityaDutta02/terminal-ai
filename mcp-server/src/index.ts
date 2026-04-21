import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { Hono } from 'hono'
import { z } from 'zod'
import crypto from 'crypto'
import { SignJWT } from 'jose'
import { scaffoldApp, buildPortFromFiles } from './tools/scaffold'
import { getProvidersJson } from './tools/providers'
import { enableCompatShim, disableCompatShim } from './tools/compat-shim'
import { analyzeRepo } from './tools/analyze-repo'
import { db } from './lib/db'
import { logger } from './lib/logger'

if (!process.env.INTERNAL_SERVICE_TOKEN) {
  logger.error({ msg: 'missing_env_var', var: 'INTERNAL_SERVICE_TOKEN' })
  process.exit(1)
}

const EMBED_TOKEN_SECRET = new TextEncoder().encode(process.env.EMBED_TOKEN_SECRET ?? '')

const app = new Hono()

app.get('/health', (c) => c.json({ status: 'ok' }))

/** Result type returned by callPlatform. */
type PlatformResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number }

/**
 * POST JSON to an internal platform endpoint.
 * Centralises network error handling and non-2xx response parsing so
 * individual tool handlers stay concise and DRY.
 */
async function callPlatform<T>(
  path: string,
  body: unknown,
  creatorId: string
): Promise<PlatformResult<T>> {
  const platformUrl = process.env.PLATFORM_URL ?? 'http://platform:3000'
  let res: Response
  try {
    res = await fetch(`${platformUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': process.env.INTERNAL_SERVICE_TOKEN ?? '',
        'X-Creator-Id': creatorId,
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    logger.error({ msg: 'platform_fetch_failed', path, err, creatorId })
    return { ok: false, error: 'Failed to reach platform: network error', status: 0 }
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: 'unknown' })) as { error?: string }
    logger.warn({ msg: 'platform_error_response', path, status: res.status, error: errBody.error, creatorId })
    return { ok: false, error: errBody.error ?? res.statusText, status: res.status }
  }

  const data = await res.json() as T
  return { ok: true, data }
}

async function callDeployManager<T>(
  path: string,
  method: 'GET' | 'POST' | 'DELETE' = 'GET'
): Promise<PlatformResult<T>> {
  const deployManagerUrl = process.env.DEPLOY_MANAGER_URL ?? 'http://deploy-manager:3002'
  let res: Response
  try {
    res = await fetch(`${deployManagerUrl}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}`,
      },
    })
  } catch (err) {
    logger.error({ msg: 'deploy_manager_fetch_failed', path, err })
    return { ok: false, error: 'Failed to reach deploy-manager: network error', status: 0 }
  }
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: 'unknown' })) as { error?: string }
    return { ok: false, error: errBody.error ?? res.statusText, status: res.status }
  }
  const data = await res.json() as T
  return { ok: true, data }
}

const ScaffoldSchema = {
  framework: z.enum(['nextjs', 'python', 'streamlit', 'static']),
  app_name: z.string(),
  description: z.string(),
  category: z.string(),
  uses_ai: z.boolean(),
  uses_file_upload: z.boolean(),
  generates_artifacts: z.boolean(),
  api_category: z.enum(['chat', 'coding', 'image', 'web_search', 'web_scrape']).optional().describe('V2 API category for model routing (default: chat)'),
  api_tier: z.enum(['fast', 'good', 'quality']).optional().describe('V2 API tier for model routing (default: good)'),
  port_from: z.object({
    provider: z.literal('supabase'),
    github_repo: z.string().describe('GitHub URL of the existing app'),
  }).optional().describe('Port an existing app from another provider'),
}

const DeployAppSchema = {
  channelId: z.string().describe('Channel ID returned from create_channel'),
  name: z.string().min(1).max(80).describe('App name'),
  description: z.string().max(500).optional(),
  githubRepo: z.string().describe('Full GitHub repo URL, e.g. https://github.com/user/repo'),
  githubBranch: z.string().default('main').describe('Branch to deploy'),
  framework: z.enum(['nextjs', 'react', 'vue', 'svelte', 'static']).default('nextjs'),
}

app.all('/mcp', async (c) => {
  const apiKey = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!apiKey) return c.text('Unauthorized', 401, { 'WWW-Authenticate': 'Bearer' })

  const tokenHash = crypto.createHash('sha256').update(apiKey).digest('hex')
  const keyResult = await db.query(
    `SELECT creator_id FROM mcp.api_keys WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  )
  if (!keyResult.rows[0]) return c.text('Invalid API key', 401, { 'WWW-Authenticate': 'Bearer error="invalid_token"' })

  const creatorId = keyResult.rows[0].creator_id as string

  // Update last_used_at asynchronously — do not block the SSE handshake
  db.query(`UPDATE mcp.api_keys SET last_used_at = NOW() WHERE token_hash = $1`, [tokenHash]).catch(
    (err: unknown) => logger.warn({ msg: 'failed_to_update_last_used_at', err })
  )

  const server = new McpServer({ name: 'terminal-ai', version: '1.0.0' })

  server.tool('scaffold_app', ScaffoldSchema, async (input) => {
    const result = scaffoldApp(input)
    if (input.port_from?.provider === 'supabase') {
      const portFiles = buildPortFromFiles({
        provider: 'supabase',
        detectedTables: [],
      })
      for (const file of portFiles) {
        result.files[file.path] = file.content
      }
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  })

  server.tool('get_deployment_status', { app_id: z.string().uuid() }, async ({ app_id }) => {
    const result = await db.query(
      `SELECT d.status, d.subdomain, d.url, d.error_message, d.created_at, d.completed_at, d.coolify_app_id
       FROM deployments.deployments d
       JOIN marketplace.apps a ON a.id = d.app_id
       JOIN marketplace.channels ch ON ch.id = a.channel_id
       WHERE a.id = $1 AND ch.creator_id = $2 AND a.deleted_at IS NULL AND ch.deleted_at IS NULL
       ORDER BY d.created_at DESC LIMIT 1`,
      [app_id, creatorId]
    )
    if (!result.rows[0]) return { content: [{ type: 'text', text: 'App not found' }] }
    const row = result.rows[0] as {
      status: string
      subdomain: string
      url: string | null
      error_message: string | null
      created_at: string
      completed_at: string | null
      coolify_app_id: string | null
    }
    const response: Record<string, unknown> = {
      status: row.status,
      subdomain: row.subdomain,
      created_at: row.created_at,
    }
    if (row.status === 'live' && row.url) response.url = row.url
    if (row.status === 'failed') {
      response.error = row.error_message ?? 'Unknown error'
      // Auto-correct: check if logs endpoint detects recovery
      if (row.coolify_app_id) {
        const depRow = await db.query<{ id: string }>(
          `SELECT id FROM deployments.deployments WHERE app_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [app_id]
        )
        if (depRow.rows[0]) {
          const logsResult = await callDeployManager<Record<string, unknown>>(`/deployments/${depRow.rows[0].id}/logs`)
          if (logsResult.ok && logsResult.data.status === 'live') {
            response.status = 'live'
            response.url = logsResult.data.url ?? logsResult.data.coolifyUrl
            delete response.error
            response.message = 'Status auto-corrected — app is actually running'
          }
        }
      }
    }
    if (row.status === 'building') response.message = 'Deployment is in progress — poll again in 30 seconds'
    if (row.status === 'pending') response.message = 'Deployment is queued and will start shortly'
    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] }
  })

  server.tool('list_supported_providers', {}, async () => {
    const providersJson = await getProvidersJson()
    return { content: [{ type: 'text', text: providersJson }] }
  })

  server.tool(
    'list_channels',
    'List all channels you own on Terminal AI. Returns channel IDs, slugs, and URLs — use the id with deploy_app.',
    {},
    async () => {
      const result = await db.query(
        `SELECT c.id, c.name, c.slug, COUNT(a.id)::int AS app_count
         FROM marketplace.channels c
         LEFT JOIN marketplace.apps a ON a.channel_id = c.id AND a.deleted_at IS NULL
         WHERE c.creator_id = $1 AND c.deleted_at IS NULL
         GROUP BY c.id, c.name, c.slug
         ORDER BY c.created_at DESC`,
        [creatorId]
      )
      const channels = (result.rows as { id: string; name: string; slug: string; app_count: number }[]).map((row) => ({
        channelId: row.id,
        name: row.name,
        slug: row.slug,
        url: `https://terminalai.studioionique.com/c/${row.slug}`,
        appCount: row.app_count,
      }))
      return {
        content: [{
          type: 'text' as const,
          text: channels.length === 0
            ? 'No channels found. Use create_channel to create one.'
            : JSON.stringify(channels, null, 2),
        }],
      }
    }
  )

  server.tool(
    'list_apps',
    'List all apps in a channel you own. Returns app IDs, names, slugs, and deployment status — useful for finding app IDs for redeploy_app or delete_app.',
    {
      channel_id: z.string().uuid().describe('Channel ID to list apps for'),
    },
    async ({ channel_id }) => {
      const result = await db.query(
        `SELECT a.id, a.name, a.slug, a.github_repo, a.github_branch,
                d.status AS deploy_status, d.url AS deploy_url
         FROM marketplace.apps a
         JOIN marketplace.channels ch ON ch.id = a.channel_id
         LEFT JOIN LATERAL (
           SELECT status, url FROM deployments.deployments
           WHERE app_id = a.id ORDER BY created_at DESC LIMIT 1
         ) d ON true
         WHERE a.channel_id = $1 AND ch.creator_id = $2 AND a.deleted_at IS NULL AND ch.deleted_at IS NULL
         ORDER BY a.created_at DESC`,
        [channel_id, creatorId]
      )
      const apps = (result.rows as { id: string; name: string; slug: string; github_repo: string; github_branch: string; deploy_status: string | null; deploy_url: string | null }[]).map((row) => ({
        appId: row.id,
        name: row.name,
        slug: row.slug,
        githubRepo: row.github_repo,
        branch: row.github_branch,
        deployStatus: row.deploy_status ?? 'unknown',
        url: row.deploy_url ?? null,
      }))
      return {
        content: [{
          type: 'text' as const,
          text: apps.length === 0
            ? 'No apps found in this channel.'
            : JSON.stringify(apps, null, 2),
        }],
      }
    }
  )

  server.tool(
    'create_channel',
    'Create a new channel on Terminal AI for publishing apps. Returns the channel id and slug needed for deploy_app.',
    {
      name: z.string().min(1).max(80).describe('Human-readable channel name, e.g. "My Portfolio Apps"'),
      description: z.string().max(500).optional().describe('Short description shown on the channel page'),
    },
    async ({ name, description }) => {
      const result = await callPlatform<{ id: string; slug: string }>(
        '/api/internal/channels',
        { name, description },
        creatorId
      )
      if (!result.ok) {
        return { content: [{ type: 'text', text: `Failed to create channel: ${result.error}` }], isError: true }
      }
      logger.info({ msg: 'create_channel_success', channelId: result.data.id, creatorId })
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            channelId: result.data.id,
            slug: result.data.slug,
            url: `https://terminalai.studioionique.com/c/${result.data.slug}`,
          }),
        }],
      }
    }
  )

  server.tool(
    'delete_channel',
    'Delete an empty channel. Fails if the channel still has apps — delete all apps first.',
    {
      channel_id: z.string().uuid().describe('Channel ID to delete'),
      confirm: z.literal(true).describe('Must be true to confirm deletion'),
    },
    async ({ channel_id }) => {
      const check = await db.query(
        `SELECT c.id, COUNT(a.id)::int AS app_count
         FROM marketplace.channels c
         LEFT JOIN marketplace.apps a ON a.channel_id = c.id AND a.deleted_at IS NULL
         WHERE c.id = $1 AND c.creator_id = $2 AND c.deleted_at IS NULL
         GROUP BY c.id`,
        [channel_id, creatorId]
      )
      if (!check.rows[0]) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Channel not found or not owned by you' }) }], isError: true }
      }
      const row = check.rows[0] as { id: string; app_count: number }
      if (row.app_count > 0) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Channel has ${row.app_count} app(s). Delete all apps first.` }) }], isError: true }
      }
      await db.query(`DELETE FROM marketplace.channels WHERE id = $1 AND creator_id = $2`, [channel_id, creatorId])
      logger.info({ msg: 'delete_channel_success', channelId: channel_id, creatorId })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ deleted: true, channelId: channel_id }) }] }
    }
  )

  server.tool(
    'deploy_app',
    'Register a GitHub repo as an app on Terminal AI and trigger deployment. The app will be built and deployed to *.apps.terminalai.studioionique.com.',
    DeployAppSchema,
    async (input) => {
      const result = await callPlatform<{ id: string; deploymentId: string; deploymentQueued: boolean }>(
        '/api/internal/apps',
        input,
        creatorId
      )
      if (!result.ok) {
        return { content: [{ type: 'text', text: `Failed to register app: ${result.error}` }], isError: true }
      }
      logger.info({ msg: 'deploy_app_success', appId: result.data.id, deploymentId: result.data.deploymentId, creatorId })
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            appId: result.data.id,
            deploymentId: result.data.deploymentId,
            deploymentQueued: result.data.deploymentQueued,
            statusTool: 'Use get_deployment_status with appId to poll for completion',
          }),
        }],
      }
    }
  )

  server.tool(
    'get_deployment_logs',
    'Get detailed deployment status, live Coolify container info, and build logs for a deployment. Use this to diagnose build or startup failures.',
    { deployment_id: z.string().uuid().describe('Deployment ID returned by deploy_app or redeploy_app') },
    async ({ deployment_id }) => {
      const result = await callDeployManager<Record<string, unknown>>(`/deployments/${deployment_id}/logs`)
      if (!result.ok) {
        return { content: [{ type: 'text', text: `Failed to get logs: ${result.error}` }], isError: true }
      }
      return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] }
    }
  )

  server.tool(
    'redeploy_app',
    'Trigger a redeploy of an existing app from the latest git commit. Does NOT delete the app — reuses the existing Coolify container and subdomain.',
    { app_id: z.string().uuid().describe('App ID to redeploy') },
    async ({ app_id }) => {
      const check = await db.query(
        `SELECT a.id FROM marketplace.apps a
         JOIN marketplace.channels ch ON ch.id = a.channel_id
         WHERE a.id = $1 AND ch.creator_id = $2 AND a.deleted_at IS NULL AND ch.deleted_at IS NULL`,
        [app_id, creatorId]
      )
      if (!check.rows[0]) return { content: [{ type: 'text', text: 'App not found or not owned by you' }], isError: true }
      const result = await callDeployManager<{ deploymentId: string; redeployed: boolean }>(
        `/apps/${app_id}/redeploy`,
        'POST'
      )
      if (!result.ok) {
        return { content: [{ type: 'text', text: `Failed to redeploy: ${result.error}` }], isError: true }
      }
      logger.info({ msg: 'redeploy_app_success', appId: app_id, deploymentId: result.data.deploymentId, creatorId })
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            appId: app_id,
            deploymentId: result.data.deploymentId,
            redeployed: result.data.redeployed,
            statusTool: 'Use get_deployment_status with appId to poll for completion',
          }),
        }],
      }
    }
  )

  server.tool(
    'delete_app',
    'Permanently delete an app and all its deployments. Removes from Coolify and the Terminal AI database. Cannot be undone.',
    {
      app_id: z.string().uuid().describe('App ID to delete'),
      confirm: z.literal(true).describe('Must be true to confirm permanent deletion'),
    },
    async ({ app_id }) => {
      const check = await db.query(
        `SELECT a.id FROM marketplace.apps a
         JOIN marketplace.channels ch ON ch.id = a.channel_id
         WHERE a.id = $1 AND ch.creator_id = $2 AND a.deleted_at IS NULL AND ch.deleted_at IS NULL`,
        [app_id, creatorId]
      )
      if (!check.rows[0]) return { content: [{ type: 'text', text: 'App not found or not owned by you' }], isError: true }
      const result = await callDeployManager<{ deleted: boolean; coolifyAppsDeleted: number; warnings: string[] }>(
        `/apps/${app_id}`,
        'DELETE'
      )
      if (!result.ok) {
        return { content: [{ type: 'text', text: `Failed to delete app: ${result.error}` }], isError: true }
      }
      logger.info({ msg: 'delete_app_success', appId: app_id, creatorId })
      return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] }
    }
  )

  server.tool(
    'create_scheduled_task',
    'Create a scheduled task (cron job) for a deployed app. The gateway will POST to the callback path on the given schedule.',
    {
      app_id: z.string().uuid().describe('UUID of the deployed app'),
      name: z.string().max(100).describe('Human-readable task name (max 100 chars, unique per app)'),
      schedule: z.string().describe('Cron expression (5 fields, minimum 1-hour interval). Example: "0 8 * * *" for daily 8am'),
      callback_path: z.string().describe('Path on the app to POST to. Must start with /. Example: "/api/cron/report"'),
      payload: z.record(z.unknown()).optional().describe('JSON payload sent as POST body on each execution (max 10KB)'),
      timezone: z.string().optional().describe('IANA timezone. Default: UTC. Example: "Asia/Kolkata"'),
    },
    async ({ app_id, name, schedule, callback_path, payload, timezone }) => {
      const ownerCheck = await db.query(
        `SELECT a.id FROM marketplace.apps a
         JOIN marketplace.channels ch ON ch.id = a.channel_id
         WHERE a.id = $1 AND ch.creator_id = $2 AND a.deleted_at IS NULL AND ch.deleted_at IS NULL`,
        [app_id, creatorId]
      )
      if (!ownerCheck.rows[0]) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'App not found or not owned by you' }) }], isError: true }
      }

      const gatewayUrl = process.env.TERMINAL_AI_GATEWAY_URL ?? 'http://gateway:3001'

      const taskToken = await new SignJWT({
        appId: app_id,
        userId: creatorId,
        type: 'task_execution',
        isFree: false,
        creditsPerCall: 0,
        sessionId: `mcp-task-${crypto.randomUUID()}`,
        isAnon: false,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('2m')
        .sign(EMBED_TOKEN_SECRET)

      const res = await fetch(`${gatewayUrl}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${taskToken}`,
        },
        body: JSON.stringify({ name, schedule, callbackPath: callback_path, payload: payload ?? {}, timezone: timezone ?? 'UTC' }),
      })
      const data = await res.json()
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'list_scheduled_tasks',
    'List all scheduled tasks for a deployed app',
    {
      app_id: z.string().uuid().describe('UUID of the deployed app'),
    },
    async ({ app_id }) => {
      const ownerCheck = await db.query(
        `SELECT a.id FROM marketplace.apps a
         JOIN marketplace.channels ch ON ch.id = a.channel_id
         WHERE a.id = $1 AND ch.creator_id = $2 AND a.deleted_at IS NULL AND ch.deleted_at IS NULL`,
        [app_id, creatorId]
      )
      if (!ownerCheck.rows[0]) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'App not found or not owned by you' }) }], isError: true }
      }

      const result = await db.query(
        `SELECT id, name, schedule, callback_path, timezone, enabled, next_run_at, last_run_at, last_run_status
         FROM gateway.scheduled_tasks WHERE app_id = $1 ORDER BY created_at`,
        [app_id],
      )
      return { content: [{ type: 'text' as const, text: JSON.stringify(result.rows, null, 2) }] }
    }
  )

  server.tool(
    'delete_scheduled_task',
    'Delete a scheduled task',
    {
      app_id: z.string().uuid().describe('UUID of the deployed app'),
      task_id: z.string().uuid().describe('UUID of the task to delete'),
    },
    async ({ app_id, task_id }) => {
      const ownerCheck = await db.query(
        `SELECT a.id FROM marketplace.apps a
         JOIN marketplace.channels ch ON ch.id = a.channel_id
         WHERE a.id = $1 AND ch.creator_id = $2 AND a.deleted_at IS NULL AND ch.deleted_at IS NULL`,
        [app_id, creatorId]
      )
      if (!ownerCheck.rows[0]) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'App not found or not owned by you' }) }], isError: true }
      }

      const result = await db.query(
        `DELETE FROM gateway.scheduled_tasks WHERE id = $1 AND app_id = $2`,
        [task_id, app_id],
      )
      const deleted = (result.rowCount ?? 0) > 0
      return { content: [{ type: 'text' as const, text: JSON.stringify({ deleted, taskId: task_id }) }] }
    }
  )

  server.tool(
    'list_env_vars',
    'List all environment variables for an app. Returns keys and their current values.',
    {
      app_id: z.string().uuid().describe('App ID'),
    },
    async ({ app_id }) => {
      const platformUrl = process.env.PLATFORM_URL ?? 'http://platform:3000'
      let res: Response
      try {
        res = await fetch(`${platformUrl}/api/internal/env-vars?appId=${app_id}`, {
          headers: {
            'X-Service-Token': process.env.INTERNAL_SERVICE_TOKEN ?? '',
            'X-Creator-Id': creatorId,
          },
        })
      } catch (err) {
        logger.error({ msg: 'platform_fetch_failed', path: '/api/internal/env-vars', err, creatorId })
        return { content: [{ type: 'text' as const, text: 'Failed to reach platform: network error' }], isError: true }
      }
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'unknown' })) as { error?: string }
        logger.warn({ msg: 'platform_error_response', path: '/api/internal/env-vars', status: res.status, error: errBody.error, creatorId })
        return { content: [{ type: 'text' as const, text: `Failed to list env vars: ${errBody.error ?? res.statusText}` }], isError: true }
      }
      const data = await res.json()
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'set_env_var',
    'Set (create or update) an environment variable for an app. Values are encrypted at rest. Changes take effect on next redeploy.',
    {
      app_id: z.string().uuid(),
      key: z.string().describe('Env var name — uppercase letters, numbers, underscores only (e.g. API_KEY)'),
      value: z.string().describe('The value to set'),
    },
    async ({ app_id, key, value }) => {
      const result = await callPlatform<{ key: string; value: string; updatedAt: string }>(
        '/api/internal/env-vars',
        { appId: app_id, key, value },
        creatorId,
      )
      if (!result.ok) {
        return { content: [{ type: 'text' as const, text: `Failed to set env var: ${result.error}` }], isError: true }
      }
      logger.info({ msg: 'set_env_var_success', appId: app_id, key, creatorId })
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            ...result.data,
            reminder: 'Call redeploy_app with this app_id to apply the new env vars.',
          }, null, 2),
        }],
      }
    }
  )

  server.tool(
    'delete_env_var',
    'Delete an environment variable from an app. Changes take effect on next redeploy.',
    {
      app_id: z.string().uuid(),
      key: z.string(),
    },
    async ({ app_id, key }) => {
      const platformUrl = process.env.PLATFORM_URL ?? 'http://platform:3000'
      let res: Response
      try {
        res = await fetch(`${platformUrl}/api/internal/env-vars`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'X-Service-Token': process.env.INTERNAL_SERVICE_TOKEN ?? '',
            'X-Creator-Id': creatorId,
          },
          body: JSON.stringify({ appId: app_id, key }),
        })
      } catch (err) {
        logger.error({ msg: 'platform_fetch_failed', path: '/api/internal/env-vars', err, creatorId })
        return { content: [{ type: 'text' as const, text: 'Failed to reach platform: network error' }], isError: true }
      }
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'unknown' })) as { error?: string }
        logger.warn({ msg: 'platform_error_response', path: '/api/internal/env-vars', status: res.status, error: errBody.error, creatorId })
        return { content: [{ type: 'text' as const, text: `Failed to delete env var: ${errBody.error ?? res.statusText}` }], isError: true }
      }
      const data = await res.json() as { deleted: boolean }
      logger.info({ msg: 'delete_env_var_success', appId: app_id, key, creatorId })
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            ...data,
            reminder: 'Call redeploy_app with this app_id to apply changes.',
          }, null, 2),
        }],
      }
    }
  )

  server.tool(
    'enable_compat_shim',
    'Enable the Supabase compatibility shim for an app. Activates /compat/supabase/* gateway routes so supabase-js calls are translated to Terminal AI.',
    {
      app_id: z.string().uuid().describe('App UUID'),
    },
    async ({ app_id }) => {
      const result = await enableCompatShim(app_id)
      logger.info({ msg: 'enable_compat_shim_success', appId: app_id, creatorId })
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
    }
  )

  server.tool(
    'disable_compat_shim',
    'Disable the Supabase compatibility shim for an app. All /compat/supabase/* routes return 404.',
    {
      app_id: z.string().uuid().describe('App UUID'),
    },
    async ({ app_id }) => {
      const result = await disableCompatShim(app_id)
      logger.info({ msg: 'disable_compat_shim_success', appId: app_id, creatorId })
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
    }
  )

  server.tool(
    'analyze_repo',
    'Scan a GitHub repo for Supabase patterns before porting to Terminal AI. Returns risk flags, migration checklist, and compat_shim_coverage score. Halts with critical flags if service_role credentials are detected.',
    {
      github_repo: z.string().describe('Full GitHub URL (e.g. https://github.com/acme/app)'),
      branch: z.string().optional().describe('Branch to scan (default: main)'),
      github_token: z.string().optional().describe('Optional GitHub personal access token for private repos'),
    },
    async ({ github_repo, branch, github_token }) => {
      const result = await analyzeRepo(github_repo, branch ?? 'main', github_token)
      logger.info({ msg: 'analyze_repo_completed', github_repo, halted_on_critical: result.halted_on_critical })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    }
  )

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  await server.connect(transport)
  logger.info({ msg: 'mcp_connection', creatorId })
  return transport.handleRequest(c.req.raw)
})

const port = parseInt(process.env.PORT ?? '3003', 10)
logger.info({ msg: 'mcp_server_started', port })
export default { port, fetch: app.fetch }
