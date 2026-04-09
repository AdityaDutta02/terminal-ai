import { NextRequest, NextResponse } from 'next/server'
import { requireCreator } from '@/lib/middleware/require-creator'
import { db } from '@/lib/db'
import { MODEL_TIER_CREDITS } from '@/lib/pricing'
import { z } from 'zod'

const MODEL_TIERS = ['standard', 'advanced', 'premium', 'image-fast', 'image-pro'] as const
const DEPLOY_MANAGER_URL = process.env.DEPLOY_MANAGER_URL ?? 'http://deploy-manager:3002'

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(['live', 'draft', 'coming_soon']).optional(),
  is_free: z.boolean().optional(),
  model_tier: z.enum(MODEL_TIERS).optional(),
  credits_per_session: z.number().int().min(1).max(1000).optional(),
})

async function verifyOwnership(appId: string, userId: string): Promise<NextResponse | null> {
  const result = await db.query(
    `SELECT a.id FROM marketplace.apps a
     JOIN marketplace.channels c ON c.id = a.channel_id
     WHERE a.id = $1 AND c.creator_id = $2 AND a.deleted_at IS NULL`,
    [appId, userId],
  )
  if (!result.rows[0]) {
    return NextResponse.json({ error: 'App not found' }, { status: 404 })
  }
  return null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
): Promise<Response> {
  const result = await requireCreator()
  if (result instanceof NextResponse) return result
  const { appId } = await params

  const denied = await verifyOwnership(appId, result.session.user.id)
  if (denied) return denied

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.flatten() }, { status: 400 })
  }

  const { name, description, status, is_free, model_tier, credits_per_session } = parsed.data

  const updates: string[] = []
  const values: unknown[] = []
  let idx = 1

  if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name) }
  if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description) }
  if (status !== undefined) { updates.push(`status = $${idx++}`); values.push(status) }
  if (is_free !== undefined) { updates.push(`is_free = $${idx++}`); values.push(is_free) }
  if (model_tier !== undefined) {
    updates.push(`model_tier = $${idx++}`)
    values.push(model_tier)
  }
  // credits_per_session: use explicit value if provided, else default from model_tier
  if (credits_per_session !== undefined) {
    updates.push(`credits_per_session = $${idx++}`)
    values.push(credits_per_session)
  } else if (model_tier !== undefined) {
    updates.push(`credits_per_session = $${idx++}`)
    values.push(MODEL_TIER_CREDITS[model_tier])
  }

  if (updates.length > 0) {
    values.push(appId)
    await db.query(
      `UPDATE marketplace.apps SET ${updates.join(', ')} WHERE id = $${idx}`,
      values,
    )
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
): Promise<Response> {
  const result = await requireCreator()
  if (result instanceof NextResponse) return result
  const { appId } = await params

  const denied = await verifyOwnership(appId, result.session.user.id)
  if (denied) return denied

  try {
    const upstream = await fetch(`${DEPLOY_MANAGER_URL}/apps/${appId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}` },
    })
    if (!upstream.ok) {
      const data = await upstream.json().catch(() => ({})) as { error?: string }
      return NextResponse.json({ error: data.error ?? 'Delete failed' }, { status: upstream.status })
    }
  } catch {
    await db.query(
      `UPDATE marketplace.apps SET deleted_at = NOW(), status = 'draft' WHERE id = $1`,
      [appId],
    )
  }

  return NextResponse.json({ deleted: true })
}
