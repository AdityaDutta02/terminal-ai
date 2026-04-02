import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

export interface CreatorChannel {
  [key: string]: unknown
  id: string
  name: string
  slug: string
  is_superadmin_channel: boolean
  creator_balance: number
}

export async function getCreatorChannel(userId: string): Promise<CreatorChannel | null> {
  const result = await db.query<CreatorChannel>(
    `SELECT id, name, slug, is_superadmin_channel, creator_balance
     FROM marketplace.channels WHERE creator_id = $1 LIMIT 1`,
    [userId],
  )
  return result.rows[0] ?? null
}

export async function requireCreator(): Promise<
  { session: { user: { id: string } }; channel: CreatorChannel } | NextResponse
> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Creator routes are currently locked to admin users only.
  // To open to all creators: remove this role check.
  const role = (session.user as Record<string, unknown>).role
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Creator access is currently invite-only' }, { status: 403 })
  }

  const channel = await getCreatorChannel(session.user.id)
  if (!channel) return NextResponse.json({ error: 'No creator channel found' }, { status: 403 })

  return { session: session as { user: { id: string } }, channel }
}
