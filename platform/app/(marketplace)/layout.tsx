import { headers } from 'next/headers'
import { auth } from '@/lib/auth'

async function getCredits(): Promise<number | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null
  return (session.user as unknown as { credits: number }).credits ?? null
}

export default async function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  const credits = await getCredits()

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
        <a href="/" className="text-sm font-semibold tracking-tight">
          terminal<span className="text-violet-400">ai</span>
        </a>
        <div className="flex items-center gap-4">
          {credits !== null ? (
            <span className="text-xs text-zinc-400">
              <span className={credits < 30 ? 'text-amber-400' : 'text-zinc-200'}>
                {credits}
              </span>{' '}
              credits
            </span>
          ) : (
            <a href="/login" className="text-xs text-violet-400 hover:underline">Sign in</a>
          )}
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
