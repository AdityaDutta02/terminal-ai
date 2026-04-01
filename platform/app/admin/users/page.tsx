import { db } from '@/lib/db'
import { SidebarNav } from '@/components/sidebar-nav'
import { BarChart3, Users, Box, Clock } from 'lucide-react'
import { AdminUsersTable } from './users-table'

const adminTabs = [
  { id: 'overview', label: 'Overview', icon: BarChart3, href: '/admin' },
  { id: 'users', label: 'Users', icon: Users, href: '/admin/users' },
  { id: 'apps', label: 'Apps', icon: Box, href: '/admin/apps' },
  { id: 'activity', label: 'Activity Log', icon: Clock, href: '/admin' },
]

type UserRow = {
  id: string
  name: string
  email: string
  role: string
  credits: number
  banned: boolean | null
  created_at: string
}

async function getUsers(): Promise<UserRow[]> {
  const result = await db.query<UserRow>(
    `SELECT id, name, email, role, credits, banned, "createdAt" AS created_at
     FROM "user"
     ORDER BY "createdAt" DESC
     LIMIT 200`,
  )
  return result.rows
}

export default async function AdminUsers() {
  const users = await getUsers()
  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 flex gap-8">
      <SidebarNav title="Admin Panel" tabs={adminTabs} />
      <div className="flex-1 min-w-0">
        <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight">Users</h1>
        <p className="text-[14px] text-slate-500 mt-1 mb-6">{users.length} total users</p>
        <AdminUsersTable users={users} />
      </div>
    </div>
  )
}
