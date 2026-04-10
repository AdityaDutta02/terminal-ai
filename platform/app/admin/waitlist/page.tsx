import { db } from '@/lib/db'
import { SidebarNav } from '@/components/sidebar-nav'

function getAdminTabs() {
  return [
    { id: 'overview', label: 'Overview', icon: 'BarChart3', href: '/admin' },
    { id: 'users', label: 'Users', icon: 'Users', href: '/admin/users' },
    { id: 'apps', label: 'Apps', icon: 'Box', href: '/admin/apps' },
    { id: 'waitlist', label: 'Waitlist', icon: 'Clock', href: '/admin/waitlist' },
    { id: 'activity', label: 'Activity Log', icon: 'Clock', href: '/admin/activity' },
  ]
}

type WaitlistRow = {
  id: string
  email: string
  name: string | null
  created_at: string
  notified_at: string | null
  has_account: boolean
}

async function getWaitlist(): Promise<WaitlistRow[]> {
  const result = await db.query<WaitlistRow>(
    `SELECT w.id, w.email, w.name, w.created_at, w.notified_at,
            (u.id IS NOT NULL) AS has_account
     FROM platform.waitlist w
     LEFT JOIN public."user" u ON u.email = w.email
     ORDER BY w.created_at DESC
     LIMIT 500`,
  )
  return result.rows
}

export default async function AdminWaitlist() {
  const rows = await getWaitlist()

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 flex gap-8">
      <SidebarNav title="Admin Panel" tabs={getAdminTabs()} />
      <div className="flex-1 min-w-0">
        <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight">Waitlist</h1>
        <p className="text-[14px] text-slate-500 mt-1 mb-6">{rows.length} signups</p>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-6 py-3 text-left text-[12px] font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-[12px] font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-[12px] font-semibold text-slate-400 uppercase tracking-wider">Joined</th>
                <th className="px-6 py-3 text-left text-[12px] font-semibold text-slate-400 uppercase tracking-wider">Has Account</th>
                <th className="px-6 py-3 text-left text-[12px] font-semibold text-slate-400 uppercase tracking-wider">Notified</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-3.5 text-[14px] text-slate-700 font-medium">{row.email}</td>
                  <td className="px-6 py-3.5 text-[14px] text-slate-500">{row.name ?? '—'}</td>
                  <td className="px-6 py-3.5 text-[14px] text-slate-500">
                    {new Date(row.created_at).toLocaleDateString('en-IN')}
                  </td>
                  <td className="px-6 py-3.5">
                    <span className={`text-[12px] font-semibold px-2 py-1 rounded-full ${row.has_account ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {row.has_account ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-6 py-3.5">
                    <span className={`text-[12px] font-semibold px-2 py-1 rounded-full ${row.notified_at ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                      {row.notified_at ? new Date(row.notified_at).toLocaleDateString('en-IN') : 'Pending'}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-[14px] text-slate-400">No signups yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
