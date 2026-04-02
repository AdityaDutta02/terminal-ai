import { db } from '@/lib/db'
import { SidebarNav } from '@/components/sidebar-nav'
import { AdminUsersTable } from './users-table'

function getAdminTabs() {
  return [
    { id: 'overview', label: 'Overview', icon: 'BarChart3', href: '/admin' },
    { id: 'users', label: 'Users', icon: 'Users', href: '/admin/users' },
    { id: 'apps', label: 'Apps', icon: 'Box', href: '/admin/apps' },
    { id: 'activity', label: 'Activity Log', icon: 'Clock', href: '/admin' },
  ]
}

type UserRow = {
  [key: string]: unknown
  id: string
  name: string
  email: string
  role: string
  credits: number
  banned: boolean
  created_at: string
}

async function getUsers(): Promise<UserRow[]> {
  const result = await db.query<UserRow>(
    `SELECT u.id, u.name, u.email, u.role, u.credits, u."createdAt" AS created_at,
            EXISTS(SELECT 1 FROM platform.user_bans b WHERE b.user_id = u.id AND b.is_active = true AND (b.expires_at IS NULL OR b.expires_at > NOW())) AS banned
     FROM "user" u
     ORDER BY u."createdAt" DESC
     LIMIT 200`,
  )
  return result.rows
}

export default async function AdminUsers() {
  const users = await getUsers()
  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 flex gap-8">
      <SidebarNav title="Admin Panel" tabs={getAdminTabs()} />
      <div className="flex-1 min-w-0">
        <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight">Users</h1>
        <p className="text-[14px] text-slate-500 mt-1 mb-6">{users.length} total users</p>
        <AdminUsersTable users={users} />
      </div>
    </div>
  )
}
