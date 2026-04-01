import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/middleware/require-admin'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { z } from 'zod'

const banSchema = z.object({
  reason: z.string().min(1).max(500),
  durationDays: z.number().int().positive().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const result = await requireAdmin()
  if (result instanceof NextResponse) return result
  const { session } = result
  const { userId } = await params

  const parsed = banSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.flatten() }, { status: 400 })
  }
  const { reason, durationDays } = parsed.data

  const expiresAt = durationDays
    ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
    : null

  try {
    await db.query(
      `INSERT INTO platform.user_bans (user_id, reason, banned_by, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [userId, reason, session.user.id, expiresAt],
    )
    await db.query(
      `INSERT INTO audit.events (actor_id, action, resource, resource_id, metadata)
       VALUES ($1, 'ban_user', 'user', $2, $3)`,
      [session.user.id, userId, JSON.stringify({ reason, durationDays })],
    )
    logger.info({ msg: 'admin_user_banned', userId, bannedBy: session.user.id, durationDays })
    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error({ msg: 'admin_ban_failed', userId, err: String(err) })
    return NextResponse.json({ error: 'Ban failed' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const result = await requireAdmin()
  if (result instanceof NextResponse) return result
  const { session } = result
  const { userId } = await params

  try {
    await db.query(
      `UPDATE platform.user_bans SET is_active = false WHERE user_id = $1 AND is_active = true`,
      [userId],
    )
    logger.info({ msg: 'admin_user_unbanned', userId, unbannedBy: session.user.id })
    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error({ msg: 'admin_unban_failed', userId, err: String(err) })
    return NextResponse.json({ error: 'Unban failed' }, { status: 500 })
  }
}
