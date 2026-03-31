import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
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
    `INSERT INTO platform.cron_runs (id, job_name) VALUES ($1, 'creator-revenue')`,
    [runId],
  )

  try {
    // Sum credits spent per channel this month (non-superadmin channels only)
    const channelRevenue = await db.query<{
      channel_id: string
      credits_spent: number
    }>(
      `SELECT a.channel_id, SUM(ac.credits_charged)::INTEGER AS credits_spent
       FROM gateway.api_calls ac
       JOIN marketplace.apps a ON a.id = ac.app_id
       JOIN marketplace.channels c ON c.id = a.channel_id
       WHERE ac.created_at >= DATE_TRUNC('month', NOW())
         AND ac.status = 'ok'
         AND c.is_superadmin_channel = false
       GROUP BY a.channel_id`,
    )

    let rowsAffected = 0
    for (const row of channelRevenue.rows) {
      const creatorShare = Math.floor(row.credits_spent * 0.5)
      if (creatorShare > 0) {
        await db.query(
          `UPDATE marketplace.channels
           SET creator_balance = creator_balance + $1
           WHERE id = $2`,
          [creatorShare, row.channel_id],
        )
        rowsAffected++
      }
    }

    await db.query(
      `UPDATE platform.cron_runs
       SET status = 'completed', completed_at = NOW(), rows_affected = $1
       WHERE id = $2`,
      [rowsAffected, runId],
    )

    logger.info({ msg: 'cron_creator_revenue_complete', rowsAffected, runId })
    return NextResponse.json({ channels_updated: rowsAffected })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    logger.error({ msg: 'cron_creator_revenue_failed', runId, err })
    await db.query(
      `UPDATE platform.cron_runs SET status = 'failed', completed_at = NOW(), error = $1 WHERE id = $2`,
      [error, runId],
    )
    return NextResponse.json({ error }, { status: 500 })
  }
}
