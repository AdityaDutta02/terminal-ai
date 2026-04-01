import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/middleware/require-admin'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { z } from 'zod'

const patchSchema = z.object({
  is_superadmin_channel: z.boolean().optional(),
  is_suspended: z.boolean().optional(),
  suspension_reason: z.string().min(1).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
): Promise<NextResponse> {
  const result = await requireAdmin()
  if (result instanceof NextResponse) return result
  const { session } = result
  const { channelId } = await params

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.flatten() }, { status: 400 })
  }

  const { is_superadmin_channel, is_suspended, suspension_reason } = parsed.data

  try {
    if (is_superadmin_channel !== undefined) {
      await db.query(
        `UPDATE marketplace.channels SET is_superadmin_channel = $1 WHERE id = $2`,
        [is_superadmin_channel, channelId],
      )
      await db.query(
        `INSERT INTO audit.events (actor_id, action, resource, resource_id, metadata)
         VALUES ($1, 'toggle_superadmin_channel', 'channel', $2, $3)`,
        [session.user.id, channelId, JSON.stringify({ is_superadmin_channel })],
      )
      logger.info({ msg: 'admin_channel_superadmin_toggled', channelId, is_superadmin_channel })
    }

    if (is_suspended !== undefined) {
      if (is_suspended) {
        if (!suspension_reason) {
          return NextResponse.json({ error: 'suspension_reason required' }, { status: 400 })
        }
        await db.query(
          `INSERT INTO platform.channel_suspensions (channel_id, reason, suspended_by)
           VALUES ($1, $2, $3)`,
          [channelId, suspension_reason, session.user.id],
        )
        logger.info({ msg: 'admin_channel_suspended', channelId, suspendedBy: session.user.id })
      } else {
        await db.query(
          `UPDATE platform.channel_suspensions SET is_active = false, lifted_at = NOW()
           WHERE channel_id = $1 AND is_active = true`,
          [channelId],
        )
        logger.info({ msg: 'admin_channel_unsuspended', channelId, liftedBy: session.user.id })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error({ msg: 'admin_channel_patch_failed', channelId, err: String(err) })
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
