import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  validateServiceToken,
  getCreatorIdFromRequest,
  unauthorizedResponse,
} from '@/lib/internal-auth'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

export async function POST(req: Request): Promise<Response> {
  if (!validateServiceToken(req)) return unauthorizedResponse()

  const creatorId = getCreatorIdFromRequest(req)
  if (!creatorId) {
    return NextResponse.json({ error: 'Missing X-Creator-Id header' }, { status: 400 })
  }

  const body = (await req.json()) as { name?: string; description?: string }
  const { name, description } = body

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const slug = slugify(name.trim())

  const result = await db.query<{ id: string; slug: string }>(
    `INSERT INTO marketplace.channels (name, slug, description, creator_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, slug`,
    [name.trim(), slug, description ?? '', creatorId]
  )

  return NextResponse.json(result.rows[0], { status: 201 })
}
