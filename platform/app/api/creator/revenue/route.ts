import { NextResponse } from 'next/server'
import { requireCreator } from '@/lib/middleware/require-creator'
import { db } from '@/lib/db'

export async function GET() {
  const result = await requireCreator()
  if (result instanceof NextResponse) return result
  const { channel } = result

  const history = await db.query<{
    month: string
    sessions: number
    credits_spent: number
  }>(
    `SELECT TO_CHAR(DATE_TRUNC('month', au.day), 'YYYY-MM') AS month,
            SUM(au.sessions)::INTEGER AS sessions,
            SUM(au.credits_spent)::INTEGER AS credits_spent
     FROM analytics.app_usage au
     JOIN marketplace.apps a ON a.id = au.app_id
     WHERE a.channel_id = $1
     GROUP BY DATE_TRUNC('month', au.day)
     ORDER BY month DESC
     LIMIT 12`,
    [channel.id],
  )

  const monthHistory = history.rows.map(row => ({
    month: row.month,
    sessions: row.sessions,
    creatorShare: Math.floor(row.credits_spent * 0.5),
    inrEquivalent: Math.floor(row.credits_spent * 0.5 * 30),
  }))

  return NextResponse.json({
    balance: {
      credits: channel.creator_balance,
      inrEquivalent: Math.floor(channel.creator_balance * 30),
    },
    history: monthHistory,
  })
}
