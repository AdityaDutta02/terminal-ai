import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
export default async function CreatorLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login?next=/creator')
  if (session.user.role !== 'creator' && session.user.role !== 'admin') {
    redirect('/?error=not_creator')
  }
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <a href="/" className="text-sm font-semibold text-violet-600">Terminal AI</a>
            <span className="text-gray-300">|</span>
            <span className="text-sm font-medium text-gray-700">Creator Studio</span>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <a href="/creator" className="text-gray-500 hover:text-gray-900 transition-colors">Dashboard</a>
            <a href="/creator/channels/new" className="rounded-lg bg-violet-600 px-3 py-1.5 text-white hover:bg-violet-700 transition-colors">
              New channel
            </a>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}
