import { NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/razorpay'
import { grantCredits } from '@/lib/credits'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

const PLAN_CREDITS: Record<string, number> = {
  credits_500: 500,
  credits_2000: 2000,
  credits_5000: 5000,
}

export async function POST(req: Request): Promise<NextResponse> {
  const body = await req.text()
  const signature = req.headers.get('x-razorpay-signature') ?? ''
  if (!verifyWebhookSignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }
  const event = JSON.parse(body) as Record<string, unknown>
  const payment = (event.payload as Record<string, unknown>)?.payment as Record<string, unknown> | undefined
  const entity = payment?.entity as Record<string, string | number | Record<string, string>> | undefined
  const eventId = (entity?.id as string) ?? null
  if (!eventId) {
    return NextResponse.json({ ok: true, skipped: true })
  }
  // Idempotency: skip if already processed
  const existing = await db.query(
    `SELECT id FROM subscriptions.webhook_events WHERE source = 'razorpay' AND event_id = $1`,
    [eventId],
  )
  if (existing.rows.length > 0) {
    return NextResponse.json({ ok: true, duplicate: true })
  }
  await db.query(
    `INSERT INTO subscriptions.webhook_events (source, event_id, payload) VALUES ('razorpay', $1, $2)`,
    [eventId, event],
  )
  if (event.event === 'payment.captured') {
    const notes = entity?.notes as Record<string, string> | undefined
    const { userId, planCode } = notes ?? {}
    const credits = planCode ? (PLAN_CREDITS[planCode] ?? 0) : 0
    if (userId && credits > 0) {
      await grantCredits(userId, credits, 'topup')
      logger.info({ msg: 'credits_granted', userId, credits, planCode, paymentId: eventId })
    }
  }
  return NextResponse.json({ ok: true })
}
