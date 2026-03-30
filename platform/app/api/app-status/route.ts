import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { headers } from 'next/headers'

type StatusRow = {
  iframe_url: string
  deployment_status: string | null
  deployment_error: string | null
}

export async function GET(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appId = new URL(req.url).searchParams.get('appId')
  if (!appId) return NextResponse.json({ error: 'Missing appId' }, { status: 400 })

  logger.info({ msg: 'app_status_query', appId, userId: session.user.id })
  const result = await db.query<StatusRow>(
    `SELECT a.iframe_url,
            d.status AS deployment_status,
            d.error_message AS deployment_error
     FROM marketplace.apps a
     LEFT JOIN LATERAL (
       SELECT status, error_message
       FROM deployments.deployments
       WHERE app_id = a.id
       ORDER BY created_at DESC
       LIMIT 1
     ) d ON true
     WHERE a.id = $1 AND a.deleted_at IS NULL`,
    [appId]
  ).catch(() => null)

  if (!result?.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(result.rows[0])
}
