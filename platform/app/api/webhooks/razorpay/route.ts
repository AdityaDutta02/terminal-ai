import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { grantCredits } from '@/lib/credits'
import { logger } from '@/lib/logger'
import crypto from 'crypto'

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
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

  const packResult = await db.query<{ user_id: string; credits: number; pack_id: string }>(
    `SELECT user_id, credits, pack_id FROM subscriptions.credit_pack_purchases
     WHERE razorpay_order_id = $1 AND status = 'pending'`,
    [payment.order_id],
  )
  if (!packResult.rows[0]) return

  const { user_id, credits, pack_id } = packResult.rows[0]

  await grantCredits(user_id, credits, `credit_pack_${pack_id}`)

  await db.query(
    `UPDATE subscriptions.credit_pack_purchases
     SET status = 'completed', razorpay_payment_id = $1
     WHERE razorpay_order_id = $2`,
    [payment.id, payment.order_id],
  )
}

interface SubscriptionRow {
  user_id: string
  plan_id: string
  credits_per_month: number
}

async function fetchSubscriptionRow(razorpaySubscriptionId: string): Promise<SubscriptionRow | null> {
  const result = await db.query<SubscriptionRow>(
    `SELECT us.user_id, us.plan_id, p.credits_per_month
     FROM subscriptions.user_subscriptions us
     JOIN subscriptions.plans p ON p.id = us.plan_id
     WHERE us.razorpay_subscription_id = $1`,
    [razorpaySubscriptionId],
  )
  return result.rows[0] ?? null
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
  const row = await fetchSubscriptionRow(sub.id)
  if (!row) return

  const { user_id, plan_id, credits_per_month } = row

  await grantCredits(user_id, credits_per_month, `${creditReasonPrefix}_${plan_id}`)

  const statusClause = setActive ? `status = 'active',` : ''
  await db.query(
    `UPDATE subscriptions.user_subscriptions
     SET ${statusClause}
         current_period_start = TO_TIMESTAMP($2),
         current_period_end = TO_TIMESTAMP($3),
         credits_granted_at = NOW(),
         updated_at = NOW()
     WHERE razorpay_subscription_id = $1`,
    [sub.id, sub.current_start, sub.current_end],
  )
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
