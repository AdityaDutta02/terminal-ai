import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

export async function GET(): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const result = await db.query<{
      id: string
      name: string
      prefix: string
      created_at: string
      last_used_at: string | null
    }>(
      `SELECT id, name, prefix, created_at, last_used_at
       FROM mcp.api_keys
       WHERE creator_id = $1 AND revoked_at IS NULL
       ORDER BY created_at DESC`,
      [session.user.id]
    )
    return NextResponse.json({ keys: result.rows })
  } catch {
    return NextResponse.json({ error: 'Failed to load keys' }, { status: 500 })
  }
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { name?: string }
  try {
    body = await req.json() as { name?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = body.name?.trim()
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const rawToken = `sk_tai_${crypto.randomBytes(32).toString('hex')}`
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const prefix = rawToken.slice(0, 16)

  try {
    const result = await db.query<{ id: string; prefix: string }>(
      `INSERT INTO mcp.api_keys (creator_id, name, token_hash, prefix)
       VALUES ($1, $2, $3, $4)
       RETURNING id, prefix`,
      [session.user.id, name, tokenHash, prefix]
    )
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Failed to create key' }, { status: 500 })
    }
    return NextResponse.json({ id: result.rows[0].id, token: rawToken, prefix }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create key' }, { status: 500 })
  }
}
