import { NextResponse } from 'next/server'
import { isWaitlistMode, invalidateWaitlistCache } from '@/lib/waitlist-config'

// Internal endpoint used by proxy.ts (edge) to read waitlist_mode from DB.
// Not rate-limited — only called by the edge proxy with x-internal header.
export async function GET(): Promise<NextResponse> {
  const active = await isWaitlistMode()
  return NextResponse.json(
    { active },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

// Called by /api/admin/launch to invalidate the server-side cache immediately.
export async function POST(): Promise<NextResponse> {
  invalidateWaitlistCache()
  return NextResponse.json({ ok: true })
}
