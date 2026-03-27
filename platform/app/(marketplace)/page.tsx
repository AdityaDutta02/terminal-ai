import { db } from '@/lib/db'

type Channel = {
  id: string
  slug: string
  name: string
  description: string | null
  avatar_url: string | null
}

async function getChannels(): Promise<Channel[]> {
  const result = await db.query<Channel>(
    `SELECT id, slug, name, description, avatar_url
     FROM marketplace.channels
     WHERE status = 'active' AND deleted_at IS NULL
     ORDER BY created_at DESC`
  )
  return result.rows
}

export default async function HomePage() {
  const channels = await getChannels()

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-10">
        <h1 className="text-4xl font-bold tracking-tight">Discover apps</h1>
        <p className="mt-2 text-zinc-400">AI-powered tools built by creators.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {channels.map((channel) => (
          <a
            key={channel.id}
            href={`/c/${channel.slug}`}
            className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 hover:border-zinc-600 transition-colors"
          >
            <div className="flex items-center gap-3 mb-3">
              {channel.avatar_url ? (
                <img src={channel.avatar_url} alt="" className="h-9 w-9 rounded-full" />
              ) : (
                <div className="h-9 w-9 rounded-full bg-violet-900/50 flex items-center justify-center text-violet-400 text-sm font-bold">
                  {channel.name[0]}
                </div>
              )}
              <span className="font-semibold">{channel.name}</span>
            </div>
            {channel.description && (
              <p className="text-sm text-zinc-400 line-clamp-2">{channel.description}</p>
            )}
          </a>
        ))}
      </div>
    </div>
  )
}
