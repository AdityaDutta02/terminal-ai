import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="rounded-lg px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors">
      {label}
    </a>
  )
}
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login?next=/admin')
  if (session.user.role !== 'admin') redirect('/?error=forbidden')
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <a href="/" className="text-sm font-semibold text-violet-400">Terminal AI</a>
            <span className="rounded bg-red-900/40 px-2 py-0.5 text-xs font-medium text-red-400">Admin</span>
          </div>
          <nav className="flex items-center gap-1">
            <NavLink href="/admin" label="Overview" />
            <NavLink href="/admin/users" label="Users" />
            <NavLink href="/admin/channels" label="Channels" />
            <NavLink href="/admin/apps" label="Apps" />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  )
}
