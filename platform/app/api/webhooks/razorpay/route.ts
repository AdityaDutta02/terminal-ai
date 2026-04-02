import { NextRequest, NextResponse } from 'next/server'
import { db, withTransaction } from '@/lib/db'
import { grantCredits } from '@/lib/credits'
import { logger } from '@/lib/logger'
import crypto from 'crypto'

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex')
  const expectedBuf = Buffer.from(expected)
  const signatureBuf = Buffer.from(signature)
  if (expectedBuf.length !== signatureBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, signatureBuf)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text()
  const signature = request.headers.get('x-razorpay-signature') ?? ''
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET

  if (!secret) {
    logger.error({ msg: 'razorpay_webhook_secret_not_configured' })
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  if (!verifySignature(body, signature, secret)) {
    logger.warn({ msg: 'razorpay_webhook_invalid_signature' })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external webhook payload
  const event = JSON.parse(body) as { event: string; payload: any }

  logger.info({ msg: 'razorpay_webhook_received', event: event.event })

  switch (event.event) {
    case 'payment.captured': {
      await handlePaymentCaptured(event.payload)
      break
    }
    case 'subscription.activated': {
      await handleSubscriptionActivated(event.payload)
      break
    }
    case 'subscription.charged': {
      await handleSubscriptionCharged(event.payload)
      break
    }
    case 'subscription.cancelled':
    case 'subscription.completed': {
      await handleSubscriptionEnded(event.payload)
      break
    }
    case 'subscription.halted': {
      await handleSubscriptionHalted(event.payload)
      break
    }
    case 'payment.failed': {
      await handlePaymentFailed(event.payload)
      break
    }
    default:
      // Unknown event — acknowledge receipt
      break
  }

  return NextResponse.json({ received: true })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePaymentCaptured(payload: any): Promise<void> {
  const payment = payload.payment?.entity
  if (!payment || payment.status !== 'captured') return

  // Use transaction + FOR UPDATE to prevent double-crediting on concurrent delivery
  await withTransaction(async (client) => {
    const packResult = await client.query<{ user_id: string; credits: number; pack_id: string }>(
      `SELECT user_id, credits, pack_id FROM subscriptions.credit_pack_purchases
       WHERE razorpay_order_id = $1 AND status = 'pending'
       FOR UPDATE`,
      [payment.order_id],
    )
    if (!packResult.rows[0]) return

    const { user_id, credits, pack_id } = packResult.rows[0]

    await client.query(
      `UPDATE subscriptions.credit_pack_purchases
       SET status = 'completed', razorpay_payment_id = $1
       WHERE razorpay_order_id = $2`,
      [payment.id, payment.order_id],
    )

    await grantCredits(user_id, credits, `credit_pack_${pack_id}`, client)

    // Send payment confirmation email (non-blocking)
    const userResult = await client.query<{ email: string }>(
      `SELECT email FROM "user" WHERE id = $1`, [user_id],
    )
    if (userResult.rows[0]) {
      const { sendPaymentConfirmationEmail } = await import('@/lib/email')
      const amountInr = (payment.amount / 100).toString()
      sendPaymentConfirmationEmail(userResult.rows[0].email, amountInr, credits, 'credit_pack')
        .catch((err: unknown) => logger.error({ msg: 'payment_email_failed', err: String(err) }))
    }
  })
}

interface SubscriptionRow {
  user_id: string
  plan_id: string
  credits_per_month: number
}


interface SubscriptionEntity {
  id: string
  current_start: number
  current_end: number
}

async function grantPeriodCredits(
  sub: SubscriptionEntity,
  creditReasonPrefix: 'subscription_activation' | 'subscription_renewal',
  setActive: boolean,
): Promise<void> {
  // Use transaction + FOR UPDATE to prevent double-crediting on concurrent delivery
  await withTransaction(async (client) => {
    const result = await client.query<SubscriptionRow>(
      `SELECT us.user_id, us.plan_id, p.credits_per_month
       FROM subscriptions.user_subscriptions us
       JOIN subscriptions.plans p ON p.id = us.plan_id
       WHERE us.razorpay_subscription_id = $1
       FOR UPDATE`,
      [sub.id],
    )
    const row = result.rows[0]
    if (!row) return

    const { user_id, plan_id, credits_per_month } = row

    // Always update period timestamps
    await client.query(
      `UPDATE subscriptions.user_subscriptions
       SET current_period_start = TO_TIMESTAMP($2),
           current_period_end = TO_TIMESTAMP($3),
           credits_granted_at = NOW(),
           updated_at = NOW()
       WHERE razorpay_subscription_id = $1`,
      [sub.id, sub.current_start, sub.current_end],
    )

    // Set status to active only on activation
    if (setActive) {
      await client.query(
        `UPDATE subscriptions.user_subscriptions
         SET status = 'active', updated_at = NOW()
         WHERE razorpay_subscription_id = $1`,
        [sub.id],
      )
    }

    await grantCredits(user_id, credits_per_month, `${creditReasonPrefix}_${plan_id}`, client)
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSubscriptionActivated(payload: any): Promise<void> {
  const sub: SubscriptionEntity | undefined = payload.subscription?.entity
  if (!sub) return
  await grantPeriodCredits(sub, 'subscription_activation', true)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSubscriptionCharged(payload: any): Promise<void> {
  const sub: SubscriptionEntity | undefined = payload.subscription?.entity
  if (!sub) return
  await grantPeriodCredits(sub, 'subscription_renewal', false)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSubscriptionEnded(payload: any): Promise<void> {
  const sub = payload.subscription?.entity
  if (!sub) return

  await db.query(
    `UPDATE subscriptions.user_subscriptions
     SET status = 'cancelled', updated_at = NOW()
     WHERE razorpay_subscription_id = $1`,
    [sub.id],
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSubscriptionHalted(payload: any): Promise<void> {
  const sub = payload.subscription?.entity
  if (!sub) return

  await db.query(
    `UPDATE subscriptions.user_subscriptions
     SET status = 'paused', updated_at = NOW()
     WHERE razorpay_subscription_id = $1`,
    [sub.id],
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePaymentFailed(payload: any): Promise<void> {
  const payment = payload.payment?.entity
  if (!payment) return

  const result = await db.query<{ user_id: string; email: string }>(
    `SELECT cpp.user_id, u.email
     FROM subscriptions.credit_pack_purchases cpp
     JOIN "user" u ON u.id = cpp.user_id
     WHERE cpp.razorpay_order_id = $1`,
    [payment.order_id],
  )

  if (result.rows[0]) {
    const { sendPaymentFailedEmail } = await import('@/lib/email')
    await sendPaymentFailedEmail(result.rows[0].email).catch((err: unknown) => {
      logger.error({ msg: 'payment_failed_email_send_error', err: String(err) })
    })
  }

  logger.warn({ msg: 'payment_failed', orderId: payment.order_id, reason: payment.error_description })
}
