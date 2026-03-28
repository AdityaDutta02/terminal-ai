import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { NavbarUser } from '@/components/navbar-user'
import { Zap } from 'lucide-react'

async function getCreditBalance(userId: string): Promise<number> {
  const result = await db.query<{ credits: number }>(
    `SELECT COALESCE(
       (SELECT balance_after FROM subscriptions.credit_ledger
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1),
       (SELECT credits FROM "user" WHERE id = $1),
       0
     ) AS credits`,
    [userId],
  ).catch(() => null)
  return result?.rows[0]?.credits ?? 0
}

export async function Navbar() {
  const session = await auth.api.getSession({ headers: await headers() })
  const credits = session ? await getCreditBalance(session.user.id) : null
  const role = session
    ? (((session.user as Record<string, unknown>).role as string | undefined) ?? 'user')
    : null

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-100 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <a href="/" className="flex select-none items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-600">
            <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-bold tracking-tight text-gray-900">Terminal AI</span>
        </a>

        <div className="flex items-center gap-2">
          {session && credits !== null ? (
            <NavbarUser
              name={session.user.name}
              email={session.user.email}
              credits={credits}
              role={role ?? 'user'}
            />
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
