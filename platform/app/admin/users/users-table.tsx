'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'

type UserRow = {
  id: string
  name: string
  email: string
  role: string
  credits: number
  banned: boolean | null
  created_at: string
}

const ROLE_FILTERS = ['all', 'admin', 'creator', 'user'] as const

function roleBadgeClass(role: string): string {
  if (role === 'admin') return 'text-orange-700 bg-orange-50'
  if (role === 'creator') return 'text-blue-700 bg-blue-50'
  return 'text-slate-700 bg-slate-100'
}

function statusBadgeClass(banned: boolean | null): string {
  return banned ? 'text-red-700 bg-red-50' : 'text-green-700 bg-green-50'
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function AdminUsersTable({ users }: { users: UserRow[] }) {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')

  const filtered = users.filter((u) => {
    const matchesSearch =
      !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    const matchesRole = roleFilter === 'all' || u.role === roleFilter
    return matchesSearch && matchesRole
  })

  return (
    <div>
      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 pl-10 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all"
        />
      </div>

      {/* Role filter tabs */}
      <div className="flex gap-1 mb-4">
        {ROLE_FILTERS.map((role) => (
          <button
            key={role}
            onClick={() => setRoleFilter(role)}
            className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
              roleFilter === role
                ? 'bg-slate-900 text-white'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {role.charAt(0).toUpperCase() + role.slice(1)}
          </button>
        ))}
      </div>

      {/* Data table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-slate-50 border-b border-slate-100">
          <div className="col-span-3 text-[12px] font-semibold text-slate-400 uppercase tracking-wider">User</div>
          <div className="col-span-3 text-[12px] font-semibold text-slate-400 uppercase tracking-wider">Email</div>
          <div className="col-span-1 text-[12px] font-semibold text-slate-400 uppercase tracking-wider">Role</div>
          <div className="col-span-2 text-[12px] font-semibold text-slate-400 uppercase tracking-wider">Credits</div>
          <div className="col-span-1 text-[12px] font-semibold text-slate-400 uppercase tracking-wider">Status</div>
          <div className="col-span-2 text-[12px] font-semibold text-slate-400 uppercase tracking-wider">Joined</div>
        </div>

        {/* Rows */}
        {filtered.map((u) => (
          <a
            key={u.id}
            href={`/admin/users/${u.id}`}
            className="grid grid-cols-12 gap-2 px-5 py-3.5 items-center border-b border-slate-50 last:border-b-0 hover:bg-slate-50/80 transition-colors cursor-pointer"
          >
            <div className="col-span-3 flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center flex-shrink-0">
                <span className="text-[11px] font-bold text-slate-600">{getInitials(u.name)}</span>
              </div>
              <span className="text-[14px] font-medium text-slate-900 truncate">{u.name}</span>
            </div>
            <div className="col-span-3 text-[13px] text-slate-500 truncate">{u.email}</div>
            <div className="col-span-1">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${roleBadgeClass(u.role)}`}>
                {u.role}
              </span>
            </div>
            <div className="col-span-2 text-[14px] font-mono text-slate-700">{u.credits.toLocaleString()}</div>
            <div className="col-span-1">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(u.banned)}`}>
                {u.banned ? 'suspended' : 'active'}
              </span>
            </div>
            <div className="col-span-2 text-[13px] text-slate-400">{formatDate(u.created_at)}</div>
          </a>
        ))}

        {filtered.length === 0 && (
          <div className="px-6 py-10 text-center text-[14px] text-slate-400">No users found.</div>
        )}
      </div>
    </div>
  )
}
