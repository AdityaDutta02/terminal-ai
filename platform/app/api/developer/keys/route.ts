import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

const createKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
})

type CreatorSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>

/** Returns the session when the user is an admin or creator, or a 401/403 Response. */
async function requireCreatorSession(): Promise<
  | { session: CreatorSession; error: null }
  | { session: null; error: Response }
> {
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null)
  if (!session) {
    return { session: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const role = (session.user as Record<string, unknown>).role as string | undefined
  if (role !== 'admin' && role !== 'creator') {
    return {
      session: null,
      error: NextResponse.json({ error: 'Creator access required' }, { status: 403 }),
    }
  }
  return { session, error: null }
}

export async function GET(): Promise<Response> {
  const { session, error } = await requireCreatorSession()
  if (error) return error

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
  const { session, error } = await requireCreatorSession()
  if (error) return error

  const parsed = createKeySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const { name } = parsed.data

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
