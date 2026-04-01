import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/middleware/require-admin'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export async function GET(): Promise<NextResponse> {
  const result = await requireAdmin()
  if (result instanceof NextResponse) return result

  const [users, apps, channels, credits, deployments] = await Promise.all([
    db.query<{ total: number; active30d: number; new_today: number }>(`
      SELECT
        COUNT(*)::INTEGER AS total,
        COUNT(CASE WHEN "createdAt" > NOW() - INTERVAL '30 days' THEN 1 END)::INTEGER AS active30d,
        COUNT(CASE WHEN DATE_TRUNC('day', "createdAt") = DATE_TRUNC('day', NOW()) THEN 1 END)::INTEGER AS new_today
      FROM public."user"
    `),
    db.query<{ total: number; live: number; draft: number }>(`
      SELECT
        COUNT(*)::INTEGER AS total,
        COUNT(CASE WHEN status = 'live' THEN 1 END)::INTEGER AS live,
        COUNT(CASE WHEN status = 'draft' THEN 1 END)::INTEGER AS draft
      FROM marketplace.apps WHERE deleted_at IS NULL
    `),
    db.query<{ total: number; superadmin: number }>(`
      SELECT COUNT(*)::INTEGER AS total,
             COUNT(CASE WHEN is_superadmin_channel THEN 1 END)::INTEGER AS superadmin
      FROM marketplace.channels WHERE deleted_at IS NULL
    `),
    db.query<{ issued_today: number; spent_today: number }>(`
      SELECT
        COALESCE(SUM(CASE WHEN delta > 0 AND DATE_TRUNC('day', created_at) = DATE_TRUNC('day', NOW()) THEN delta END), 0)::INTEGER AS issued_today,
        COALESCE(SUM(CASE WHEN delta < 0 AND DATE_TRUNC('day', created_at) = DATE_TRUNC('day', NOW()) THEN ABS(delta) END), 0)::INTEGER AS spent_today
      FROM subscriptions.credit_ledger
    `),
    db.query<{ total: number; running: number; failed: number }>(`
      SELECT
        COUNT(*)::INTEGER AS total,
        COUNT(CASE WHEN status = 'running' THEN 1 END)::INTEGER AS running,
        COUNT(CASE WHEN status = 'failed' THEN 1 END)::INTEGER AS failed
      FROM deployments.deployments
    `),
  ])

  logger.info({ msg: 'admin_stats_fetched' })
  return NextResponse.json({
    users: users.rows[0],
    apps: apps.rows[0],
    channels: channels.rows[0],
    credits: credits.rows[0],
    deployments: deployments.rows[0],
  })
}
