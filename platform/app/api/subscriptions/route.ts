// platform/app/api/subscriptions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { PLANS, type PlanId } from '@/lib/pricing'
import { logger } from '@/lib/logger'
import { z } from 'zod'

// Razorpay REST API helpers (no SDK — uses lib/razorpay native fetch wrapper)
const KEY_ID = process.env.RAZORPAY_KEY_ID ?? ''
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? ''

function razorpayAuth(): string {
  return `Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')}`
}

interface RazorpaySubscription {
  id: string
  short_url: string
}

async function createSubscription(params: {
  plan_id: string
  customer_notify: number
  quantity: number
  total_count: number
  notes: Record<string, string>
}): Promise<RazorpaySubscription> {
  const res = await fetch('https://api.razorpay.com/v1/subscriptions', {
    method: 'POST',
    headers: { Authorization: razorpayAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(`Razorpay subscription create failed: ${await res.text()}`)
  return res.json() as Promise<RazorpaySubscription>
}

async function cancelSubscription(subscriptionId: string): Promise<void> {
  const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${subscriptionId}/cancel`, {
    method: 'POST',
    headers: { Authorization: razorpayAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ cancel_at_cycle_end: 1 }),
  })
  if (!res.ok) throw new Error(`Razorpay subscription cancel failed: ${await res.text()}`)
}

const createSchema = z.object({
  planId: z.enum(['starter', 'creator', 'pro']),
})

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const result = await db.query(
      `SELECT us.plan_id, us.status, us.current_period_start, us.current_period_end,
              p.name, p.price_inr, p.credits_per_month
       FROM subscriptions.user_subscriptions us
       JOIN subscriptions.plans p ON p.id = us.plan_id
       WHERE us.user_id = $1
       ORDER BY us.created_at DESC LIMIT 1`,
      [session.user.id],
    )

    return NextResponse.json({ subscription: result.rows[0] ?? null })
  } catch (err) {
    logger.error({ msg: 'subscription_fetch_failed', userId: session.user.id, err: String(err) })
    return NextResponse.json({ error: 'Failed to fetch subscription' }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = createSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid plan', details: parsed.error.flatten() }, { status: 400 })
  }
  const { planId } = parsed.data
  const plan = PLANS[planId as PlanId]

  if (!plan.razorpayPlanId) {
    return NextResponse.json({ error: 'Subscription not configured' }, { status: 503 })
  }

  try {
    const subscription = await createSubscription({
      plan_id: plan.razorpayPlanId,
      customer_notify: 1,
      quantity: 1,
      total_count: 120, // 10 years max
      notes: { userId: session.user.id, planId },
    })

    await db.query(
      `INSERT INTO subscriptions.user_subscriptions
         (user_id, plan_id, razorpay_subscription_id, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (razorpay_subscription_id) DO NOTHING`,
      [session.user.id, planId, subscription.id],
    )

    logger.info({ msg: 'subscription_created', userId: session.user.id, planId, subscriptionId: subscription.id })

    return NextResponse.json({
      subscriptionId: subscription.id,
      shortUrl: subscription.short_url,
    })
  } catch (err) {
    logger.error({ msg: 'subscription_create_failed', userId: session.user.id, planId, err: String(err) })
    return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const result = await db.query(
      `SELECT razorpay_subscription_id FROM subscriptions.user_subscriptions
       WHERE user_id = $1 AND status = 'active' LIMIT 1`,
      [session.user.id],
    )
    if (!result.rows[0]) {
      return NextResponse.json({ error: 'No active subscription' }, { status: 404 })
    }

    await cancelSubscription(result.rows[0].razorpay_subscription_id)

    await db.query(
      `UPDATE subscriptions.user_subscriptions SET status = 'cancelled'
       WHERE razorpay_subscription_id = $1`,
      [result.rows[0].razorpay_subscription_id],
    )

    logger.info({ msg: 'subscription_cancelled', userId: session.user.id })

    return NextResponse.json({ message: 'Subscription cancelled at period end' })
  } catch (err) {
    logger.error({ msg: 'subscription_cancel_failed', userId: session.user.id, err: String(err) })
    return NextResponse.json({ error: 'Failed to cancel subscription' }, { status: 500 })
  }
}
