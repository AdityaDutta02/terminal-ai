import { NextResponse } from 'next/server'
import { requireCreator } from '@/lib/middleware/require-creator'
import { db } from '@/lib/db'

const DEPLOY_MANAGER_URL = process.env.DEPLOY_MANAGER_URL ?? 'http://deploy-manager:3002'

interface DeploymentIdRow {
  id: string
}

export async function POST(
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

  // Get the latest deployment for this app
  const depResult = await db.query<DeploymentIdRow>(
    `SELECT id FROM deployments.deployments WHERE app_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [appId],
  )
  const prev = depResult.rows[0]
  if (!prev) {
    return NextResponse.json({ error: 'No previous deployment found' }, { status: 404 })
  }

  const upstream = await fetch(`${DEPLOY_MANAGER_URL}/deployments/${prev.id}/retry`, {
    method: 'POST',
  })
  const data: unknown = await upstream.json()

  return NextResponse.json(data, { status: upstream.status })
}
