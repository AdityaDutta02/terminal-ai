import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/middleware/require-admin'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { grantCredits } from '@/lib/credits'
import { z } from 'zod'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const result = await requireAdmin()
  if (result instanceof NextResponse) return result
  const { userId } = await params

  const [user, ledger] = await Promise.all([
    db.query(
      `SELECT id, email, name, role, credits, "createdAt" FROM public."user" WHERE id = $1`,
      [userId],
    ),
    db.query(
      `SELECT delta, balance_after, reason, created_at FROM subscriptions.credit_ledger
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [userId],
    ),
  ])

  if (!user.rows[0]) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  logger.info({ msg: 'admin_user_fetched', userId })
  return NextResponse.json({ user: user.rows[0], ledger: ledger.rows })
}

const patchSchema = z.object({
  role: z.enum(['user', 'creator', 'admin']).optional(),
  credits: z.number().int().optional(),
  reason: z.string().min(1).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const result = await requireAdmin()
  if (result instanceof NextResponse) return result
  const { session } = result
  const { userId } = await params

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.flatten() }, { status: 400 })
  }

  const { role, credits, reason } = parsed.data

  try {
    if (role !== undefined) {
      await db.query(`UPDATE public."user" SET role = $1 WHERE id = $2`, [role, userId])
      logger.info({ msg: 'admin_user_role_updated', userId, role })
    }

    if (credits !== undefined) {
      if (!reason) {
        return NextResponse.json({ error: 'reason required when adjusting credits' }, { status: 400 })
      }
      await grantCredits(userId, credits, 'admin_grant')
      await db.query(
        `INSERT INTO audit.events (actor_id, action, resource, resource_id, metadata)
         VALUES ($1, 'grant_credits', 'user', $2, $3)`,
        [session.user.id, userId, JSON.stringify({ credits, reason })],
      )
      logger.info({ msg: 'admin_credits_granted', userId, credits, reason })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error({ msg: 'admin_user_patch_failed', userId, err: String(err) })
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
