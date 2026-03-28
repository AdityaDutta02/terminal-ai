import { db } from '@/lib/db'
type UserRow = {
  id: string
  name: string
  email: string
  role: string
  credits: number
  created_at: string
}
async function getUsers(): Promise<UserRow[]> {
  const result = await db.query<UserRow>(
    `SELECT id, name, email, role, credits, "createdAt" AS created_at
     FROM "user"
     ORDER BY "createdAt" DESC
     LIMIT 200`,
  )
  return result.rows
}
function roleBadge(role: string): string {
  if (role === 'admin') return 'bg-red-900/40 text-red-400'
  if (role === 'creator') return 'bg-violet-900/40 text-violet-400'
  return 'bg-gray-800 text-gray-400'
}
export default async function AdminUsers() {
  const users = await getUsers()
  return (
    <div>
      <h1 className="mb-8 text-2xl font-bold text-white">Users</h1>
      <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="px-4 py-3 text-left font-medium text-gray-500">User</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Role</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Credits</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-100">{u.name}</p>
                  <p className="text-xs text-gray-500">{u.email}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${roleBadge(u.role)}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-300">{u.credits.toLocaleString()}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <a href={`/admin/users/${u.id}`} className="text-xs text-violet-400 hover:underline">
                    Manage
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
