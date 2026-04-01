// platform/app/api/embed-token/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { deductCredits, grantCredits } from '@/lib/credits'
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
     WHERE a.id = $1 AND a.status = 'live' AND a.deleted_at IS NULL`,
    [appId],
  )
  if (!appResult.rows[0]) {
    logger.warn({ msg: 'App not found', appId })
    return NextResponse.json({ error: 'App not found' }, { status: 404 })
  }

  const app = appResult.rows[0]
  let creditsDeducted = 0

  // Admins skip credit deduction entirely
  const isAdmin = (session.user as Record<string, unknown>).role === 'admin'

  if (isAdmin) {
    // no-op: admins are never charged
  } else if (app.is_free && app.credits_per_session > 0) {
    // Atomically deduct from creator_balance using RETURNING to detect race condition
    const updateResult = await db.query<{ creator_balance: number }>(
      `UPDATE marketplace.channels
       SET creator_balance = creator_balance - $1
       WHERE id = (SELECT channel_id FROM marketplace.apps WHERE id = $2)
         AND creator_balance >= $1
       RETURNING creator_balance`,
      [app.credits_per_session, appId],
    )
    if (!updateResult.rows[0]) {
      return NextResponse.json({ error: 'This app is temporarily unavailable' }, { status: 402 })
    }
    creditsDeducted = app.credits_per_session
  } else if (app.credits_per_session > 0) {
    // Deduct from user's credit ledger
    try {
      await deductCredits(session.user.id, app.credits_per_session, 'session_start', appId)
      creditsDeducted = app.credits_per_session
    } catch {
      logger.warn({ msg: 'Insufficient credits for session start', userId: session.user.id, appId })
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
    }
  }

  const sessionId = randomUUID()
  const expiresAt = new Date(Date.now() + FIFTEEN_MINUTES)

  const token = await new SignJWT({
    userId: session.user.id,
    appId,
    sessionId,
    creditsDeducted,
    isAnon: false,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(getSecret())

  const tokenHash = createHash('sha256').update(token).digest('hex')

  try {
    await db.query(
      `INSERT INTO gateway.embed_tokens
         (user_id, app_id, session_id, token_hash, expires_at, credits_deducted, deducted_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [session.user.id, appId, sessionId, tokenHash, expiresAt, creditsDeducted],
    )
  } catch (err) {
    // Refund credits if token storage failed
    if (creditsDeducted > 0 && !app.is_free) {
      await grantCredits(session.user.id, creditsDeducted, 'session_start_rollback')
    }
    logger.error({ msg: 'Failed to store embed token', error: err instanceof Error ? err.message : String(err), userId: session.user.id, appId })
    return NextResponse.json({ error: 'Failed to issue token' }, { status: 500 })
  }

  return NextResponse.json({ token, sessionId })
}
