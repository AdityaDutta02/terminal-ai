import { db } from '@/lib/db'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, Layers } from 'lucide-react'

type Channel = {
  id: string
  slug: string
  name: string
  description: string | null
  avatar_url: string | null
  app_count: string
}

async function getChannels(): Promise<Channel[]> {
  const result = await db.query<Channel>(
    `SELECT c.id, c.slug, c.name, c.description, c.avatar_url,
            COUNT(a.id) AS app_count
     FROM marketplace.channels c
     LEFT JOIN marketplace.apps a
       ON a.channel_id = c.id AND a.status = 'live' AND a.deleted_at IS NULL
     WHERE c.status = 'active' AND c.deleted_at IS NULL
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
  )
  return result.rows
}

export default async function HomePage() {
  const channels = await getChannels()

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      {/* Hero */}
      <div className="mb-12 text-center">
        <Badge variant="violet" className="mb-4">Now in beta</Badge>
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          Discover AI-powered apps
        </h1>
        <p className="mt-4 text-lg text-gray-500">
          Curated tools built by creators. Start with 200 free credits.
        </p>
      </div>

      {/* Channels */}
      {channels.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 py-20 text-center">
          <Layers className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-400">No channels yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {channels.map((channel) => (
            <a
              key={channel.id}
              href={`/c/${channel.slug}`}
              className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-violet-200 hover:shadow-md"
            >
              <div className="mb-4 flex items-center gap-3">
                <Avatar src={channel.avatar_url} fallback={channel.name} size="md" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">{channel.name}</p>
                  <p className="text-xs text-gray-400">@{channel.slug}</p>
                </div>
              </div>
              {channel.description && (
                <p className="mb-4 line-clamp-2 text-sm text-gray-500">{channel.description}</p>
              )}
              <div className="mt-auto flex items-center justify-between">
                <span className="text-xs text-gray-400">{channel.app_count} apps</span>
                <ArrowRight className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-violet-500" />
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
