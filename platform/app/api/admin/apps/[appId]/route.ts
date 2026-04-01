import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
type PatchBody = { status?: string }
function isValidStatus(s: string): boolean {
  return s === 'pending' || s === 'live' || s === 'suspended' || s === 'draft' || s === 'archived'
}
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ appId: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session || (session.user as Record<string, unknown>).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { appId } = await params
  const body = await req.json() as PatchBody
  if (body.status && !isValidStatus(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  try {
    await db.query(
      `UPDATE marketplace.apps SET status = $1 WHERE id = $2 AND deleted_at IS NULL`,
      [body.status, appId],
    )
    logger.info({ msg: 'admin_app_status_updated', appId, status: body.status })
    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error({ msg: 'admin_app_patch_failed', err: String(err) })
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session || (session.user as Record<string, unknown>).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { appId } = await params
  try {
    await db.query(
      `UPDATE marketplace.apps SET deleted_at = now() WHERE id = $1`,
      [appId],
    )
    logger.info({ msg: 'admin_app_deleted', appId })
    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error({ msg: 'admin_app_delete_failed', err: String(err) })
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
