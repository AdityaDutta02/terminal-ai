import { db } from '@/lib/db'
import { SidebarNav } from '@/components/sidebar-nav'
import { BarChart3, Users, Box, Clock, Layers, TrendingUp, Play, Sparkles } from 'lucide-react'

const adminTabs = [
  { id: 'overview', label: 'Overview', icon: BarChart3, href: '/admin' },
  { id: 'users', label: 'Users', icon: Users, href: '/admin/users' },
  { id: 'apps', label: 'Apps', icon: Box, href: '/admin/apps' },
  { id: 'activity', label: 'Activity Log', icon: Clock, href: '/admin' },
]

type Stats = {
  total_users: string
  total_channels: string
  total_apps: string
  total_sessions: string
  total_credits_granted: string
  sessions_today: string
}

async function getStats(): Promise<Stats> {
  const result = await db.query<Stats>(
    `SELECT
       (SELECT COUNT(*) FROM "user") AS total_users,
       (SELECT COUNT(*) FROM marketplace.channels WHERE deleted_at IS NULL) AS total_channels,
       (SELECT COUNT(*) FROM marketplace.apps WHERE deleted_at IS NULL) AS total_apps,
       (SELECT COUNT(*) FROM gateway.api_calls) AS total_sessions,
       (SELECT COALESCE(SUM(delta), 0) FROM subscriptions.credit_ledger WHERE delta > 0) AS total_credits_granted,
       (SELECT COUNT(*) FROM gateway.api_calls WHERE created_at >= CURRENT_DATE) AS sessions_today`,
  )
  return result.rows[0]
}

type ActivityRow = {
  description: string
  created_at: string
}

async function getRecentActivity(): Promise<ActivityRow[]> {
  const result = await db.query<ActivityRow>(
    `SELECT
       CONCAT(u.name, ' created account') AS description,
       u."createdAt" AS created_at
     FROM "user" u
     ORDER BY u."createdAt" DESC
     LIMIT 8`,
  )
  return result.rows
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

export default async function AdminOverview() {
  const stats = await getStats()
  const activity = await getRecentActivity()

  const statCards = [
    { label: 'Total Users', value: Number(stats.total_users).toLocaleString(), icon: Users, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
    { label: 'Channels', value: Number(stats.total_channels).toLocaleString(), icon: Layers, iconBg: 'bg-purple-50', iconColor: 'text-purple-600' },
    { label: 'Live Apps', value: Number(stats.total_apps).toLocaleString(), icon: Box, iconBg: 'bg-orange-50', iconColor: 'text-orange-600' },
    { label: 'Sessions Today', value: Number(stats.sessions_today).toLocaleString(), icon: Play, iconBg: 'bg-green-50', iconColor: 'text-green-600' },
    { label: 'Revenue (MTD)', value: '$0', icon: TrendingUp, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
    { label: 'Credits in Circulation', value: Number(stats.total_credits_granted).toLocaleString(), icon: Sparkles, iconBg: 'bg-amber-50', iconColor: 'text-amber-600' },
  ]

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 flex gap-8">
      <SidebarNav title="Admin Panel" tabs={adminTabs} />

      <div className="flex-1 min-w-0">
        <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight">Admin Overview</h1>
        <p className="text-[14px] text-slate-500 mt-1 mb-6">Platform health and key metrics at a glance.</p>

        {/* Alert banners */}
        <div className="space-y-3 mb-8">
          <div className="flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50/60 px-5 py-3.5">
            <p className="text-[14px] text-orange-800 font-medium">4 apps pending review</p>
            <a href="/admin/apps" className="text-[13px] font-semibold text-orange-700 hover:underline">Review</a>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/60 px-5 py-3.5">
            <p className="text-[14px] text-blue-800 font-medium">2 new creator applications</p>
            <a href="/admin/users" className="text-[13px] font-semibold text-blue-700 hover:underline">View</a>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50/60 px-5 py-3.5">
            <p className="text-[14px] text-red-800 font-medium">1 app flagged by users</p>
            <a href="/admin/apps" className="text-[13px] font-semibold text-red-700 hover:underline">Investigate</a>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {statCards.map((card) => {
            const CardIcon = card.icon
            return (
              <div key={card.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-9 h-9 rounded-xl ${card.iconBg} flex items-center justify-center`}>
                    <CardIcon className={`w-4.5 h-4.5 ${card.iconColor}`} />
                  </div>
                </div>
                <p className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider">{card.label}</p>
                <p className="text-[24px] font-extrabold text-slate-900 mt-1">{card.value}</p>
              </div>
            )
          })}
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-[15px] font-bold text-slate-900">Recent Activity</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {activity.map((item, idx) => (
              <div key={idx} className="px-6 py-3.5 flex items-center justify-between">
                <p className="text-[14px] text-slate-700">{item.description}</p>
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
