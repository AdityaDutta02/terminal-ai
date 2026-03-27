import { createMiddleware } from 'hono/factory'
import { jwtVerify } from 'jose'
import { createHash } from 'node:crypto'
import { db } from '../db.js'

export interface EmbedTokenPayload {
  userId: string
  appId: string
  sessionId: string
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
  try {
    const { payload: p } = await jwtVerify(token, SECRET)
    payload = p as unknown as EmbedTokenPayload
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }

  const tokenHash = createHash('sha256').update(token).digest('hex')

  // Verify token exists in DB and is not expired
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM gateway.embed_tokens
     WHERE token_hash = $1 AND expires_at > NOW()`,
    [tokenHash],
  )
  if (rows.length === 0) {
    return c.json({ error: 'Token not found or expired' }, 401)
  }

  c.set('embedToken', payload)
  await next()
})

/**
 * Atomically deduct credits. Returns remaining credits or null if insufficient.
 */
export async function deductCredits(
  userId: string,
  amount: number,
): Promise<number | null> {
  const { rows } = await db.query<{ credits: number }>(
    `UPDATE auth."user"
     SET credits = credits - $1
     WHERE id = $2 AND credits >= $1
     RETURNING credits`,
    [amount, userId],
  )
  return rows[0]?.credits ?? null
}
