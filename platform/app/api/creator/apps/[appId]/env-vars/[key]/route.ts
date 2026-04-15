import { NextRequest, NextResponse } from 'next/server'
import { requireCreator } from '@/lib/middleware/require-creator'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

interface AppOwnershipRow extends Record<string, unknown> {
  id: string
}

interface DeletedCountRow extends Record<string, unknown> {
  count: string
}

/**
 * Verifies the app exists and belongs to the authenticated creator.
 * Returns a 404 NextResponse if the ownership check fails, otherwise null.
 */
async function verifyAppOwnership(appId: string, userId: string): Promise<NextResponse | null> {
  const result = await db.query<AppOwnershipRow>(
    `SELECT a.id
     FROM marketplace.apps a
     JOIN marketplace.channels c ON c.id = a.channel_id
     WHERE a.id = $1 AND c.creator_id = $2 AND a.deleted_at IS NULL`,
    [appId, userId],
  )
  if (!result.rows[0]) {
    return NextResponse.json({ error: 'App not found' }, { status: 404 })
  }
  return null
}

/**
 * DELETE /api/creator/apps/[appId]/env-vars/[key]
 * Deletes a single environment variable by key.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ appId: string; key: string }> },
): Promise<Response> {
  const auth = await requireCreator()
  if (auth instanceof NextResponse) return auth

  const { appId, key } = await params

  const denied = await verifyAppOwnership(appId, auth.session.user.id)
  if (denied) return denied

  let deletedCount: number
  try {
    // pg driver returns rowCount for DELETE statements; we check that directly.
    const result = await db.query<DeletedCountRow>(
      `WITH deleted AS (
         DELETE FROM deployments.app_env_vars
         WHERE app_id = $1 AND key = $2
         RETURNING id
       )
       SELECT COUNT(*) AS count FROM deleted`,
      [appId, key],
    )
    deletedCount = parseInt(result.rows[0]?.count ?? '0', 10)
  } catch (err: unknown) {
    logger.error({ msg: 'env_var_delete_failed', appId, key, err: String(err) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  if (deletedCount === 0) {
    return NextResponse.json({ error: 'Environment variable not found' }, { status: 404 })
  }

  logger.info({ msg: 'env_var_deleted', appId, key })
  return NextResponse.json({ deleted: true })
}
