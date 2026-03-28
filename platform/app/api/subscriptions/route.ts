import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { createOrder } from '@/lib/razorpay'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'

function getPlan(code: string): { credits: number; amountPaise: number } | null {
  if (code === 'credits_500') return { credits: 500, amountPaise: 19900 }
  if (code === 'credits_2000') return { credits: 2000, amountPaise: 59900 }
  if (code === 'credits_5000') return { credits: 5000, amountPaise: 129900 }
  return null
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const rl = await rateLimit(`sub:${session.user.id}`, 5, 300)
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  const body = await req.json() as { planCode?: string }
  const planCode = body.planCode ?? ''
  const plan = getPlan(planCode)
  if (!plan) {
    return NextResponse.json({ error: 'Invalid plan code' }, { status: 400 })
  }
  try {
    const order = await createOrder({
      amount: plan.amountPaise,
      currency: 'INR',
      notes: { userId: session.user.id, planCode },
    })
    logger.info({ msg: 'razorpay_order_created', userId: session.user.id, planCode, orderId: order.id })
    return NextResponse.json({ orderId: order.id, amount: plan.amountPaise, currency: 'INR' })
  } catch (err) {
    logger.error({ msg: 'razorpay_order_failed', userId: session.user.id, err: String(err) })
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
  }
}
