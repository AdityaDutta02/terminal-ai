import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
export async function GET(): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await db.query<{ id: string; name: string; slug: string }>(
    `SELECT id, name, slug FROM marketplace.channels WHERE creator_id = $1 AND deleted_at IS NULL ORDER BY name`,
    [session.user.id]
  )
  return NextResponse.json({ channels: result.rows })
}
export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as Record<string, unknown>).role !== 'creator' && (session.user as Record<string, unknown>).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json() as { name?: string; slug?: string; description?: string }
  const { name, slug, description } = body
  if (!name || !slug) return NextResponse.json({ error: 'name and slug are required' }, { status: 400 })
  if (!/^[a-z0-9-]+$/.test(slug)) return NextResponse.json({ error: 'Invalid slug format' }, { status: 400 })
  try {
    const result = await db.query<{ slug: string }>(
      `INSERT INTO marketplace.channels (slug, name, description, creator_id)
       VALUES ($1, $2, $3, $4)
       RETURNING slug`,
      [slug, name, description ?? null, session.user.id],
    )
    return NextResponse.json({ slug: result.rows[0].slug })
  } catch (err) {
    logger.error({ msg: 'create_channel_failed', err: String(err) })
    if (String(err).includes('unique')) {
      return NextResponse.json({ error: 'Slug already taken' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to create channel' }, { status: 500 })
  }
}
