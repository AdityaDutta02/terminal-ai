import { db } from '@/lib/db'
import { SidebarNav } from '@/components/sidebar-nav'
import { AdminAppsTable } from './apps-table'

function getAdminTabs() {
  return [
    { id: 'overview', label: 'Overview', icon: 'BarChart3', href: '/admin' },
    { id: 'users', label: 'Users', icon: 'Users', href: '/admin/users' },
    { id: 'apps', label: 'Apps', icon: 'Box', href: '/admin/apps' },
    { id: 'activity', label: 'Activity Log', icon: 'Clock', href: '/admin/activity' },
  ]
}

type AppRow = {
  id: string
  name: string
  slug: string
  channel_name: string
  channel_slug: string
  creator_name: string
  status: string
  credits_per_session: number
  total_sessions: string
  created_at: string
}

async function getApps(): Promise<AppRow[]> {
  const result = await db.query<AppRow>(
    `SELECT a.id, a.name, a.slug, a.status, a.credits_per_session,
            a.created_at, c.name AS channel_name, c.slug AS channel_slug,
            u.name AS creator_name,
            COUNT(DISTINCT ac.id) AS total_sessions
     FROM marketplace.apps a
     JOIN marketplace.channels c ON c.id = a.channel_id
     LEFT JOIN "user" u ON u.id = c.creator_id
     LEFT JOIN gateway.api_calls ac ON ac.app_id = a.id
     WHERE a.deleted_at IS NULL
     GROUP BY a.id, c.name, c.slug, u.name
     ORDER BY a.created_at DESC
     LIMIT 200`,
  )
  return result.rows
}

export default async function AdminApps() {
  const apps = await getApps()
  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 flex gap-8">
      <SidebarNav title="Admin Panel" tabs={getAdminTabs()} />
      <div className="flex-1 min-w-0">
        <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight">Apps</h1>
        <p className="text-[14px] text-slate-500 mt-1 mb-6">{apps.length} total apps</p>
        <AdminAppsTable apps={apps} />
      </div>
    </div>
  )
}
