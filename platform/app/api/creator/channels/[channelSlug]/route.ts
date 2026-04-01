import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'

type RouteCtx = { params: Promise<{ channelSlug: string }> }

const patchChannelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
}).strict()
export async function PATCH(req: Request, { params }: RouteCtx): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { channelSlug } = await params
  const owned = await db.query(
    `SELECT id FROM marketplace.channels WHERE slug = $1 AND creator_id = $2 AND deleted_at IS NULL`,
    [channelSlug, session.user.id],
  )
  if (!owned.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const parsed = patchChannelSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const updates: string[] = []
  const values: unknown[] = []
  if (parsed.data.name !== undefined) {
    updates.push(`name = $${values.length + 1}`)
    values.push(parsed.data.name)
  }
  if (parsed.data.description !== undefined) {
    updates.push(`description = $${values.length + 1}`)
    values.push(parsed.data.description)
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
