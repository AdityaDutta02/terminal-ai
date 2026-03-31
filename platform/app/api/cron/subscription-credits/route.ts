import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { grantCredits } from '@/lib/credits'
import { logger } from '@/lib/logger'

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization')
  return authHeader === `Bearer ${process.env.CRON_SECRET}`
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const runId = crypto.randomUUID()
  await db.query(
    `INSERT INTO platform.cron_runs (id, job_name) VALUES ($1, 'subscription-credits')`,
    [runId],
  )

  try {
    // Find active subscriptions that haven't received credits for current period
    const subscriptions = await db.query<{
      user_id: string
      plan_id: string
      credits_per_month: number
      razorpay_subscription_id: string
    }>(
      `SELECT us.user_id, us.plan_id, p.credits_per_month,
              us.razorpay_subscription_id
       FROM subscriptions.user_subscriptions us
       JOIN subscriptions.plans p ON p.id = us.plan_id
       WHERE us.status = 'active'
         AND (
           us.credits_granted_at IS NULL
           OR us.credits_granted_at < us.current_period_start
         )`,
    )

    let rowsAffected = 0
    for (const sub of subscriptions.rows) {
      await grantCredits(sub.user_id, sub.credits_per_month, `subscription_renewal_${sub.plan_id}`)
      await db.query(
        `UPDATE subscriptions.user_subscriptions
         SET credits_granted_at = NOW()
         WHERE razorpay_subscription_id = $1`,
        [sub.razorpay_subscription_id],
      )
      rowsAffected++
    }

    await db.query(
      `UPDATE platform.cron_runs
       SET status = 'completed', completed_at = NOW(), rows_affected = $1
       WHERE id = $2`,
      [rowsAffected, runId],
    )

    logger.info({ msg: 'cron_subscription_credits_complete', rowsAffected, runId })
    return NextResponse.json({ processed: rowsAffected })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    logger.error({ msg: 'cron_subscription_credits_failed', runId, err })
    await db.query(
      `UPDATE platform.cron_runs SET status = 'failed', completed_at = NOW(), error = $1 WHERE id = $2`,
      [error, runId],
    )
    return NextResponse.json({ error }, { status: 500 })
  }
}
