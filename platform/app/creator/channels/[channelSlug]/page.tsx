import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { notFound, redirect } from 'next/navigation'
import { Plus, Layers, Coins, BarChart2 } from 'lucide-react'
type AppRow = {
  id: string
  slug: string
  name: string
  description: string | null
  credits_per_session: number
  status: string
  session_count: string
}
type ChannelRow = {
  id: string
  slug: string
  name: string
  description: string | null
  creator_id: string | null
}
async function getChannel(slug: string, userId: string) {
  const result = await db.query<ChannelRow>(
    `SELECT id, slug, name, description, creator_id FROM marketplace.channels
     WHERE slug = $1 AND deleted_at IS NULL`,
    [slug],
  )
  const ch = result.rows[0]
  if (!ch || ch.creator_id !== userId) return null
  const apps = await db.query<AppRow>(
    `SELECT a.id, a.slug, a.name, a.description, a.credits_per_session, a.status,
            COUNT(ac.id) AS session_count
     FROM marketplace.apps a
     LEFT JOIN gateway.api_calls ac ON ac.app_id = a.id
     WHERE a.channel_id = $1 AND a.deleted_at IS NULL
     GROUP BY a.id
     ORDER BY a.created_at DESC`,
    [ch.id],
  )
  return { channel: ch, apps: apps.rows }
}
function statusColor(status: string): string {
  if (status === 'live') return 'bg-green-50 text-green-700'
  if (status === 'pending') return 'bg-yellow-50 text-yellow-700'
  if (status === 'suspended') return 'bg-red-50 text-red-600'
  return 'bg-gray-50 text-gray-500'
}
type PageProps = { params: Promise<{ channelSlug: string }> }
export default async function CreatorChannelPage({ params }: PageProps) {
  const { channelSlug } = await params
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login?next=/creator')
  const data = await getChannel(channelSlug, session.user.id)
  if (!data) notFound()
  const { channel, apps } = data
  return (
    <div>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <a href="/creator" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">← Dashboard</a>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">{channel.name}</h1>
          <p className="text-sm text-gray-400">@{channel.slug}</p>
        </div>
        <a
          href={`/creator/channels/${channel.slug}/apps/new`}
          className="inline-flex items-center gap-2 rounded-xl bg-[#FF6B00] px-4 py-2.5 text-sm font-medium text-[#0A0A0A] shadow-sm hover:bg-[#E55D00] transition-colors"
        >
          <Plus className="h-4 w-4" />
          New app
        </a>
      </div>
      {apps.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 py-20 text-center">
          <Layers className="mx-auto mb-4 h-10 w-10 text-gray-200" />
          <h3 className="mb-1 text-sm font-semibold text-gray-500">No apps yet</h3>
          <p className="mb-6 text-sm text-gray-400">Add your first AI app to this channel</p>
          <a
            href={`/creator/channels/${channel.slug}/apps/new`}
            className="inline-flex items-center gap-2 rounded-xl bg-[#FF6B00] px-4 py-2 text-sm font-medium text-[#0A0A0A] hover:bg-[#E55D00] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add app
          </a>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-500">App</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Credits</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Sessions</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {apps.map((app) => (
                <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{app.name}</p>
                    {app.description && (
                      <p className="truncate text-xs text-gray-400 max-w-xs">{app.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(app.status)}`}>
                      {app.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-gray-600">
                      <Coins className="h-3 w-3 text-[#FF6B00]" />
                      {app.credits_per_session}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <span className="flex items-center gap-1">
                      <BarChart2 className="h-3 w-3 text-gray-400" />
                      {app.session_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`/creator/channels/${channel.slug}/apps/${app.slug}`}
                      className="text-xs text-[#FF6B00] hover:underline"
                    >
                      Edit
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
