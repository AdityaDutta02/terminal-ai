import { db } from '@/lib/db'
import { SidebarNav } from '@/components/sidebar-nav'
import { Users, Box, Layers, TrendingUp, Play, Sparkles, BadgeDollarSign, IndianRupee } from 'lucide-react'
import { LaunchButton } from './launch-button'

type PlatformStatus = {
  waitlistMode: boolean
  waitlistCount: number
}

async function getPlatformStatus(): Promise<PlatformStatus> {
  const [configResult, countResult] = await Promise.all([
    db.query<{ value: string }>(
      `SELECT value FROM platform.config WHERE key = 'waitlist_mode' LIMIT 1`,
    ),
    db.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count FROM platform.waitlist`,
    ),
  ])
  return {
    waitlistMode: configResult.rows[0]?.value !== 'false',
    waitlistCount: parseInt(countResult.rows[0]?.count ?? '0', 10),
  }
}

function getAdminTabs() {
  return [
    { id: 'overview', label: 'Overview', icon: 'BarChart3', href: '/admin' },
    { id: 'users', label: 'Users', icon: 'Users', href: '/admin/users' },
    { id: 'apps', label: 'Apps', icon: 'Box', href: '/admin/apps' },
    { id: 'activity', label: 'Activity Log', icon: 'Clock', href: '/admin/activity' },
  ]
}

type Stats = {
  [key: string]: unknown
  total_users: string
  total_channels: string
  total_apps: string
  total_sessions: string
  total_credits_granted: string
  sessions_today: string
  paying_users: string
  total_revenue_inr: string
}

async function getStats(): Promise<Stats> {
  const result = await db.query<Stats>(
    `SELECT
       (SELECT COUNT(*) FROM "user") AS total_users,
       (SELECT COUNT(*) FROM marketplace.channels WHERE deleted_at IS NULL) AS total_channels,
       (SELECT COUNT(*) FROM marketplace.apps WHERE deleted_at IS NULL) AS total_apps,
       (SELECT COUNT(*) FROM gateway.api_calls) AS total_sessions,
       (SELECT COALESCE(SUM(delta), 0) FROM subscriptions.credit_ledger WHERE delta > 0) AS total_credits_granted,
       (SELECT COUNT(*) FROM gateway.api_calls WHERE created_at >= CURRENT_DATE) AS sessions_today,
       (SELECT COUNT(DISTINCT user_id) FROM subscriptions.user_subscriptions WHERE status = 'active') AS paying_users,
       (SELECT COALESCE(SUM(price_inr), 0) FROM subscriptions.credit_pack_purchases WHERE status = 'completed') AS total_revenue_inr`,
  )
  return result.rows[0]
}

type TierBreakdown = { [key: string]: unknown; plan_id: string; count: string }

async function getTierBreakdown(): Promise<TierBreakdown[]> {
  const result = await db.query<TierBreakdown>(
    `SELECT plan_id, COUNT(*) AS count
     FROM subscriptions.user_subscriptions
     WHERE status = 'active'
     GROUP BY plan_id
     ORDER BY count DESC`,
  )
  return result.rows
}

type AppUsage = {
  [key: string]: unknown
  app_name: string
  channel_name: string
  sessions_30d: string
  credits_used_30d: string
}

async function getTopApps(): Promise<AppUsage[]> {
  const result = await db.query<AppUsage>(
    `SELECT a.name AS app_name, c.name AS channel_name,
            COUNT(ac.id) AS sessions_30d,
            COALESCE(SUM(ac.credits_charged), 0) AS credits_used_30d
     FROM marketplace.apps a
     JOIN marketplace.channels c ON c.id = a.channel_id
     LEFT JOIN gateway.api_calls ac ON ac.app_id = a.id AND ac.created_at >= NOW() - INTERVAL '30 days'
     WHERE a.deleted_at IS NULL
     GROUP BY a.id, a.name, c.name
     ORDER BY sessions_30d DESC
     LIMIT 20`,
  )
  return result.rows
}

export default async function AdminOverview() {
  const [platformStatus, stats, tierBreakdown, topApps] = await Promise.all([
    getPlatformStatus(),
    getStats(),
    getTierBreakdown(),
    getTopApps(),
  ])

  const statCards = [
    { label: 'Total Users', value: Number(stats.total_users).toLocaleString(), icon: Users, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
    { label: 'Channels', value: Number(stats.total_channels).toLocaleString(), icon: Layers, iconBg: 'bg-purple-50', iconColor: 'text-purple-600' },
    { label: 'Live Apps', value: Number(stats.total_apps).toLocaleString(), icon: Box, iconBg: 'bg-orange-50', iconColor: 'text-orange-600' },
    { label: 'Sessions Today', value: Number(stats.sessions_today).toLocaleString(), icon: Play, iconBg: 'bg-green-50', iconColor: 'text-green-600' },
    { label: 'Revenue (MTD)', value: '$0', icon: TrendingUp, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
    { label: 'Credits in Circulation', value: Number(stats.total_credits_granted).toLocaleString(), icon: Sparkles, iconBg: 'bg-amber-50', iconColor: 'text-amber-600' },
    { label: 'Paying Users', value: Number(stats.paying_users).toLocaleString(), icon: BadgeDollarSign, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
    { label: 'Revenue (INR)', value: `₹${Number(stats.total_revenue_inr).toLocaleString('en-IN')}`, icon: IndianRupee, iconBg: 'bg-amber-50', iconColor: 'text-amber-600' },
  ]

  const adminTabs = getAdminTabs()

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 flex gap-8">
      <SidebarNav title="Admin Panel" tabs={adminTabs} />

      <div className="flex-1 min-w-0">
        <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight">Admin Overview</h1>
        <p className="text-[14px] text-slate-500 mt-1 mb-6">Platform health and key metrics at a glance.</p>

        {/* Platform Status Card */}
        <div className="mb-8 bg-white border border-[#F1F5F9] rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#0F172A]">Platform Status</h2>
            <span
              className={`text-xs font-semibold tracking-widest uppercase px-3 py-1 rounded-full ${
                platformStatus.waitlistMode
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-green-100 text-green-700'
              }`}
            >
              {platformStatus.waitlistMode ? 'WAITLIST MODE' : 'LIVE'}
            </span>
          </div>
          <p className="text-sm text-[#64748B] mb-4">
            {platformStatus.waitlistCount.toLocaleString()} waitlist signup{platformStatus.waitlistCount !== 1 ? 's' : ''}
          </p>
          {platformStatus.waitlistMode && (
            <LaunchButton waitlistCount={platformStatus.waitlistCount} />
          )}
        </div>

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
        <div className="grid grid-cols-3 gap-4 mb-8" data-testid="stat-cards">
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

        {/* Subscription Breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-8" data-testid="subscription-breakdown">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-[15px] font-bold text-slate-900">Subscription Breakdown</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-6 py-3 text-left text-[12px] font-semibold text-slate-400 uppercase tracking-wider">Plan</th>
                <th className="px-6 py-3 text-right text-[12px] font-semibold text-slate-400 uppercase tracking-wider">Active Subscribers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tierBreakdown.map((row) => (
                <tr key={row.plan_id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-3.5 text-[14px] font-medium text-slate-700">{row.plan_id}</td>
                  <td className="px-6 py-3.5 text-[14px] text-slate-600 text-right">{Number(row.count).toLocaleString()}</td>
                </tr>
              ))}
              {tierBreakdown.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-6 py-8 text-center text-[14px] text-slate-400">No active subscriptions.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Top Apps */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-8" data-testid="top-apps">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-[15px] font-bold text-slate-900">Top Apps <span className="text-slate-400 font-normal">(last 30 days)</span></h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-6 py-3 text-left text-[12px] font-semibold text-slate-400 uppercase tracking-wider">App</th>
                  <th className="px-6 py-3 text-left text-[12px] font-semibold text-slate-400 uppercase tracking-wider">Channel</th>
                  <th className="px-6 py-3 text-right text-[12px] font-semibold text-slate-400 uppercase tracking-wider">Sessions</th>
                  <th className="px-6 py-3 text-right text-[12px] font-semibold text-slate-400 uppercase tracking-wider">Credits Used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topApps.map((app, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="px-6 py-3.5 text-[14px] font-medium text-slate-700">{app.app_name}</td>
                    <td className="px-6 py-3.5 text-[14px] text-slate-500">{app.channel_name}</td>
                    <td className="px-6 py-3.5 text-[14px] text-slate-600 text-right">{Number(app.sessions_30d).toLocaleString()}</td>
                    <td className="px-6 py-3.5 text-[14px] text-slate-600 text-right">{Number(app.credits_used_30d).toLocaleString()}</td>
                  </tr>
                ))}
                {topApps.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-[14px] text-slate-400">No app usage in the last 30 days.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
