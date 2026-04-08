// platform/app/api/admin/model-routes/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { headers } from 'next/headers'
import { z } from 'zod'

async function requireAdmin(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  const { rows } = await db.query(
    `SELECT role FROM public.user WHERE id = $1`, [session.user.id]
  )
  if (rows.length === 0 || (rows[0] as { role: string }).role !== 'admin') return null
  return session
}

export async function GET(req: Request): Promise<Response> {
  const session = await requireAdmin(req)
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { rows } = await db.query(
    `SELECT id, category, tier, model_string, priority, is_active, updated_at
     FROM platform.model_routes
     ORDER BY category, tier, priority DESC`
  )
  return NextResponse.json({ routes: rows })
}

const createRouteSchema = z.object({
  category: z.string().min(1).max(50),
  tier: z.enum(['fast', 'good', 'quality']),
  model_string: z.string().min(1).max(200),
  priority: z.number().int().min(0).max(100).default(1),
})

export async function POST(req: Request): Promise<Response> {
  const session = await requireAdmin(req)
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = createRouteSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { category, tier, model_string, priority } = parsed.data
  const { rows } = await db.query(
    `INSERT INTO platform.model_routes (category, tier, model_string, priority)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (category, tier, model_string) DO UPDATE SET priority = $4, is_active = true, updated_at = NOW()
     RETURNING id`,
    [category, tier, model_string, priority]
  )

  return NextResponse.json({ id: (rows[0] as { id: string }).id })
}
