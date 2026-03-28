import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { indexApps, ensureIndex } from '@/lib/search'
import { logger } from '@/lib/logger'
type AppRow = {
  id: string
  name: string
  description: string | null
  channel_name: string
  channel_slug: string
  app_slug: string
  thumbnail_url: string | null
  credits_per_session: number
}
export async function POST(): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    await ensureIndex()
    const result = await db.query<AppRow>(
      `SELECT a.id, a.name, a.description, a.slug AS app_slug,
              a.thumbnail_url, a.credits_per_session,
              c.name AS channel_name, c.slug AS channel_slug
       FROM marketplace.apps a
       JOIN marketplace.channels c ON c.id = a.channel_id
       WHERE a.status = 'live' AND a.deleted_at IS NULL`,
    )
    const docs = result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? '',
      channelName: r.channel_name,
      channelSlug: r.channel_slug,
      appSlug: r.app_slug,
      thumbnailUrl: r.thumbnail_url,
      creditsPerSession: r.credits_per_session,
    }))
    await indexApps(docs)
    logger.info({ msg: 'reindex_complete', count: docs.length })
    return NextResponse.json({ ok: true, indexed: docs.length })
  } catch (err) {
    logger.error({ msg: 'reindex_failed', err: String(err) })
    return NextResponse.json({ error: 'Reindex failed' }, { status: 500 })
  }
}
