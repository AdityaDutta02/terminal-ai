// platform/app/api/embed-token/preview/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { SignJWT } from 'jose'
import { createHash, randomUUID } from 'crypto'
import { z } from 'zod'

const FIFTEEN_MINUTES = 15 * 60 * 1000

function getSecret(): Uint8Array {
  const secret = process.env.EMBED_TOKEN_SECRET
  if (!secret) throw new Error('EMBED_TOKEN_SECRET env var is not set')
  return Buffer.from(secret, 'utf-8')
}

const bodySchema = z.object({
  appId: z.string().uuid(),
  cookieId: z.string().min(1).max(64),
})

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const { appId, cookieId } = parsed.data

  // Get IP from Traefik header
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0'

  // Fetch app
  const appResult = await db.query<{
    id: string
    credits_per_session: number
    is_free: boolean
    creator_balance: number
  }>(
    `SELECT a.id, a.credits_per_session, a.is_free, c.creator_balance
     FROM marketplace.apps a
     JOIN marketplace.channels c ON c.id = a.channel_id
     WHERE a.id = $1 AND a.status = 'live' AND a.deleted_at IS NULL`,
    [appId],
  )
  if (!appResult.rows[0]) {
    return NextResponse.json({ error: 'App not found' }, { status: 404 })
  }

  const app = appResult.rows[0]

  // Block anonymous users from non-free apps
  if (!app.is_free) {
    return NextResponse.json({ error: 'Sign in to use this app' }, { status: 401 })
  }

  // Insert-first dedup: attempt to record usage before touching creator_balance.
  // ON CONFLICT means rowCount=0 if this IP+cookie already used this app → return 402 without deducting.
  // This eliminates the SELECT-then-UPDATE race where two concurrent requests both pass the old SELECT check.
  const usageInsert = await db.query(
    `INSERT INTO gateway.anonymous_usage (app_id, ip_address, cookie_id)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [appId, ip, cookieId],
  )
  if (usageInsert.rowCount === 0) {
    logger.info({ msg: 'Anonymous usage limit reached', appId, ip })
    return NextResponse.json({
      error: 'Free usage already used. Sign up for more credits.',
      code: 'ANON_LIMIT_REACHED',
    }, { status: 402 })
  }

  // Usage slot claimed — now deduct creator_balance atomically
  if (app.credits_per_session > 0) {
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
  }

  const sessionId = randomUUID()
  const expiresAt = new Date(Date.now() + FIFTEEN_MINUTES)

  const token = await new SignJWT({
    userId: null,
    appId,
    sessionId,
    creditsDeducted: app.credits_per_session,
    isAnon: true,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(getSecret())

  const tokenHash = createHash('sha256').update(token).digest('hex')

  await db.query(
    `INSERT INTO gateway.embed_tokens
       (user_id, app_id, session_id, token_hash, expires_at, credits_deducted, deducted_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [null, appId, sessionId, tokenHash, expiresAt, app.credits_per_session],
  )

  return NextResponse.json({ token, sessionId })
}
