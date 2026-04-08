import { createMiddleware } from 'hono/factory'
import { jwtVerify } from 'jose'
import { createHash } from 'node:crypto'
import { db } from '../db.js'

export interface EmbedTokenPayload {
  userId: string | null
  appId: string
  sessionId: string
  creditsPerCall: number
  isFree: boolean
  isAnon: boolean
}

declare module 'hono' {
  interface ContextVariableMap {
    embedToken: EmbedTokenPayload
  }
}

const SECRET = new TextEncoder().encode(process.env.EMBED_TOKEN_SECRET!)

export const embedTokenAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing token' }, 401)
  }

  const token = authHeader.slice(7)

  let payload: EmbedTokenPayload
  let jwtPayload: Record<string, unknown>
  try {
    const { payload: p } = await jwtVerify(token, SECRET)
    jwtPayload = p as Record<string, unknown>
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }

  // Task execution tokens: skip embed_tokens DB lookup, still check suspension
  if (jwtPayload.type === 'task_execution') {
    payload = jwtPayload as unknown as EmbedTokenPayload
    c.set('embedToken', payload)

    const suspension = await db.query<{ id: string }>(
      `SELECT cs.id FROM platform.channel_suspensions cs
       JOIN marketplace.apps a ON a.channel_id = cs.channel_id
       WHERE a.id = $1 AND cs.is_active = true`,
      [payload.appId],
    )
    if (suspension.rows[0]) {
      return c.json({ error: 'This channel has been suspended' }, 403)
    }

    await next()
    return
  }

  // Regular embed tokens: verify in DB
  payload = jwtPayload as unknown as EmbedTokenPayload

  const tokenHash = createHash('sha256').update(token).digest('hex')

  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM gateway.embed_tokens
     WHERE token_hash = $1 AND expires_at > NOW()`,
    [tokenHash],
  )
  if (rows.length === 0) {
    return c.json({ error: 'Token not found or expired' }, 401)
  }

  c.set('embedToken', payload)

  const suspension = await db.query<{ id: string }>(
    `SELECT cs.id FROM platform.channel_suspensions cs
     JOIN marketplace.apps a ON a.channel_id = cs.channel_id
     WHERE a.id = $1 AND cs.is_active = true`,
    [payload.appId],
  )
  if (suspension.rows[0]) {
    return c.json({ error: 'This channel has been suspended' }, 403)
  }

  await next()
})
