import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().max(500).optional(),
})

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check user doesn't already have a channel
  const existing = await db.query(
    `SELECT id FROM marketplace.channels WHERE creator_id = $1`,
    [session.user.id],
  )
  if (existing.rows[0]) {
    return NextResponse.json({ error: 'You already have a channel', channelId: existing.rows[0].id }, { status: 409 })
  }

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.flatten() }, { status: 400 })
  }
  const { name, slug, description } = parsed.data

  // Check slug uniqueness
  const slugCheck = await db.query(
    `SELECT id FROM marketplace.channels WHERE slug = $1`,
    [slug],
  )
  if (slugCheck.rows[0]) {
    return NextResponse.json({ error: 'Slug already taken' }, { status: 409 })
  }

  const result = await db.query<{ id: string }>(
    `INSERT INTO marketplace.channels (creator_id, name, slug, description, onboarding_step)
     VALUES ($1, $2, $3, $4, 1)
     RETURNING id`,
    [session.user.id, name, slug, description ?? null],
  )

  return NextResponse.json({ channelId: result.rows[0].id }, { status: 201 })
}
