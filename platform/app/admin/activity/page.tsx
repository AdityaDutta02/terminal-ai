import { db } from '@/lib/db'
import { SidebarNav } from '@/components/sidebar-nav'

function getAdminTabs() {
  return [
    { id: 'overview', label: 'Overview', icon: 'BarChart3', href: '/admin' },
    { id: 'users', label: 'Users', icon: 'Users', href: '/admin/users' },
    { id: 'apps', label: 'Apps', icon: 'Box', href: '/admin/apps' },
    { id: 'activity', label: 'Activity Log', icon: 'Clock', href: '/admin/activity' },
  ]
}

type ActivityRow = {
  [key: string]: unknown
  description: string
  created_at: string
  type: string
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

async function getActivity(): Promise<ActivityRow[]> {
  const result = await db.query<ActivityRow>(
    `(SELECT CONCAT(u.name, ' created account') AS description, u."createdAt" AS created_at, 'signup' AS type
      FROM "user" u ORDER BY u."createdAt" DESC LIMIT 20)
     UNION ALL
     (SELECT CONCAT('Credit ', CASE WHEN cl.delta > 0 THEN 'grant' ELSE 'debit' END, ': ', cl.reason) AS description,
             cl.created_at, 'credit' AS type
      FROM subscriptions.credit_ledger cl ORDER BY cl.created_at DESC LIMIT 20)
     ORDER BY created_at DESC LIMIT 50`,
  )
  return result.rows
}

export default async function AdminActivityPage() {
  const activity = await getActivity()

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 flex gap-8">
      <SidebarNav title="Admin Panel" tabs={getAdminTabs()} />
      <div className="flex-1 min-w-0">
        <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight">Activity Log</h1>
        <p className="text-[14px] text-slate-500 mt-1 mb-6">Recent platform events</p>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="divide-y divide-slate-100">
            {activity.map((item, idx) => (
              <div key={idx} className="px-6 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    item.type === 'signup' ? 'bg-blue-400' : item.type === 'credit' ? 'bg-emerald-400' : 'bg-slate-300'
                  }`} />
                  <p className="text-[14px] text-slate-700">{item.description}</p>
                </div>
                <span className="text-[12px] text-slate-400 flex-shrink-0 ml-4">{timeAgo(item.created_at)}</span>
              </div>
            ))}
            {activity.length === 0 && (
              <div className="px-6 py-8 text-center text-[14px] text-slate-400">No recent activity.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
