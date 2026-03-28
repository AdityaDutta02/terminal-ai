import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
type LedgerRow = {
  id: string
  delta: number
  balance_after: number
  reason: string
  created_at: string
}
export async function GET(): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const [balanceRes, ledgerRes] = await Promise.all([
      db.query<{ credits: number }>(
        `SELECT COALESCE(
           (SELECT balance_after FROM subscriptions.credit_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1),
           (SELECT credits FROM "user" WHERE id = $1), 0
         ) AS credits`,
        [session.user.id],
      ),
      db.query<LedgerRow>(
        `SELECT id, delta, balance_after, reason, created_at
         FROM subscriptions.credit_ledger WHERE user_id = $1
         ORDER BY created_at DESC LIMIT 50`,
        [session.user.id],
      ),
    ])
    return NextResponse.json({
      balance: balanceRes.rows[0]?.credits ?? 0,
      ledger: ledgerRes.rows,
    })
  } catch (err) {
    logger.error({ msg: 'credits_fetch_failed', userId: session.user.id, err: String(err) })
    return NextResponse.json({ error: 'Failed to fetch credits' }, { status: 500 })
  }
}
