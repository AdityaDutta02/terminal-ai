// platform/app/api/embed-token/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db, withTransaction } from '@/lib/db'
import { logger } from '@/lib/logger'
import { SignJWT } from 'jose'
import { createHash, randomUUID } from 'crypto'
import { z } from 'zod'
import { checkRateLimit, rateLimitResponse } from '@/lib/middleware/rate-limit'

const FIFTEEN_MINUTES = 15 * 60 * 1000

function getSecret(): Uint8Array {
  const secret = process.env.EMBED_TOKEN_SECRET
  if (!secret) throw new Error('EMBED_TOKEN_SECRET env var is not set')
  return Buffer.from(secret, 'utf-8')
}

const bodySchema = z.object({
  appId: z.string().uuid('appId must be a valid UUID'),
})

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await checkRateLimit(`embed:${session.user.id}`, 10, 60_000)
  if (!allowed) return rateLimitResponse()

  const parsed = bodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const { appId } = parsed.data

  // Fetch app + channel info
  const appResult = await db.query<{
    id: string
    credits_per_session: number
    is_free: boolean
    creator_balance: number
  }>(
    `SELECT a.id, a.credits_per_session, a.is_free,
            c.creator_balance
     FROM marketplace.apps a
     JOIN marketplace.channels c ON c.id = a.channel_id
     LEFT JOIN platform.channel_suspensions cs ON cs.channel_id = c.id AND cs.is_active = true
     WHERE a.id = $1 AND a.status = 'live' AND a.deleted_at IS NULL
       AND cs.channel_id IS NULL`,
    [appId],
  )
  if (!appResult.rows[0]) {
    logger.warn({ msg: 'App not found', appId })
    return NextResponse.json({ error: 'App not found' }, { status: 404 })
  }

  const app = appResult.rows[0]

  // Reject token issuance for banned users (ban check at session creation only blocks new sessions)
  const banCheck = await db.query(
    `SELECT id FROM platform.user_bans
     WHERE user_id = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > NOW())`,
    [session.user.id],
  )
  if (banCheck.rows[0]) {
    logger.warn({ msg: 'embed_token_denied_banned_user', userId: session.user.id, appId })
    return NextResponse.json({ error: 'Account suspended' }, { status: 403 })
  }

  const isAdmin = (session.user as Record<string, unknown>).role === 'admin'

  let token: string
  let sessionId: string

  try {
    await withTransaction(async (client) => {
      // Serialize concurrent embed-token requests per user to prevent race on balance check
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [session.user.id])

      // Check balance is sufficient (but don't deduct yet — deduction happens on first API call)
      if (!isAdmin && !app.is_free && app.credits_per_session > 0) {
        const balanceResult = await client.query<{ balance: number }>(
          `SELECT COALESCE(SUM(delta), 0) AS balance FROM subscriptions.credit_ledger WHERE user_id = $1`,
          [session.user.id],
        )
        const balance = balanceResult.rows[0]?.balance ?? 0
        if (balance < app.credits_per_session) {
          // Check if user has active subscription → top-up page, otherwise → pricing
          const subResult = await client.query<{ status: string }>(
            `SELECT status FROM subscriptions.user_subscriptions
             WHERE user_id = $1 AND status = 'active' LIMIT 1`,
            [session.user.id],
          )
          const redirectUrl = subResult.rows[0]
            ? '/top-up?reason=insufficient_credits'
            : '/pricing?reason=insufficient_credits'
          // Signal to outer scope via a thrown error with a redirect payload
          throw Object.assign(new Error('INSUFFICIENT_CREDITS'), { redirectUrl, status: 402 })
        }
      }

      sessionId = randomUUID()
      const expiresAt = new Date(Date.now() + FIFTEEN_MINUTES)
      const creditsPerCall = isAdmin ? 0 : app.credits_per_session

      token = await new SignJWT({
        userId: session.user.id,
        appId,
        sessionId,
        creditsPerCall,
        isFree: app.is_free,
        isAnon: false,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('15m')
        .sign(getSecret())

      const tokenHash = createHash('sha256').update(token).digest('hex')

      await client.query(
        `INSERT INTO gateway.embed_tokens
           (user_id, app_id, session_id, token_hash, expires_at, credits_deducted, deducted_at)
         VALUES ($1, $2, $3, $4, $5, 0, NOW())`,
        [session.user.id, appId, sessionId, tokenHash, expiresAt],
      )
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'INSUFFICIENT_CREDITS') {
      const e = err as Error & { redirectUrl: string; status: number }
      return NextResponse.json({ error: 'Insufficient credits', redirect: e.redirectUrl }, { status: 402 })
    }
    logger.error({ msg: 'Failed to issue embed token', error: err instanceof Error ? err.message : String(err), userId: session.user.id, appId })
    return NextResponse.json({ error: 'Failed to issue token' }, { status: 500 })
  }

  return NextResponse.json({ token: token!, sessionId: sessionId! })
}
