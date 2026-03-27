import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Coins, Layers } from 'lucide-react'

type App = {
  id: string
  slug: string
  name: string
  description: string | null
  thumbnail_url: string | null
  credits_per_session: number
}
type Channel = {
  id: string
  slug: string
  name: string
  description: string | null
  banner_url: string | null
  avatar_url: string | null
}

async function getData(slug: string) {
  const ch = await db.query<Channel>(
    `SELECT id, slug, name, description, banner_url, avatar_url
     FROM marketplace.channels
     WHERE slug = $1 AND status = 'active' AND deleted_at IS NULL`,
    [slug],
  )
  if (!ch.rows[0]) return null
  const channel = ch.rows[0]

  const apps = await db.query<App>(
    `SELECT id, slug, name, description, thumbnail_url, credits_per_session
     FROM marketplace.apps
     WHERE channel_id = $1 AND status = 'live' AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [channel.id],
  )
  return { channel, apps: apps.rows }
}

export default async function ChannelPage({ params }: { params: Promise<{ channelSlug: string }> }) {
  const { channelSlug } = await params
  const data = await getData(channelSlug)
  if (!data) notFound()
  const { channel, apps } = data

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Back */}
      <a href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" />
        All channels
      </a>

      {/* Channel header */}
      <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        {channel.banner_url && (
          <div className="mb-6 -mx-6 -mt-6 h-36 overflow-hidden rounded-t-2xl">
            <img src={channel.banner_url} alt="" className="h-full w-full object-cover" />
          </div>
        )}
        <div className="flex items-start gap-4">
          <Avatar src={channel.avatar_url} fallback={channel.name} size="lg" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{channel.name}</h1>
            <p className="text-sm text-gray-400">@{channel.slug}</p>
            {channel.description && (
              <p className="mt-2 text-sm text-gray-600">{channel.description}</p>
            )}
            <div className="mt-3">
              <Badge variant="outline">{apps.length} apps</Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Apps */}
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">Apps</h2>
      {apps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center">
          <Layers className="mx-auto mb-3 h-7 w-7 text-gray-300" />
          <p className="text-sm text-gray-400">No apps in this channel yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <a
              key={app.id}
              href={`/c/${channel.slug}/${app.slug}`}
              className="group flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:border-violet-200 hover:shadow-md overflow-hidden"
            >
              {app.thumbnail_url ? (
                <div className="h-36 overflow-hidden bg-gray-100">
                  <img
                    src={app.thumbnail_url}
                    alt={app.name}
                    className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                  />
                </div>
              ) : (
                <div className="h-36 bg-gradient-to-br from-violet-50 to-indigo-50 flex items-center justify-center">
                  <Layers className="h-8 w-8 text-violet-200" />
                </div>
              )}
              <div className="flex flex-1 flex-col p-4">
                <h3 className="font-semibold text-gray-900">{app.name}</h3>
                {app.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-gray-500">{app.description}</p>
                )}
                <div className="mt-3 flex items-center gap-1 text-xs text-gray-400">
                  <Coins className="h-3 w-3 text-violet-400" />
                  <span>{app.credits_per_session} credits / session</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
