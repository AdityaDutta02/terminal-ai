// platform/app/api/admin/model-routes/[routeId]/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { headers } from 'next/headers'
import { z } from 'zod'

const patchSchema = z.object({
  is_active: z.boolean().optional(),
  priority: z.number().int().min(0).max(100).optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ routeId: string }> }
): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { rows: userRows } = await db.query(
    `SELECT role FROM public.user WHERE id = $1`, [session.user.id]
  )
  if (userRows.length === 0 || (userRows[0] as { role: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = patchSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { routeId } = await params
  const updates: string[] = ['updated_at = NOW()']
  const values: unknown[] = [routeId]

  if (parsed.data.is_active !== undefined) {
    updates.push(`is_active = $${values.length + 1}`)
    values.push(parsed.data.is_active)
  }
  if (parsed.data.priority !== undefined) {
    updates.push(`priority = $${values.length + 1}`)
    values.push(parsed.data.priority)
  }

  await db.query(
    `UPDATE platform.model_routes SET ${updates.join(', ')} WHERE id = $1`,
    values
  )

  return NextResponse.json({ updated: true })
}
