import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/middleware/require-admin'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export async function GET(): Promise<NextResponse> {
  const result = await requireAdmin()
  if (result instanceof NextResponse) return result

  try {
    const channels = await db.query(
      `SELECT c.id, c.name, c.slug, c.is_superadmin_channel, c.creator_balance, c.created_at,
              u.email AS owner_email, u.name AS owner_name,
              COUNT(DISTINCT a.id)::INTEGER AS apps_count,
              EXISTS(SELECT 1 FROM platform.channel_suspensions cs WHERE cs.channel_id = c.id AND cs.is_active = true) AS is_suspended
       FROM marketplace.channels c
       JOIN public."user" u ON u.id = c.creator_id
       LEFT JOIN marketplace.apps a ON a.channel_id = c.id AND a.deleted_at IS NULL
       WHERE c.deleted_at IS NULL
       GROUP BY c.id, u.email, u.name
       ORDER BY c.created_at DESC`,
    )
    logger.info({ msg: 'admin_channels_listed', count: channels.rows.length })
    return NextResponse.json({ channels: channels.rows })
  } catch (err) {
    logger.error({ msg: 'admin_channels_list_failed', err: String(err) })
    return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 })
  }
}
