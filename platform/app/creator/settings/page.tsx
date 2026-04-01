import { headers } from 'next/headers'
import { SidebarNav } from '@/components/sidebar-nav'
import { getCreatorTabs } from '@/lib/creator-tabs'

export default async function CreatorSettingsPage(): Promise<React.ReactElement> {
  const hdrs = await headers()
  const cookie = hdrs.get('cookie') ?? ''
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/creator/channel`, {
    headers: { cookie },
    cache: 'no-store',
  })
  const data = await res.json()
  const channel = data?.channel

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex gap-8">
        <SidebarNav title="Creator Studio" tabs={getCreatorTabs()} />
        <div className="flex-1 min-w-0">
          <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight mb-6">Channel Settings</h1>

          {channel ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 max-w-lg">
              <div className="space-y-5">
                <div>
                  <label className="block text-[12px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Channel Name</label>
                  <p className="text-[15px] text-slate-900 font-medium">{channel.name}</p>
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Slug</label>
                  <p className="text-[15px] text-slate-500 font-mono">@{channel.slug}</p>
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Superadmin Channel</label>
                  <p className="text-[13px] text-slate-500">{channel.is_superadmin_channel ? 'Yes' : 'No'}</p>
                </div>
              </div>
              <p className="text-[13px] text-slate-400 mt-6">
                Channel editing via UI coming soon. Use the API to update channel details.
              </p>
            </div>
          ) : (
            <div className="text-center py-20">
              <p className="text-slate-400 text-[14px]">No channel found.</p>
              <a href="/creator/onboarding" className="text-orange-600 text-[14px] font-medium mt-2 block">
                Create your channel →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
