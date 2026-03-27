import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { SignOutButton } from '@/components/sign-out-button'
import { Coins, Zap } from 'lucide-react'

export async function Navbar() {
  const session = await auth.api.getSession({ headers: await headers() })
  const credits = session ? ((session.user as Record<string, unknown>).credits as number | undefined) ?? 0 : null

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-100 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <a href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-600">
            <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-bold tracking-tight text-gray-900">Terminal AI</span>
        </a>

        <div className="flex items-center gap-2">
          {credits !== null ? (
            <>
              <div className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5">
                <Coins className="h-3.5 w-3.5 text-violet-500" />
                <span className={`font-mono text-xs font-semibold ${credits < 30 ? 'text-amber-600' : 'text-gray-700'}`}>
                  {credits}
                </span>
              </div>
              <SignOutButton />
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <a href="/login">Sign in</a>
              </Button>
              <Button size="sm" asChild>
                <a href="/signup">Get started</a>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
