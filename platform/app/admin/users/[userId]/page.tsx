import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { SidebarNav } from '@/components/sidebar-nav'
import { ChevronLeft } from 'lucide-react'

const adminTabs = [
  { id: 'overview', label: 'Overview', icon: 'BarChart3', href: '/admin' },
  { id: 'users', label: 'Users', icon: 'Users', href: '/admin/users' },
  { id: 'apps', label: 'Apps', icon: 'Box', href: '/admin/apps' },
  { id: 'activity', label: 'Activity Log', icon: 'Clock', href: '/admin' },
]

type UserDetail = {
  id: string
  name: string
  email: string
  role: string
  credits: number
  banned: boolean | null
  created_at: string
}

type CreditEntry = {
  reason: string
  delta: number
  balance_after: number
  created_at: string
}

async function getUser(userId: string): Promise<UserDetail | null> {
  const result = await db.query<UserDetail>(
    `SELECT id, name, email, role, credits, banned, "createdAt" AS created_at FROM "user" WHERE id = $1`,
    [userId],
  )
  return result.rows[0] ?? null
}

async function getCreditHistory(userId: string): Promise<CreditEntry[]> {
  const result = await db.query<CreditEntry>(
    `SELECT reason, delta, balance_after, created_at
     FROM subscriptions.credit_ledger
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [userId],
  )
  return result.rows
}

function roleBadgeClass(role: string): string {
  if (role === 'admin') return 'text-orange-700 bg-orange-50'
  if (role === 'creator') return 'text-blue-700 bg-blue-50'
  return 'text-slate-700 bg-slate-100'
}

function statusBadgeClass(banned: boolean | null): string {
  return banned ? 'text-red-700 bg-red-50' : 'text-green-700 bg-green-50'
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
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

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default async function AdminUserDetail({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params
  const user = await getUser(userId)
  if (!user) notFound()

  const creditHistory = await getCreditHistory(userId)

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 flex gap-8">
      <SidebarNav title="Admin Panel" tabs={adminTabs} />

      <div className="flex-1 min-w-0">
        {/* Back breadcrumb */}
        <a
          href="/admin/users"
          className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-700 transition-colors mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          All Users
        </a>

        {/* Profile header card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-200 to-slate-400 flex items-center justify-center">
                <span className="text-[20px] font-bold text-white">{getInitials(user.name)}</span>
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-[24px] font-extrabold text-slate-900">{user.name}</h1>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${roleBadgeClass(user.role)}`}>
                    {user.role}
                  </span>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${statusBadgeClass(user.banned)}`}>
                    {user.banned ? 'suspended' : 'active'}
                  </span>
                </div>
                <p className="text-[14px] text-slate-500 mt-0.5">{user.email}</p>
                <p className="text-[13px] text-slate-400 mt-0.5">Joined {formatDate(user.created_at)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider">Credit Balance</p>
              <p className="text-[24px] font-extrabold font-mono text-slate-900 mt-1">{user.credits.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <button className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
            Change Role
          </button>
          <button className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
            Adjust Credits
          </button>
          <button className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
            View As User
          </button>
          {user.banned ? (
            <button className="bg-amber-500 border border-amber-600 rounded-xl px-4 py-3 text-[13px] font-semibold text-white hover:bg-amber-600 transition-colors shadow-sm">
              Unsuspend
            </button>
          ) : (
            <button className="bg-red-500 border border-red-600 rounded-xl px-4 py-3 text-[13px] font-semibold text-white hover:bg-red-600 transition-colors shadow-sm">
              Suspend
            </button>
          )}
        </div>

        {/* Credit History */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-6">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-[15px] font-bold text-slate-900">Credit History</h2>
          </div>
          {creditHistory.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {creditHistory.map((entry, idx) => (
                <div key={idx} className="px-6 py-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-[14px] text-slate-700 font-medium">{entry.reason}</p>
                    <p className="text-[12px] text-slate-400 mt-0.5">{formatDate(entry.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-[14px] font-mono font-semibold ${entry.delta > 0 ? 'text-green-600' : 'text-slate-500'}`}>
                      {entry.delta > 0 ? '+' : ''}{entry.delta.toLocaleString()}
                    </p>
                    <p className="text-[12px] text-slate-400 font-mono">bal: {entry.balance_after.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-8 text-center text-[14px] text-slate-400">No credit history yet.</div>
          )}
        </div>

        {/* Activity Log */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-[15px] font-bold text-slate-900">Activity Log</h2>
          </div>
          <div className="px-6 py-8 text-center text-[14px] text-slate-400">
            Activity tracking coming soon.
          </div>
        </div>
      </div>
    </div>
  )
}
