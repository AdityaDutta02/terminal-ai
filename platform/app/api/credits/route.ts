// platform/app/api/credits/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { getBalance } from '@/lib/credits'
import { createOrder } from '@/lib/razorpay'
import { CREDIT_PACKS, type CreditPackId } from '@/lib/pricing'
import { logger } from '@/lib/logger'
import { z } from 'zod'
import { checkRateLimit, rateLimitResponse } from '@/lib/middleware/rate-limit'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const balance = await getBalance(session.user.id)

    const history = await db.query(
      `SELECT delta, balance_after, reason, created_at
       FROM subscriptions.credit_ledger
       WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 20`,
      [session.user.id],
    )

    return NextResponse.json({ balance, history: history.rows })
  } catch (err) {
    logger.error({ msg: 'credits_fetch_failed', userId: session.user.id, err: String(err) })
    return NextResponse.json({ error: 'Failed to fetch credits' }, { status: 500 })
  }
}

const purchaseSchema = z.object({
  packId: z.enum(['pack_100', 'pack_500', 'pack_2000']),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  const keyId = process.env.RAZORPAY_KEY_ID
  if (!keyId) {
    logger.warn({ msg: 'razorpay_not_configured' })
    return NextResponse.json({ error: 'Payment not configured' }, { status: 503 })
  }

  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await checkRateLimit(`credits:${session.user.id}`, 3, 60_000)
  if (!allowed) return rateLimitResponse()

  const parsed = purchaseSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid pack', details: parsed.error.flatten() }, { status: 400 })
  }
  const { packId } = parsed.data
  const pack = CREDIT_PACKS[packId as CreditPackId]

  try {
    const order = await createOrder({
      amount: pack.priceInr * 100, // paise
      currency: 'INR',
      notes: { userId: session.user.id, packId, credits: String(pack.credits) },
    })

    await db.query(
      `INSERT INTO subscriptions.credit_pack_purchases
         (user_id, pack_id, credits, price_inr, razorpay_order_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [session.user.id, packId, pack.credits, pack.priceInr, order.id],
    )

    logger.info({ msg: 'credit_pack_order_created', userId: session.user.id, packId, orderId: order.id })

    return NextResponse.json({
      orderId: order.id,
      amount: pack.priceInr * 100,
      currency: 'INR',
      keyId,
    })
  } catch (err) {
    logger.error({ msg: 'credit_pack_order_failed', userId: session.user.id, packId, err: String(err) })
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
  }
}
