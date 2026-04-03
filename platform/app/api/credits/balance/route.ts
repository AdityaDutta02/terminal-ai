import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { checkRateLimit, rateLimitResponse } from '@/lib/middleware/rate-limit'

export async function GET(req: NextRequest): Promise<Response> {
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
  const allowed = await checkRateLimit(`balance:${ip}`, 60, 60_000)
  if (!allowed) return rateLimitResponse()

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ balance: 0 }, { status: 401 })

  const result = await db.query<{ [key: string]: unknown; balance: number }>(
    `SELECT COALESCE(SUM(delta), 0) AS balance FROM subscriptions.credit_ledger WHERE user_id = $1`,
    [session.user.id],
  )

  return NextResponse.json({ balance: result.rows[0]?.balance ?? 0 })
}
