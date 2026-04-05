import { headers } from 'next/headers'
import { SidebarNav } from '@/components/sidebar-nav'
import { getCreatorTabs } from '@/lib/creator-tabs'

type AppRow = {
  id: string
  name: string
  slug: string
  status: string
  model_tier: string
  is_free: boolean
  sessions_30d: number
  credits_earned_30d: number
}

export default async function CreatorAppsPage(): Promise<React.ReactElement> {
  const hdrs = await headers()
  const cookie = hdrs.get('cookie') ?? ''
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/creator/apps`, {
    headers: { cookie },
    cache: 'no-store',
  })
  const { apps } = (await res.json()) as { apps: AppRow[] }

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex gap-8">
        <SidebarNav title="Creator Studio" tabs={getCreatorTabs()} />
        <div className="flex-1 min-w-0">
          <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight mb-6">My Apps</h1>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-[12px] uppercase tracking-wider">
                  <th className="text-left px-5 py-3 font-semibold">App</th>
                  <th className="text-left px-5 py-3 font-semibold">Status</th>
                  <th className="text-right px-5 py-3 font-semibold">Sessions (30d)</th>
                  <th className="text-right px-5 py-3 font-semibold">Credits Earned</th>
                  <th className="text-left px-5 py-3 font-semibold">Tier</th>
                  <th className="text-left px-5 py-3 font-semibold">Free</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {apps?.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <a href={`/creator/apps/${app.id}`} className="font-medium text-slate-900 hover:text-orange-600 transition-colors">
                        {app.name}
                      </a>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${
                        app.status === 'live'
                          ? 'text-emerald-600'
                          : 'text-slate-400'
                      }`}>
                        {app.status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                        {app.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-700">{app.sessions_30d}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-700">{app.credits_earned_30d}</td>
                    <td className="px-5 py-3.5 text-[12px] text-slate-400">{app.model_tier ?? '-'}</td>
                    <td className="px-5 py-3.5 text-[12px] text-slate-400">{app.is_free ? 'Yes' : '-'}</td>
                  </tr>
                ))}
                {(!apps || apps.length === 0) && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-slate-400 text-[14px]">
                      No apps yet. Deploy your first app via the MCP tool.
                    </td>
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
