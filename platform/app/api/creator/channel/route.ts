import { NextRequest, NextResponse } from 'next/server'
import { requireCreator } from '@/lib/middleware/require-creator'
import { db } from '@/lib/db'
import { z } from 'zod'

export async function GET() {
  const result = await requireCreator()
  if (result instanceof NextResponse) return result
  const { channel } = result

  const [statsResult, appsResult] = await Promise.all([
    db.query<{ sessions: number; credits_spent: number }>(
      `SELECT COALESCE(SUM(sessions), 0)::INTEGER AS sessions,
              COALESCE(SUM(credits_spent), 0)::INTEGER AS credits_spent
       FROM analytics.app_usage au
       JOIN marketplace.apps a ON a.id = au.app_id
       WHERE a.channel_id = $1
         AND au.day >= NOW() - INTERVAL '30 days'`,
      [channel.id],
    ),
    db.query<{ count: number }>(
      `SELECT COUNT(*)::INTEGER AS count FROM marketplace.apps
       WHERE channel_id = $1 AND deleted_at IS NULL`,
      [channel.id],
    ),
  ])

  const stats = statsResult.rows[0] ?? { sessions: 0, credits_spent: 0 }
  const inrEquivalent = Math.floor(channel.creator_balance * 30)  // approx ₹0.30 per credit

  return NextResponse.json({
    channel: {
      ...channel,
      appsCount: appsResult.rows[0]?.count ?? 0,
    },
    stats: {
      totalSessions: stats.sessions,
      creditsEarned: channel.creator_balance,
      inrEquivalent,
    },
  })
}

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
})

export async function PATCH(request: NextRequest) {
  const result = await requireCreator()
  if (result instanceof NextResponse) return result
  const { channel } = result

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.flatten() }, { status: 400 })
  }

  const { name, description } = parsed.data
  if (name) {
    await db.query(
      `UPDATE marketplace.channels SET name = $1 WHERE id = $2`,
      [name, channel.id],
    )
  }
  if (description !== undefined) {
    await db.query(
      `UPDATE marketplace.channels SET description = $1 WHERE id = $2`,
      [description, channel.id],
    )
  }

  return NextResponse.json({ success: true })
}
