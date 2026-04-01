import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
type ChannelRow = { id: string; creator_id: string | null }
type ReqBody = {
  name?: string
  slug?: string
  description?: string
  iframeUrl?: string
  creditsPerSession?: number
}
async function getOwnedChannel(channelSlug: string, userId: string) {
  const result = await db.query<ChannelRow>(
    `SELECT id, creator_id FROM marketplace.channels WHERE slug = $1 AND deleted_at IS NULL`,
    [channelSlug],
  )
  const ch = result.rows[0]
  if (!ch || ch.creator_id !== userId) return null
  return ch
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ channelSlug: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { channelSlug } = await params
  const channel = await getOwnedChannel(channelSlug, session.user.id)
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  const body = await req.json() as ReqBody
  const { name, slug, description, iframeUrl, creditsPerSession } = body
  if (!name || !slug || !iframeUrl) {
    return NextResponse.json({ error: 'name, slug, and iframeUrl are required' }, { status: 400 })
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: 'Invalid slug format' }, { status: 400 })
  }
  const credits = Math.max(1, Math.min(10000, Number(creditsPerSession) || 1))
  try {
    await db.query(
      `INSERT INTO marketplace.apps (channel_id, slug, name, description, iframe_url, credits_per_session, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft')`,
      [channel.id, slug, name, description ?? null, iframeUrl, credits],
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error({ msg: 'create_app_failed', err: String(err) })
    if (String(err).includes('unique')) {
      return NextResponse.json({ error: 'Slug already taken in this channel' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to create app' }, { status: 500 })
  }
}
