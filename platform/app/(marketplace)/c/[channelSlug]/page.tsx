import { db } from '@/lib/db'
import { notFound } from 'next/navigation'

type App = { id: string; slug: string; name: string; description: string | null; thumbnail_url: string | null; credits_per_session: number }
type Channel = { id: string; slug: string; name: string; description: string | null; banner_url: string | null }

async function getData(slug: string) {
  const ch = await db.query<Channel>(
    `SELECT id, slug, name, description, banner_url
     FROM marketplace.channels WHERE slug = $1 AND status = 'active' AND deleted_at IS NULL`,
    [slug]
  )
  if (!ch.rows[0]) return null
  const channel = ch.rows[0]

  const apps = await db.query<App>(
    `SELECT id, slug, name, description, thumbnail_url, credits_per_session
     FROM marketplace.apps
     WHERE channel_id = $1 AND status = 'live' AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [channel.id]
  )
  return { channel, apps: apps.rows }
}

export default async function ChannelPage({ params }: { params: Promise<{ channelSlug: string }> }) {
  const { channelSlug } = await params
  const data = await getData(channelSlug)
  if (!data) notFound()
  const { channel, apps } = data

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{channel.name}</h1>
        {channel.description && <p className="mt-2 text-zinc-400">{channel.description}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((app) => (
          <a
            key={app.id}
            href={`/c/${channel.slug}/${app.slug}`}
            className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 hover:border-zinc-600 transition-colors"
          >
            {app.thumbnail_url && (
              <img src={app.thumbnail_url} alt="" className="mb-3 h-32 w-full rounded-lg object-cover" />
            )}
            <h2 className="font-semibold">{app.name}</h2>
            {app.description && (
              <p className="mt-1 text-sm text-zinc-400 line-clamp-2">{app.description}</p>
            )}
            <p className="mt-3 text-xs text-zinc-500">~{app.credits_per_session} credits/session</p>
          </a>
        ))}
      </div>
    </div>
  )
}
