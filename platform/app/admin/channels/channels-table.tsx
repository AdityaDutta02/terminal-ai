'use client'

import { useState } from 'react'

type Channel = {
  id: string
  name: string
  slug: string
  is_superadmin_channel: boolean
  creator_balance: number
  created_at: string
  owner_email: string
  owner_name: string
  apps_count: number
  is_suspended: boolean
}

export function ChannelsTable({ channels: initial }: { channels: Channel[] }) {
  const [channels, setChannels] = useState(initial)

  async function toggleSuperadmin(channelId: string, current: boolean) {
    const res = await fetch(`/api/admin/channels/${channelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_superadmin_channel: !current }),
    })
    if (res.ok) {
      setChannels(prev =>
        prev.map(ch =>
          ch.id === channelId ? { ...ch, is_superadmin_channel: !current } : ch,
        ),
      )
    }
  }

  async function toggleSuspension(channelId: string, isSuspended: boolean) {
    const body = isSuspended
      ? { is_suspended: false }
      : { is_suspended: true, suspension_reason: 'Suspended by admin' }
    const res = await fetch(`/api/admin/channels/${channelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      setChannels(prev =>
        prev.map(ch =>
          ch.id === channelId ? { ...ch, is_suspended: !isSuspended } : ch,
        ),
      )
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-slate-400 text-[12px] uppercase tracking-wider">
            <th className="text-left px-5 py-3 font-semibold">Channel</th>
            <th className="text-left px-5 py-3 font-semibold">Owner</th>
            <th className="text-right px-5 py-3 font-semibold">Apps</th>
            <th className="text-right px-5 py-3 font-semibold">Balance</th>
            <th className="text-center px-5 py-3 font-semibold">Superadmin</th>
            <th className="text-center px-5 py-3 font-semibold">Status</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {channels.map((ch) => (
            <tr key={ch.id} className="hover:bg-slate-50/50 transition-colors">
              <td className="px-5 py-3.5">
                <p className="font-medium text-slate-900">{ch.name}</p>
                <p className="text-[12px] text-slate-400">@{ch.slug}</p>
              </td>
              <td className="px-5 py-3.5">
                <p className="text-slate-700 text-[13px]">{ch.owner_name}</p>
                <p className="text-[12px] text-slate-400">{ch.owner_email}</p>
              </td>
              <td className="px-5 py-3.5 text-right font-mono text-slate-700">{ch.apps_count}</td>
              <td className="px-5 py-3.5 text-right font-mono text-slate-700">{ch.creator_balance}</td>
              <td className="px-5 py-3.5 text-center">
                <button
                  onClick={() => toggleSuperadmin(ch.id, ch.is_superadmin_channel)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                    ch.is_superadmin_channel
                      ? 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                      : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${ch.is_superadmin_channel ? 'bg-orange-500' : 'bg-slate-300'}`} />
                  {ch.is_superadmin_channel ? 'Yes' : 'No'}
                </button>
              </td>
              <td className="px-5 py-3.5 text-center">
                {ch.is_suspended ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-[11px] font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    Suspended
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[11px] font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Active
                  </span>
                )}
              </td>
              <td className="px-5 py-3.5 text-right">
                <button
                  onClick={() => toggleSuspension(ch.id, ch.is_suspended)}
                  className={`text-[12px] font-medium transition-colors ${
                    ch.is_suspended
                      ? 'text-emerald-600 hover:text-emerald-700'
                      : 'text-red-500 hover:text-red-600'
                  }`}
                >
                  {ch.is_suspended ? 'Unsuspend' : 'Suspend'}
                </button>
              </td>
            </tr>
          ))}
          {channels.length === 0 && (
            <tr>
              <td colSpan={7} className="px-5 py-10 text-center text-slate-400 text-[14px]">
                No channels found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
