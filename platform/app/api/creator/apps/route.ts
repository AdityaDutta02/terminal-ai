import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { deployQueue } from '@/lib/deploy-queue-client'
import { logger } from '@/lib/logger'
import { z } from 'zod'
import { requireCreator } from '@/lib/middleware/require-creator'
const CreateAppSchema = z.object({
  name: z.string().min(3).max(60),
  description: z.string().max(500).default(''),
  githubRepo: z.string().regex(/^[\w-]+\/[\w-]+$/),
  branch: z.string().default('main'),
  channelId: z.string().uuid(),
})
export async function GET() {
  const result = await requireCreator()
  if (result instanceof NextResponse) return result
  const { channel } = result

  const apps = await db.query(
    `SELECT a.id, a.name, a.slug, a.status, a.is_free, a.model_tier,
            a.credits_per_session, a.created_at,
            COALESCE(SUM(au.sessions), 0)::INTEGER AS sessions_30d,
            COALESCE(SUM(au.credits_spent), 0)::INTEGER AS credits_earned_30d
     FROM marketplace.apps a
     LEFT JOIN analytics.app_usage au ON au.app_id = a.id
       AND au.day >= NOW() - INTERVAL '30 days'
     WHERE a.channel_id = $1 AND a.deleted_at IS NULL
     GROUP BY a.id
     ORDER BY a.created_at DESC`,
    [channel.id],
  )

  return NextResponse.json({ apps: apps.rows })
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = CreateAppSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })
  const { name, description, githubRepo, branch, channelId } = body.data
  const subdomain = name.toLowerCase().replace(/[^a-z0-9]/g, '-')
  const existing = await db.query(
    `SELECT id FROM deployments.deployments WHERE subdomain = $1`,
    [subdomain]
  )
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: 'Subdomain already taken' }, { status: 409 })
  }
  const channelCheck = await db.query(
    `SELECT id FROM marketplace.channels WHERE id = $1 AND creator_id = $2 AND deleted_at IS NULL`,
    [channelId, session.user.id]
  )
  if (channelCheck.rows.length === 0) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  }
  const appResult = await db.query(
    `INSERT INTO marketplace.apps (channel_id, name, description, status, github_repo, github_branch)
     VALUES ($1, $2, $3, 'pending', $4, $5) RETURNING id`,
    [channelId, name, description, githubRepo, branch]
  )
  const appId = appResult.rows[0].id as string
  const deployResult = await db.query(
    `INSERT INTO deployments.deployments (app_id, status, subdomain, github_repo, github_branch)
     VALUES ($1, 'pending', $2, $3, $4) RETURNING id`,
    [appId, subdomain, githubRepo, branch]
  )
  const deploymentId = deployResult.rows[0].id as string
  await deployQueue.add('deploy', { deploymentId, appId, githubRepo, branch, subdomain })
  logger.info({ msg: 'app_deploy_queued', appId, deploymentId, creatorId: session.user.id })
  return NextResponse.json({ appId, deploymentId, subdomain }, { status: 202 })
}
