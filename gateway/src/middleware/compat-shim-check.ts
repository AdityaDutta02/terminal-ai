import { createMiddleware } from 'hono/factory'
import { db } from '../db'
import { logger } from '../lib/logger'
import type { EmbedTokenPayload } from './auth'

declare module 'hono' {
  interface ContextVariableMap {
    embedToken: EmbedTokenPayload & { role?: string }
  }
}

export const compatShimCheck = createMiddleware(async (c, next) => {
  const token = c.get('embedToken')
  const { appId } = token

  // Strip apikey header — never read, never log its value
  if (c.req.raw.headers.has('apikey')) {
    logger.debug({ msg: 'compat_apikey_header_stripped', appId })
    // Note: Hono doesn't mutate headers; we rely on never reading 'apikey' downstream
  }

  // Reject service_role tokens
  if ((token as { role?: string }).role === 'service_role') {
    return c.json(
      { error: 'service role tokens are not accepted by Terminal AI' },
      403,
    )
  }

  // Check shim is enabled for this app
  const { rows } = await db.query<{ compat_shim_enabled: boolean }>(
    `SELECT compat_shim_enabled FROM marketplace.apps WHERE id = $1`,
    [appId],
  )

  if (!rows[0]?.compat_shim_enabled) {
    return c.json({ error: 'Not found' }, 404)
  }

  await next()
})
