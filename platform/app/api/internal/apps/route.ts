import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  validateServiceToken,
  getCreatorIdFromRequest,
  unauthorizedResponse,
} from '@/lib/internal-auth'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

export async function POST(req: Request): Promise<Response> {
  if (!validateServiceToken(req)) return unauthorizedResponse()

  const creatorId = getCreatorIdFromRequest(req)
  if (!creatorId) {
    return NextResponse.json({ error: 'Missing X-Creator-Id header' }, { status: 400 })
  }

  const body = (await req.json()) as {
    channelId?: string
    name?: string
    description?: string
    githubRepo?: string
    githubBranch?: string
  }

  const { channelId, name, description, githubRepo, githubBranch } = body

  if (!channelId || !name || !githubRepo) {
    return NextResponse.json(
      { error: 'channelId, name, and githubRepo are required' },
      { status: 400 }
    )
  }

  // Verify the channel belongs to this creator and is not deleted
  const channelCheck = await db.query<{ id: string }>(
    `SELECT id FROM marketplace.channels
     WHERE id = $1 AND creator_id = $2 AND deleted_at IS NULL`,
    [channelId, creatorId]
  )
  if (channelCheck.rows.length === 0) {
    return NextResponse.json(
      { error: 'Channel not found or not owned by creator' },
      { status: 403 }
    )
  }

  const slug = slugify(name)
  const branch = githubBranch ?? 'main'

  // iframe_url is NOT NULL in the schema; placeholder until deployment completes
  const appResult = await db.query<{ id: string }>(
    `INSERT INTO marketplace.apps
       (channel_id, slug, name, description, github_repo, github_branch, iframe_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      channelId,
      slug,
      name,
      description ?? '',
      githubRepo,
      branch,
      '', // populated by deploy-manager once the deployment is live
    ]
  )

  const appId = appResult.rows[0].id

  // Trigger deployment via deploy-manager
  const deployManagerUrl = process.env.DEPLOY_MANAGER_URL ?? 'http://deploy-manager:4000'
  const deployRes = await fetch(`${deployManagerUrl}/deploy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}`,
    },
    body: JSON.stringify({
      appId,
      githubRepo,
      branch,
    }),
  })

  if (!deployRes.ok) {
    return NextResponse.json(
      { id: appId, deploymentQueued: false, error: 'Deploy queue unavailable' },
      { status: 202 }
    )
  }

  const { deploymentId } = (await deployRes.json()) as { deploymentId: string }

  return NextResponse.json({ id: appId, deploymentId, deploymentQueued: true }, { status: 201 })
}
