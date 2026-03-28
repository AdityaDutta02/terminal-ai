import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateServiceToken, getCreatorIdFromRequest, unauthorizedResponse } from '@/lib/internal-auth'
import { slugify } from '@/lib/slugify'

export async function POST(req: Request): Promise<Response> {
  if (!validateServiceToken(req)) return unauthorizedResponse()

  const creatorId = getCreatorIdFromRequest(req)
  if (!creatorId) {
    return NextResponse.json({ error: 'Missing X-Creator-Id header' }, { status: 400 })
  }

  const body = await req.json() as { name?: string; description?: string }
  const { name, description } = body

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const slug = slugify(name)

  try {
    const result = await db.query<{ id: string; slug: string }>(
      `INSERT INTO marketplace.channels (name, slug, description, creator_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, slug`,
      [name.trim(), slug, description ?? '', creatorId]
    )
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (err: unknown) {
    const pg = err as { code?: string }
    if (pg.code === '23505') {
      return NextResponse.json({ error: 'A channel with this name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
