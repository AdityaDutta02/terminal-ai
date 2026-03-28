import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { grantCredits } from '@/lib/credits'
type PatchBody = { role?: string; grantCredits?: number }
function isValidRole(r: string): boolean {
  return r === 'user' || r === 'creator' || r === 'admin'
}
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { userId } = await params
  const body = await req.json() as PatchBody
  try {
    if (body.role !== undefined) {
      if (!isValidRole(body.role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
      await db.query(`UPDATE "user" SET role = $1 WHERE id = $2`, [body.role, userId])
      logger.info({ msg: 'admin_user_role_updated', userId, role: body.role })
    }
    if (body.grantCredits !== undefined && body.grantCredits > 0) {
      await grantCredits(userId, body.grantCredits, 'admin_grant')
      logger.info({ msg: 'admin_credits_granted', userId, amount: body.grantCredits })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error({ msg: 'admin_user_patch_failed', err: String(err) })
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
