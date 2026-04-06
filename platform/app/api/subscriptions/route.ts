// platform/app/api/subscriptions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { PLANS, type PlanId } from '@/lib/pricing'
import { logger } from '@/lib/logger'
import { z } from 'zod'

// Razorpay REST API helpers (no SDK — uses lib/razorpay native fetch wrapper)
interface RazorpayKeys {
  keyId: string
  keySecret: string
}

function razorpayAuth({ keyId, keySecret }: RazorpayKeys): string {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`
}

interface RazorpaySubscription {
  id: string
  short_url: string
}

interface CreateSubscriptionParams {
  plan_id: string
  customer_notify: number
  quantity: number
  total_count: number
  notes: Record<string, string>
}

async function createSubscription(keys: RazorpayKeys, params: CreateSubscriptionParams): Promise<RazorpaySubscription> {
  const res = await fetch('https://api.razorpay.com/v1/subscriptions', {
    method: 'POST',
    headers: { Authorization: razorpayAuth(keys), 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(`Razorpay subscription create failed: ${await res.text()}`)
  return res.json() as Promise<RazorpaySubscription>
}

interface PlanSubscriptionRequest {
  razorpayPlanId: string
  razorpayOfferId: string
  userId: string
  planId: string
}

async function createPlanSubscription(keys: RazorpayKeys, req: PlanSubscriptionRequest): Promise<RazorpaySubscription> {
  const params: CreateSubscriptionParams & { offer_id?: string } = {
    plan_id: req.razorpayPlanId,
    customer_notify: 1,
    quantity: 1,
    total_count: 120, // 10 years max
    notes: { userId: req.userId, planId: req.planId },
  }
  if (req.razorpayOfferId) params.offer_id = req.razorpayOfferId
  return createSubscription(keys, params)
}

async function cancelSubscription(keys: RazorpayKeys, subscriptionId: string): Promise<void> {
  const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${subscriptionId}/cancel`, {
    method: 'POST',
    headers: { Authorization: razorpayAuth(keys), 'Content-Type': 'application/json' },
    body: JSON.stringify({ cancel_at_cycle_end: 1 }),
  })
  if (!res.ok) throw new Error(`Razorpay subscription cancel failed: ${await res.text()}`)
}

function getRazorpayKeys(): RazorpayKeys | null {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) return null
  return { keyId, keySecret }
}

const createSchema = z.object({
  planId: z.enum(['monthly', 'annual']),
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

async function requireKeysAndSession(request: NextRequest): Promise<
  { keys: RazorpayKeys; session: Awaited<ReturnType<typeof auth.api.getSession>> & object } | NextResponse
> {
  const keys = getRazorpayKeys()
  if (!keys) {
    logger.warn({ msg: 'razorpay_not_configured' })
    return NextResponse.json({ error: 'Payment not configured' }, { status: 503 })
  }
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return { keys, session }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireKeysAndSession(request)
  if (guard instanceof NextResponse) return guard
  const { keys, session } = guard

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
    // Idempotency: return existing pending/active subscription without creating a new one
    const existing = await db.query<{ razorpay_subscription_id: string; short_url: string | null }>(
      `SELECT razorpay_subscription_id FROM subscriptions.user_subscriptions
       WHERE user_id = $1 AND status IN ('pending', 'active') LIMIT 1`,
      [session.user.id],
    )
    if (existing.rows[0]) {
      const existingSubId = existing.rows[0].razorpay_subscription_id
      logger.info({ msg: 'subscription_already_exists', userId: session.user.id, subscriptionId: existingSubId })
      // Fetch the short_url from Razorpay for the existing subscription
      const rzpRes = await fetch(`https://api.razorpay.com/v1/subscriptions/${existingSubId}`, {
        headers: { Authorization: razorpayAuth(keys) },
      })
      if (rzpRes.ok) {
        const rzpData = await rzpRes.json() as { id: string; short_url: string }
        return NextResponse.json({ subscriptionId: rzpData.id, shortUrl: rzpData.short_url })
      }
    }

    const rzpSub = await createPlanSubscription(
      keys,
      { razorpayPlanId: plan.razorpayPlanId, razorpayOfferId: plan.razorpayOfferId, userId: session.user.id, planId },
    )

    await db.query(
      `INSERT INTO subscriptions.user_subscriptions
         (user_id, plan_id, razorpay_subscription_id, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (razorpay_subscription_id) DO NOTHING`,
      [session.user.id, planId, rzpSub.id],
    )

    logger.info({ msg: 'subscription_created', userId: session.user.id, planId, subscriptionId: rzpSub.id })

    return NextResponse.json({
      subscriptionId: rzpSub.id,
      shortUrl: rzpSub.short_url,
    })
  } catch (err) {
    logger.error({ msg: 'subscription_create_failed', userId: session.user.id, planId, err: String(err) })
    return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const guard = await requireKeysAndSession(request)
  if (guard instanceof NextResponse) return guard
  const { keys, session } = guard

  try {
    const result = await db.query<{ razorpay_subscription_id: string }>(
      `SELECT razorpay_subscription_id FROM subscriptions.user_subscriptions
       WHERE user_id = $1 AND status = 'active' LIMIT 1`,
      [session.user.id],
    )
    if (!result.rows[0]) {
      return NextResponse.json({ error: 'No active subscription' }, { status: 404 })
    }

    const razorpaySubId = result.rows[0].razorpay_subscription_id
    await cancelSubscription(keys, razorpaySubId)

    try {
      await db.query(
        `UPDATE subscriptions.user_subscriptions SET status = 'cancelled'
         WHERE razorpay_subscription_id = $1`,
        [razorpaySubId],
      )
    } catch (dbErr) {
      logger.error({
        msg: 'subscription_cancel_db_inconsistency',
        razorpaySubId,
        userId: session.user.id,
        err: String(dbErr),
        note: 'Razorpay cancel succeeded but local DB update failed — manual reconciliation required',
      })
      return NextResponse.json({ error: 'Subscription cancelled in payment provider but local state update failed' }, { status: 500 })
    }

    logger.info({ msg: 'subscription_cancelled', userId: session.user.id, razorpaySubId })

    return NextResponse.json({ message: 'Subscription cancelled at period end' })
  } catch (err) {
    logger.error({ msg: 'subscription_cancel_failed', userId: session.user.id, err: String(err) })
    return NextResponse.json({ error: 'Failed to cancel subscription' }, { status: 500 })
  }
}
