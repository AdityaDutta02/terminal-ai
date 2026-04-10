import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(): Promise<NextResponse> {
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM platform.waitlist`,
  )
  return NextResponse.json(
    { count: parseInt(result.rows[0]?.count ?? '0', 10) },
    { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=120' } },
  )
}
