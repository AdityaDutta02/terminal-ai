// platform/app/api/embed-token/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
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
  const isAdmin = (session.user as Record<string, unknown>).role === 'admin'

  // Check balance is sufficient (but don't deduct yet — deduction happens on first API call)
  if (!isAdmin && !app.is_free && app.credits_per_session > 0) {
    const balanceResult = await db.query<{ balance: number }>(
      `SELECT COALESCE(SUM(delta), 0) AS balance FROM subscriptions.credit_ledger WHERE user_id = $1`,
      [session.user.id],
    )
    const balance = balanceResult.rows[0]?.balance ?? 0
    if (balance < app.credits_per_session) {
      return NextResponse.json(
        { error: 'Insufficient credits', redirect: '/pricing?reason=insufficient_credits' },
        { status: 402 },
      )
    }
  }

  const sessionId = randomUUID()
  const expiresAt = new Date(Date.now() + FIFTEEN_MINUTES)

  const creditsPerCall = isAdmin ? 0 : app.credits_per_session

  const token = await new SignJWT({
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

  try {
    await db.query(
      `INSERT INTO gateway.embed_tokens
         (user_id, app_id, session_id, token_hash, expires_at, credits_deducted, deducted_at)
       VALUES ($1, $2, $3, $4, $5, 0, NOW())`,
      [session.user.id, appId, sessionId, tokenHash, expiresAt],
    )
  } catch (err) {
    logger.error({ msg: 'Failed to store embed token', error: err instanceof Error ? err.message : String(err), userId: session.user.id, appId })
    return NextResponse.json({ error: 'Failed to issue token' }, { status: 500 })
  }

  return NextResponse.json({ token, sessionId })
}
