import { db } from '@/lib/db'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { notFound } from 'next/navigation'

type AppRow = { id: string; slug: string; name: string; description: string | null; thumbnail_url: string | null; credits_per_session: number }
type ChannelRow = { id: string; slug: string; name: string }

async function getData(channelSlug: string, appSlug: string) {
  const ch = await db.query<ChannelRow>(
    `SELECT id, slug, name FROM marketplace.channels WHERE slug = $1 AND deleted_at IS NULL`,
    [channelSlug]
  )
  if (!ch.rows[0]) return null

  const ap = await db.query<AppRow>(
    `SELECT id, slug, name, description, thumbnail_url, credits_per_session
     FROM marketplace.apps
     WHERE channel_id = $1 AND slug = $2 AND status = 'live' AND deleted_at IS NULL`,
    [ch.rows[0].id, appSlug]
  )
  if (!ap.rows[0]) return null

  return { channel: ch.rows[0], app: ap.rows[0] }
}

export default async function AppDetailPage({
  params,
}: {
  params: Promise<{ channelSlug: string; appSlug: string }>
}) {
  const { channelSlug, appSlug } = await params
  const data = await getData(channelSlug, appSlug)
  if (!data) notFound()

  const { channel, app } = data
  const session = await auth.api.getSession({ headers: await headers() })

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <p className="mb-2 text-sm text-zinc-500">
        <a href={`/c/${channel.slug}`} className="hover:text-zinc-300">{channel.name}</a>
        {' / '}
      </p>
      {app.thumbnail_url && (
        <img src={app.thumbnail_url} alt="" className="mb-6 h-48 w-full rounded-xl object-cover" />
      )}
      <h1 className="text-3xl font-bold">{app.name}</h1>
      {app.description && <p className="mt-3 text-zinc-400">{app.description}</p>}
      <div className="mt-6 flex items-center gap-4">
        <span className="text-sm text-zinc-500">~{app.credits_per_session} credits/session</span>
        {session ? (
          <a
            href={`/viewer/${channel.slug}/${app.slug}`}
            className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium hover:bg-violet-500 transition-colors"
          >
            Launch app →
          </a>
        ) : (
          <a
            href={`/login?next=/viewer/${channel.slug}/${app.slug}`}
            className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium hover:bg-violet-500 transition-colors"
          >
            Sign in to launch →
          </a>
        )}
      </div>
    </div>
  )
}
