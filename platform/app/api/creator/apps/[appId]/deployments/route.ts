import { NextResponse } from 'next/server'
import { requireCreator } from '@/lib/middleware/require-creator'
import { db } from '@/lib/db'

interface DeploymentRow {
  id: string
  status: string
  error_code: string | null
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  retry_count: number
  created_at: string
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> }
): Promise<Response> {
  const result = await requireCreator()
  if (result instanceof NextResponse) return result
  const { channel } = result
  const { appId } = await params

  // Verify the app belongs to this creator's channel
  const appCheck = await db.query(
    `SELECT id FROM marketplace.apps WHERE id = $1 AND channel_id = $2 AND deleted_at IS NULL`,
    [appId, channel.id],
  )
  if (!appCheck.rows[0]) {
    return NextResponse.json({ error: 'App not found' }, { status: 404 })
  }

  const { rows } = await db.query<DeploymentRow>(
    `SELECT id, status, error_code, error_message, started_at, completed_at, retry_count, created_at
     FROM deployments.deployments
     WHERE app_id = $1
     ORDER BY created_at DESC
     LIMIT 20`,
    [appId],
  )

  return NextResponse.json({ deployments: rows })
}
