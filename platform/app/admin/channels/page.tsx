import { db } from '@/lib/db'
type ChannelRow = {
  id: string
  name: string
  slug: string
  status: string
  creator_email: string | null
  app_count: string
  created_at: string
}
async function getChannels(): Promise<ChannelRow[]> {
  const result = await db.query<ChannelRow>(
    `SELECT c.id, c.name, c.slug, c.status, c.created_at,
            u.email AS creator_email,
            COUNT(a.id) AS app_count
     FROM marketplace.channels c
     LEFT JOIN "user" u ON u.id = c.creator_id
     LEFT JOIN marketplace.apps a ON a.channel_id = c.id AND a.deleted_at IS NULL
     WHERE c.deleted_at IS NULL
     GROUP BY c.id, u.email
     ORDER BY c.created_at DESC
     LIMIT 200`,
  )
  return result.rows
}
function statusBadge(status: string): string {
  if (status === 'active') return 'bg-green-900/40 text-green-400'
  return 'bg-red-900/40 text-red-400'
}
export default async function AdminChannels() {
  const channels = await getChannels()
  return (
    <div>
      <h1 className="mb-8 text-2xl font-bold text-white">Channels</h1>
      <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="px-4 py-3 text-left font-medium text-gray-500">Channel</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Creator</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Apps</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {channels.map((ch) => (
              <tr key={ch.id} className="hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-100">{ch.name}</p>
                  <p className="text-xs text-gray-500">@{ch.slug}</p>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{ch.creator_email ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(ch.status)}`}>
                    {ch.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-300">{ch.app_count}</td>
                <td className="px-4 py-3 text-right">
                  <a href={`/c/${ch.slug}`} className="text-xs text-violet-400 hover:underline" target="_blank">
                    View
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
