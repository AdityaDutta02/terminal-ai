import { headers } from 'next/headers'
import { SidebarNav } from '@/components/sidebar-nav'

const creatorTabs = [
  { id: 'dashboard', label: 'Dashboard', icon: 'BarChart3', href: '/creator' },
  { id: 'apps', label: 'My Apps', icon: 'Box', href: '/creator/apps' },
  { id: 'revenue', label: 'Revenue', icon: 'Sparkles', href: '/creator/revenue' },
  { id: 'settings', label: 'Settings', icon: 'Shield', href: '/creator/settings' },
  { id: 'developer', label: 'Developer API', icon: 'Cpu', href: '/developers' },
]

type HistoryRow = {
  month: string
  sessions: number
  creatorShare: number
  inrEquivalent: number
}

export default async function CreatorRevenuePage(): Promise<React.ReactElement> {
  const hdrs = await headers()
  const cookie = hdrs.get('cookie') ?? ''
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/creator/revenue`, {
    headers: { cookie },
    cache: 'no-store',
  })
  const { balance, history } = (await res.json()) as {
    balance: { credits: number; inrEquivalent: number }
    history: HistoryRow[]
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex gap-8">
        <SidebarNav title="Creator Studio" tabs={creatorTabs} />
        <div className="flex-1 min-w-0">
          <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight mb-6">Revenue</h1>

          {/* Balance card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
            <p className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Current Balance</p>
            <p className="text-[32px] font-extrabold font-mono text-slate-900">{balance?.credits ?? 0}</p>
            <p className="text-[14px] text-slate-400 mt-1">Approx ₹{balance?.inrEquivalent ?? 0}</p>
          </div>

          {/* History table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-[15px] font-bold text-slate-900">Monthly History</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-[12px] uppercase tracking-wider">
                  <th className="text-left px-5 py-3 font-semibold">Month</th>
                  <th className="text-right px-5 py-3 font-semibold">Sessions</th>
                  <th className="text-right px-5 py-3 font-semibold">Creator Share (cr)</th>
                  <th className="text-right px-5 py-3 font-semibold">Approx INR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {history?.map((row) => (
                  <tr key={row.month}>
                    <td className="px-5 py-3.5 text-slate-700">{row.month}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-700">{row.sessions}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-700">{row.creatorShare}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-400">₹{row.inrEquivalent}</td>
                  </tr>
                ))}
                {(!history || history.length === 0) && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-slate-400 text-[14px]">
                      No revenue data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-[13px] text-slate-400 mt-6">
            Payout system coming soon. Balance accumulates and will be withdrawable in a future update.
          </p>
        </div>
      </div>
    </div>
  )
}
