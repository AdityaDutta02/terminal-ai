import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import Link from 'next/link'
function deployBadge(status: string): string {
  if (status === 'live') return 'bg-green-900/40 text-green-400'
  if (status === 'building') return 'bg-yellow-900/40 text-yellow-400'
  if (status === 'pending') return 'bg-blue-900/40 text-blue-400'
  return 'bg-red-900/40 text-red-400'
}
export const metadata = { title: 'Dashboard' }
export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')
  const apps = await db.query(
    `SELECT a.id, a.name, a.status, d.subdomain, d.status as deploy_status
     FROM marketplace.apps a
     LEFT JOIN deployments.deployments d ON d.app_id = a.id
     WHERE a.channel_id IN (
       SELECT id FROM marketplace.channels WHERE creator_id = $1 AND deleted_at IS NULL
     )
     ORDER BY a.created_at DESC`,
    [session.user.id]
  )
  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">Your Apps</h1>
        <Link
          href="/dashboard/apps/new"
          className="px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-sm font-medium text-white transition-colors">
          Deploy New App
        </Link>
      </div>
      {apps.rows.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <p className="text-lg mb-2">No apps yet</p>
          <p className="text-sm">Deploy your first app to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {apps.rows.map((app) => (
            <div
              key={app.id as string}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-white">{app.name as string}</p>
                <p className="text-sm text-zinc-400">
                  {app.subdomain ? `${app.subdomain as string}.apps.terminalai.app` : 'No subdomain yet'}
                </p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${deployBadge(app.deploy_status as string ?? 'pending')}`}>
                {(app.deploy_status as string) ?? 'pending'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
