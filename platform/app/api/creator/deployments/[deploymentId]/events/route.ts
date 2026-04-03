import { NextResponse } from 'next/server'
import { requireCreator } from '@/lib/middleware/require-creator'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

const DEPLOY_MANAGER_URL = process.env.DEPLOY_MANAGER_URL ?? 'http://deploy-manager:3002'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ deploymentId: string }> }
): Promise<Response> {
  const result = await requireCreator()
  if (result instanceof NextResponse) return result
  const { session } = result

  const { deploymentId } = await params

  // Verify this deployment belongs to an app owned by the requesting creator
  const ownership = await db.query(
    `SELECT d.id FROM deployments.deployments d
     JOIN marketplace.apps a ON a.id = d.app_id
     JOIN marketplace.channels c ON c.id = a.channel_id
     WHERE d.id = $1 AND c.creator_id = $2 AND a.deleted_at IS NULL`,
    [deploymentId, session.user.id],
  )
  if (!ownership.rows[0]) {
    logger.warn({ msg: 'deployment_events_access_denied', deploymentId, userId: session.user.id })
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const upstream = await fetch(
    `${DEPLOY_MANAGER_URL}/deployments/${deploymentId}/logs/stream`,
    { headers: { Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}` } },
  )

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
