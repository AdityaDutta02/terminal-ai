import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'
type RouteCtx = { params: Promise<{ appId: string }> }
export async function PATCH(req: Request, { params }: RouteCtx): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { appId } = await params
  const owned = await db.query(
    `SELECT a.id FROM marketplace.apps a
     JOIN marketplace.channels c ON c.id = a.channel_id
     WHERE a.id = $1 AND c.creator_id = $2 AND a.deleted_at IS NULL`,
    [appId, session.user.id],
  )
  if (!owned.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await req.json() as { name?: string; description?: string }
  const updates: string[] = []
  const values: unknown[] = []
  if (body.name !== undefined) {
    updates.push(`name = $${values.length + 1}`)
    values.push(body.name)
  }
  if (body.description !== undefined) {
    updates.push(`description = $${values.length + 1}`)
    values.push(body.description)
  }
  if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  values.push(appId)
  await db.query(
    `UPDATE marketplace.apps SET ${updates.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
    values,
  )
  await redis.del('og:app:' + appId)
  logger.info({ msg: 'app_updated', appId, userId: session.user.id })
  return NextResponse.json({ ok: true })
}
