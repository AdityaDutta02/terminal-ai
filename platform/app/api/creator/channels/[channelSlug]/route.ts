import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'
type RouteCtx = { params: Promise<{ channelSlug: string }> }
export async function PATCH(req: Request, { params }: RouteCtx): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { channelSlug } = await params
  const owned = await db.query(
    `SELECT id FROM marketplace.channels WHERE slug = $1 AND creator_id = $2 AND deleted_at IS NULL`,
    [channelSlug, session.user.id],
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
  values.push(channelSlug)
  await db.query(
    `UPDATE marketplace.channels SET ${updates.join(', ')}, updated_at = now() WHERE slug = $${values.length}`,
    values,
  )
  await redis.del('og:channel:' + channelSlug)
  logger.info({ msg: 'channel_updated', channelSlug, userId: session.user.id })
  return NextResponse.json({ ok: true })
}
