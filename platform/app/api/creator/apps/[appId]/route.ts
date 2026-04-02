import { NextRequest, NextResponse } from 'next/server'
import { requireCreator } from '@/lib/middleware/require-creator'
import { db } from '@/lib/db'
import { MODEL_TIER_CREDITS } from '@/lib/pricing'
import { z } from 'zod'

const MODEL_TIERS = ['standard', 'advanced', 'premium', 'image-fast', 'image-pro'] as const

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(['live', 'draft', 'coming_soon']).optional(),
  is_free: z.boolean().optional(),
  model_tier: z.enum(MODEL_TIERS).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const result = await requireCreator()
  if (result instanceof NextResponse) return result
  const { channel } = result
  const { appId } = await params

  // Verify ownership
  const appCheck = await db.query(
    `SELECT id FROM marketplace.apps WHERE id = $1 AND channel_id = $2 AND deleted_at IS NULL`,
    [appId, channel.id],
  )
  if (!appCheck.rows[0]) {
    return NextResponse.json({ error: 'App not found' }, { status: 404 })
  }

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.flatten() }, { status: 400 })
  }

  const { name, description, status, is_free, model_tier } = parsed.data

  // Build dynamic update
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
