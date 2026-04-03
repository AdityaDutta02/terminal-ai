import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { BarChart3, Zap, Star, Clock } from 'lucide-react'

type UsageRow = {
  app_name: string
  channel_name: string
  created_at: string
  delta: number
}

type SummaryStats = {
  sessionsThisWeek: number
  creditsUsed: number
  topApp: string
  topAppSessions: number
}

async function getUsageData(userId: string): Promise<{
  rows: UsageRow[]
  stats: SummaryStats
}> {
  const usageRes = await db
    .query<UsageRow>(
      `SELECT
        COALESCE(a.name, cl.reason) AS app_name,
        COALESCE(c.name, '') AS channel_name,
        cl.created_at,
        cl.delta
      FROM subscriptions.credit_ledger cl
      LEFT JOIN marketplace.apps a ON a.id = cl.app_id
      LEFT JOIN marketplace.channels c ON c.id = a.channel_id
      WHERE cl.user_id = $1 AND cl.delta < 0
      ORDER BY cl.created_at DESC
      LIMIT 20`,
      [userId],
    )
    .catch(() => null)

  const rows = usageRes?.rows ?? []

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const recentRows = rows.filter(
    (r) => new Date(r.created_at) >= weekAgo,
  )

  const appCounts: Record<string, number> = {}
  for (const row of rows) {
    appCounts[row.app_name] = (appCounts[row.app_name] ?? 0) + 1
  }
  let topApp = 'None'
  let topAppSessions = 0
  for (const name of Object.keys(appCounts)) {
    if (appCounts[name] > topAppSessions) {
      topApp = name
      topAppSessions = appCounts[name]
    }
  }

  return {
    rows,
    stats: {
      sessionsThisWeek: recentRows.length,
      creditsUsed: rows.reduce((sum, r) => sum + Math.abs(r.delta), 0),
      topApp,
      topAppSessions,
    },
  }
}

export default async function AccountUsagePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login?next=/account/usage')

  const { rows, stats } = await getUsageData(session.user.id)

  return (
    <div className="space-y-8">
      {/* Heading */}
      <div>
        <h1 className="text-[28px] font-extrabold text-[#1e1e1f]">Usage History</h1>
        <p className="mt-1 text-[15px] text-[#1e1e1f]/50">
          Track your app usage and credit consumption.
        </p>
      </div>

      {/* Summary stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={BarChart3}
          label="Sessions this week"
          value={String(stats.sessionsThisWeek)}
        />
        <StatCard
          icon={Zap}
          label="Credits used"
          value={stats.creditsUsed.toLocaleString()}
        />
        <StatCard
          icon={Star}
          label="Most used app"
          value={stats.topApp}
          subtitle={
            stats.topAppSessions > 0
              ? `${stats.topAppSessions} session${stats.topAppSessions !== 1 ? 's' : ''}`
              : undefined
          }
        />
      </div>

      {/* Usage table */}
      <div className="bg-white rounded-2xl border border-[#1e1e1f]/[0.08] overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-[#1e1e1f]/[0.02] border-b border-[#1e1e1f]/[0.05]">
          <span className="col-span-3 text-[12px] font-semibold text-[#1e1e1f]/40 uppercase tracking-wider">
            App
          </span>
          <span className="col-span-2 text-[12px] font-semibold text-[#1e1e1f]/40 uppercase tracking-wider">
            Channel
          </span>
          <span className="col-span-3 text-[12px] font-semibold text-[#1e1e1f]/40 uppercase tracking-wider">
            Date
          </span>
          <span className="col-span-2 text-[12px] font-semibold text-[#1e1e1f]/40 uppercase tracking-wider">
            Duration
          </span>
          <span className="col-span-2 text-[12px] font-semibold text-[#1e1e1f]/40 uppercase tracking-wider text-right">
            Credits
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Clock className="w-8 h-8 text-[#1e1e1f]/20 mx-auto mb-3" />
            <p className="text-[14px] text-[#1e1e1f]/40">No usage data yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#1e1e1f]/[0.05]">
            {rows.map((row, idx) => (
              <div
                key={`${row.created_at}-${idx}`}
                className="grid grid-cols-12 gap-4 px-6 py-3.5 items-center"
              >
                <span className="col-span-3 text-[14px] font-medium text-[#1e1e1f] truncate">
                  {row.app_name}
                </span>
                <span className="col-span-2 text-[13px] text-[#1e1e1f]/50 truncate">
                  {row.channel_name || '\u2014'}
                </span>
                <span className="col-span-3 text-[13px] text-[#1e1e1f]/50">
                  {new Date(row.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="col-span-2 text-[13px] text-[#1e1e1f]/50">{'\u2014'}</span>
                <span className="col-span-2 text-[14px] font-semibold text-[#1e1e1f] text-right">
                  {row.delta}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
}: {
  icon: typeof BarChart3
  label: string
  value: string
  subtitle?: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#1e1e1f]/[0.08] p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-[#1e1e1f]/30" />
        <span className="text-[12px] font-semibold text-[#1e1e1f]/40 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-[24px] font-extrabold text-[#1e1e1f] leading-none">{value}</p>
      {subtitle && (
        <p className="text-[12px] text-[#1e1e1f]/35 mt-1">{subtitle}</p>
      )}
    </div>
  )
}
