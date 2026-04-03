import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NavbarUser } from '@/components/navbar-user'

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
    <nav className="sticky top-0 z-50 bg-[#f5f5f0]/80 backdrop-blur-xl border-b border-[#1e1e1f]/[0.06]">
      <div className="max-w-[1200px] mx-auto px-6 h-[60px] flex items-center justify-between">
        <a href="/" className="flex items-center gap-2">
          <span className="text-[18px] font-display text-[#1e1e1f]">Terminal AI</span>
        </a>
        <NavbarUser
          isLoggedIn={!!session}
          name={session?.user.name ?? null}
          email={session?.user.email ?? null}
          credits={credits}
          role={role}
        />
      </div>
    </nav>
  )
}
