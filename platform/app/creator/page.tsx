import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { Layers, Plus, BarChart2, Coins } from 'lucide-react'
type ChannelRow = {
  id: string
  slug: string
  name: string
  description: string | null
  app_count: string
  total_sessions: string
}
async function getCreatorChannels(userId: string): Promise<ChannelRow[]> {
  const result = await db.query<ChannelRow>(
    `SELECT c.id, c.slug, c.name, c.description,
            COUNT(DISTINCT a.id) AS app_count,
            COUNT(DISTINCT ac.id) AS total_sessions
     FROM marketplace.channels c
     LEFT JOIN marketplace.apps a ON a.channel_id = c.id AND a.deleted_at IS NULL
     LEFT JOIN gateway.api_calls ac ON ac.app_id = a.id
     WHERE c.creator_id = $1 AND c.deleted_at IS NULL
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    [userId],
  )
  return result.rows
}
export default async function CreatorDashboard() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login?next=/creator')
  const channels = await getCreatorChannels(session.user.id)
  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Your channels</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your AI app channels</p>
        </div>
        <a
          href="/creator/channels/new"
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New channel
        </a>
      </div>
      {channels.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 py-20 text-center">
          <Layers className="mx-auto mb-4 h-10 w-10 text-gray-200" />
          <h3 className="mb-1 text-sm font-semibold text-gray-500">No channels yet</h3>
          <p className="mb-6 text-sm text-gray-400">Create your first channel to start publishing AI apps</p>
          <a
            href="/creator/channels/new"
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create channel
          </a>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {channels.map((ch) => (
            <a
              key={ch.id}
              href={`/creator/channels/${ch.slug}`}
              className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-violet-200 hover:shadow-md"
            >
              <h3 className="font-semibold text-gray-900 group-hover:text-violet-700 transition-colors">{ch.name}</h3>
              <p className="mt-0.5 text-xs text-gray-400">@{ch.slug}</p>
              {ch.description && (
                <p className="mt-2 line-clamp-2 text-sm text-gray-500">{ch.description}</p>
              )}
              <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  {ch.app_count} apps
                </span>
                <span className="flex items-center gap-1">
                  <BarChart2 className="h-3 w-3" />
                  {ch.total_sessions} sessions
                </span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
