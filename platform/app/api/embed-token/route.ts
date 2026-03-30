import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { SignJWT } from 'jose'
import { createHash, randomUUID } from 'crypto'

const SECRET = new TextEncoder().encode(process.env.EMBED_TOKEN_SECRET!)

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { appId } = await request.json() as { appId: string }
  if (!appId) return NextResponse.json({ error: 'appId required' }, { status: 400 })

  // Verify app exists and is live
  const appResult = await db.query<{ id: string; credits_per_session: number }>(
    `SELECT id, credits_per_session FROM marketplace.apps WHERE id = $1 AND status = 'live' AND deleted_at IS NULL`,
    [appId]
  )
  if (!appResult.rows[0]) return NextResponse.json({ error: 'App not found' }, { status: 404 })

  // Check user has enough credits — read from ledger (source of truth), fall back to user.credits for users with no ledger entries
  const creditsResult = await db.query<{ credits: number }>(
    `SELECT COALESCE(
       (SELECT balance_after FROM subscriptions.credit_ledger
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1),
       (SELECT credits FROM "user" WHERE id = $1),
       0
     ) AS credits`,
    [session.user.id]
  )
  const credits = creditsResult.rows[0]?.credits ?? 0
  const required = appResult.rows[0].credits_per_session
  if (credits < required) {
    return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
  }

  const sessionId = randomUUID()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

  const token = await new SignJWT({ userId: session.user.id, appId, sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(SECRET)

  const tokenHash = createHash('sha256').update(token).digest('hex')

  await db.query(
    `INSERT INTO gateway.embed_tokens (user_id, app_id, session_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [session.user.id, appId, sessionId, tokenHash, expiresAt]
  )

  return NextResponse.json({ token, sessionId })
}
