import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { Clock } from 'lucide-react'

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

  const recentRows = rows.filter((r) => new Date(r.created_at) >= weekAgo)

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

      {/* Summary stats — compact inline strip */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 py-4 border-b border-[#1e1e1f]/[0.06]">
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-[#1e1e1f]/40">Sessions this week</span>
          <span className="text-[15px] font-semibold text-[#1e1e1f] font-mono tabular-nums">{stats.sessionsThisWeek}</span>
        </div>
        <div className="w-px h-4 bg-[#1e1e1f]/10 self-center hidden sm:block" aria-hidden="true" />
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-[#1e1e1f]/40">Credits used</span>
          <span className="text-[15px] font-semibold text-[#1e1e1f] font-mono tabular-nums">{stats.creditsUsed.toLocaleString()}</span>
        </div>
        <div className="w-px h-4 bg-[#1e1e1f]/10 self-center hidden sm:block" aria-hidden="true" />
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-[#1e1e1f]/40">Top app</span>
          <span className="text-[15px] font-semibold text-[#1e1e1f]">{stats.topApp}</span>
          {stats.topAppSessions > 0 && (
            <span className="text-[12px] text-[#1e1e1f]/35">
              ({stats.topAppSessions} {stats.topAppSessions === 1 ? 'session' : 'sessions'})
            </span>
          )}
        </div>
      </div>

      {/* Usage table */}
      <div className="bg-white rounded-2xl border border-[#1e1e1f]/[0.08] overflow-x-auto">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Clock className="w-8 h-8 text-[#1e1e1f]/20 mx-auto mb-3" aria-hidden="true" />
            <p className="text-[14px] text-[#1e1e1f]/40">No usage data yet.</p>
          </div>
        ) : (
          <table className="w-full text-sm min-w-[400px]">
            <thead>
              <tr className="border-b border-[#1e1e1f]/[0.05] bg-[#1e1e1f]/[0.02]">
                <th scope="col" className="text-left px-6 py-3 text-[12px] font-semibold text-[#1e1e1f]/40 uppercase tracking-wider">App</th>
                <th scope="col" className="text-left px-6 py-3 text-[12px] font-semibold text-[#1e1e1f]/40 uppercase tracking-wider hidden sm:table-cell">Channel</th>
                <th scope="col" className="text-left px-6 py-3 text-[12px] font-semibold text-[#1e1e1f]/40 uppercase tracking-wider">Date</th>
                <th scope="col" className="text-right px-6 py-3 text-[12px] font-semibold text-[#1e1e1f]/40 uppercase tracking-wider">Credits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e1f]/[0.05]">
              {rows.map((row, idx) => (
                <tr key={`${row.created_at}-${idx}`}>
                  <td className="px-6 py-3.5 text-[14px] font-medium text-[#1e1e1f] max-w-[160px] truncate">{row.app_name}</td>
                  <td className="px-6 py-3.5 text-[13px] text-[#1e1e1f]/50 hidden sm:table-cell">{row.channel_name || '-'}</td>
                  <td className="px-6 py-3.5 text-[13px] text-[#1e1e1f]/50 whitespace-nowrap">
                    {new Date(row.created_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-6 py-3.5 text-[14px] font-semibold text-[#1e1e1f] text-right font-mono tabular-nums">{row.delta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
