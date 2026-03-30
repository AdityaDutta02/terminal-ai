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
 * Atomically deduct credits via the ledger (single source of truth).
 * Falls back to user.credits for users who have no ledger entries yet.
 * Returns remaining balance or null if insufficient.
 */
export async function deductCredits(
  userId: string,
  amount: number,
  appId?: string,
): Promise<number | null> {
  const { rows } = await db.query<{ balance_after: number }>(
    `WITH current AS (
       SELECT COALESCE(
         (SELECT balance_after FROM subscriptions.credit_ledger
          WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1),
         (SELECT credits FROM public."user" WHERE id = $1),
         0
       ) AS balance
     ),
     check_balance AS (SELECT balance FROM current WHERE balance >= $2),
     inserted AS (
       INSERT INTO subscriptions.credit_ledger
         (user_id, delta, balance_after, reason, app_id)
       SELECT $1, -$2, balance - $2, 'api_call', $3
       FROM check_balance
       RETURNING balance_after
     )
     SELECT balance_after FROM inserted`,
    [userId, amount, appId ?? null],
  )
  return rows[0]?.balance_after ?? null
}
