import { db } from '@/lib/db'
type AppRow = {
  id: string
  name: string
  slug: string
  channel_name: string
  channel_slug: string
  status: string
  credits_per_session: number
  created_at: string
}
async function getApps(): Promise<AppRow[]> {
  const result = await db.query<AppRow>(
    `SELECT a.id, a.name, a.slug, a.status, a.credits_per_session,
            a.created_at, c.name AS channel_name, c.slug AS channel_slug
     FROM marketplace.apps a
     JOIN marketplace.channels c ON c.id = a.channel_id
     WHERE a.deleted_at IS NULL
     ORDER BY a.created_at DESC
     LIMIT 200`,
  )
  return result.rows
}
function statusBadge(status: string): string {
  if (status === 'live') return 'bg-green-900/40 text-green-400'
  if (status === 'pending') return 'bg-yellow-900/40 text-yellow-400'
  if (status === 'suspended') return 'bg-red-900/40 text-red-400'
  return 'bg-gray-800 text-gray-400'
}
export default async function AdminApps() {
  const apps = await getApps()
  return (
    <div>
      <h1 className="mb-8 text-2xl font-bold text-white">Apps</h1>
      <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="px-4 py-3 text-left font-medium text-gray-500">App</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Channel</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Credits</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {apps.map((app) => (
              <tr key={app.id} className="hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-100">{app.name}</p>
                  <p className="text-xs text-gray-500">{app.slug}</p>
                </td>
                <td className="px-4 py-3 text-gray-400">{app.channel_name}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(app.status)}`}>
                    {app.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-300">{app.credits_per_session}</td>
                <td className="px-4 py-3 text-right">
                  <a href={`/admin/apps/${app.id}`} className="text-xs text-violet-400 hover:underline">
                    Edit
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
