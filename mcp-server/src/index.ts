import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { Hono } from 'hono'
import { z } from 'zod'
import { scaffoldApp } from './tools/scaffold'
import { getProvidersJson } from './tools/providers'
import { db } from './lib/db'
import { logger } from './lib/logger'
const app = new Hono()
app.get('/health', (c) => c.json({ status: 'ok' }))
const ScaffoldSchema = {
  framework: z.enum(['nextjs', 'python', 'streamlit', 'static']),
  app_name: z.string(),
  description: z.string(),
  category: z.string(),
  uses_ai: z.boolean(),
  uses_file_upload: z.boolean(),
  generates_artifacts: z.boolean(),
}
app.get('/sse', async (c) => {
  const apiKey = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!apiKey) return c.text('Unauthorized', 401)
  const keyResult = await db.query(
    `SELECT creator_id FROM mcp.api_keys WHERE key_hash = digest($1, 'sha256') AND revoked_at IS NULL`,
    [apiKey]
  )
  if (!keyResult.rows[0]) return c.text('Invalid API key', 401)
  const creatorId = keyResult.rows[0].creator_id as string
  const server = new McpServer({ name: 'terminal-ai', version: '1.0.0' })
  server.tool('scaffold_app', ScaffoldSchema, async (input) => {
    const result = scaffoldApp(input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  })
  server.tool('get_deployment_status', { app_id: z.string().uuid() }, async ({ app_id }) => {
    const result = await db.query(
      `SELECT d.status, d.subdomain, d.created_at, d.coolify_app_id
       FROM deployments.deployments d
       JOIN marketplace.apps a ON a.id = d.app_id
       JOIN marketplace.channels ch ON ch.id = a.channel_id
       WHERE a.id = $1 AND ch.creator_id = $2`,
      [app_id, creatorId]
    )
    if (!result.rows[0]) return { content: [{ type: 'text', text: 'App not found' }] }
    return { content: [{ type: 'text', text: JSON.stringify(result.rows[0], null, 2) }] }
  })
  server.tool('list_supported_providers', {}, async () => {
    return { content: [{ type: 'text', text: getProvidersJson() }] }
  })
  const transport = new SSEServerTransport('/sse', c.env.outgoing)
  await server.connect(transport)
  logger.info({ msg: 'mcp_connection', creatorId })
  return new Response(null)
})
const port = parseInt(process.env.PORT ?? '3003', 10)
logger.info({ msg: 'mcp_server_started', port })
export default { port, fetch: app.fetch }
