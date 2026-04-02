import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ balance: 0 }, { status: 401 })

  const result = await db.query<{ [key: string]: unknown; balance: number }>(
    `SELECT COALESCE(SUM(delta), 0) AS balance FROM subscriptions.credit_ledger WHERE user_id = $1`,
    [session.user.id],
  )

  return NextResponse.json({ balance: result.rows[0]?.balance ?? 0 })
}
