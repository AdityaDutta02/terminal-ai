// platform/app/api/embed-token/preview/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
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

  // Check: has this IP+cookie already used this app for free?
  const existingUsage = await db.query(
    `SELECT id FROM gateway.anonymous_usage
     WHERE app_id = $1 AND ip_address = $2 AND cookie_id = $3`,
    [appId, ip, cookieId],
  )
  if (existingUsage.rows[0]) {
    return NextResponse.json({
      error: 'Free usage already used. Sign up for more credits.',
      code: 'ANON_LIMIT_REACHED',
    }, { status: 402 })
  }

  // For free apps: deduct from creator_balance
  if (app.is_free && app.credits_per_session > 0) {
    if (app.creator_balance < app.credits_per_session) {
      return NextResponse.json({ error: 'This app is temporarily unavailable' }, { status: 402 })
    }
    await db.query(
      `UPDATE marketplace.channels
       SET creator_balance = creator_balance - $1
       WHERE id = (SELECT channel_id FROM marketplace.apps WHERE id = $2)
         AND creator_balance >= $1`,
      [app.credits_per_session, appId],
    )
  }

  // Record anonymous usage
  await db.query(
    `INSERT INTO gateway.anonymous_usage (app_id, ip_address, cookie_id)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [appId, ip, cookieId],
  )

  const sessionId = randomUUID()
  const expiresAt = new Date(Date.now() + FIFTEEN_MINUTES)

  const token = await new SignJWT({
    userId: null,
    appId,
    sessionId,
    creditsDeducted: app.is_free ? app.credits_per_session : 0,
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
    [null, appId, sessionId, tokenHash, expiresAt, app.is_free ? app.credits_per_session : 0],
  )

  return NextResponse.json({ token, sessionId })
}
