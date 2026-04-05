'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'

type AppRow = {
  id: string
  name: string
  slug: string
  channel_name: string
  channel_slug: string
  creator_name: string
  status: string
  credits_per_session: number
  total_sessions: string
  created_at: string
}

const STATUS_FILTERS = ['all', 'live', 'pending', 'suspended'] as const

function statusBadgeClass(status: string): string {
  if (status === 'live') return 'text-green-700 bg-green-50'
  if (status === 'pending') return 'text-orange-700 bg-orange-50'
  if (status === 'suspended') return 'text-red-700 bg-red-50'
  return 'text-slate-700 bg-slate-100'
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function AdminAppsTable({ apps }: { apps: AppRow[] }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filtered = apps.filter((a) => {
    const matchesSearch =
      !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.channel_name.toLowerCase().includes(search.toLowerCase()) ||
      a.creator_name?.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || a.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div>
      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search apps..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 pl-10 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all"
        />
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-4">
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
              statusFilter === status
                ? 'bg-slate-900 text-white'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Data table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-slate-50 border-b border-slate-100">
          <div className="col-span-2 text-[12px] font-semibold text-slate-400 uppercase tracking-wider">App</div>
          <div className="col-span-2 text-[12px] font-semibold text-slate-400 uppercase tracking-wider">Channel</div>
          <div className="col-span-2 text-[12px] font-semibold text-slate-400 uppercase tracking-wider">Creator</div>
          <div className="col-span-1 text-[12px] font-semibold text-slate-400 uppercase tracking-wider">Status</div>
          <div className="col-span-2 text-[12px] font-semibold text-slate-400 uppercase tracking-wider">Sessions</div>
          <div className="col-span-2 text-[12px] font-semibold text-slate-400 uppercase tracking-wider">Credits</div>
          <div className="col-span-1 text-[12px] font-semibold text-slate-400 uppercase tracking-wider">Created</div>
        </div>

        {/* Rows */}
        {filtered.map((app) => (
          <a
            key={app.id}
            href={`/admin/apps/${app.id}`}
            className="grid grid-cols-12 gap-2 px-5 py-3.5 items-center border-b border-slate-50 last:border-b-0 hover:bg-slate-50/80 transition-colors cursor-pointer"
          >
            <div className="col-span-2 min-w-0">
              <p className="text-[14px] font-medium text-slate-900 truncate">{app.name}</p>
              <p className="text-[12px] text-slate-400 truncate">{app.slug}</p>
            </div>
            <div className="col-span-2 text-[13px] text-slate-600 truncate">{app.channel_name}</div>
            <div className="col-span-2 text-[13px] text-slate-500 truncate">{app.creator_name ?? '-'}</div>
            <div className="col-span-1">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(app.status)}`}>
                {app.status}
              </span>
            </div>
            <div className="col-span-2 text-[14px] font-mono text-slate-700">{Number(app.total_sessions).toLocaleString()}</div>
            <div className="col-span-2 text-[14px] font-mono text-slate-700">{app.credits_per_session}</div>
            <div className="col-span-1 text-[13px] text-slate-400">{formatDate(app.created_at)}</div>
          </a>
        ))}

        {filtered.length === 0 && (
          <div className="px-6 py-10 text-center text-[14px] text-slate-400">No apps found.</div>
        )}
      </div>
    </div>
  )
}
