import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateServiceToken, getCreatorIdFromRequest, unauthorizedResponse } from '@/lib/internal-auth'
import { slugify } from '@/lib/slugify'

export async function POST(req: Request): Promise<Response> {
  if (!validateServiceToken(req)) return unauthorizedResponse()

  const creatorId = getCreatorIdFromRequest(req)
  if (!creatorId) {
    return NextResponse.json({ error: 'Missing X-Creator-Id header' }, { status: 400 })
  }

  const body = await req.json() as {
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

  // Verify the channel belongs to this creator
  const channelCheck = await db.query<{ id: string }>(
    `SELECT id FROM marketplace.channels WHERE id = $1 AND creator_id = $2 AND deleted_at IS NULL`,
    [channelId, creatorId]
  ).catch(() => ({ rows: [] as { id: string }[] }))

  if (channelCheck.rows.length === 0) {
    return NextResponse.json({ error: 'Channel not found or not owned by creator' }, { status: 403 })
  }

  const trimmedName = name.trim()
  const slug = slugify(name)

  let appId: string
  try {
    const appResult = await db.query<{ id: string }>(
      `INSERT INTO marketplace.apps
         (channel_id, slug, name, description, github_repo, github_branch, iframe_url)
       VALUES ($1, $2, $3, $4, $5, $6, '')
       RETURNING id`,
      [channelId, slug, trimmedName, description ?? '', githubRepo, githubBranch ?? 'main']
    )
    appId = appResult.rows[0].id
  } catch (err: unknown) {
    const pg = err as { code?: string }
    if (pg.code === '23505') {
      return NextResponse.json({ error: 'An app with this name already exists in this channel' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  // Trigger deployment via deploy-manager
  const deployManagerUrl = process.env.DEPLOY_MANAGER_URL ?? 'http://deploy-manager:4000'
  let deployRes: Response
  try {
    deployRes = await fetch(`${deployManagerUrl}/deploy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}`,
      },
      body: JSON.stringify({
        appId,
        githubRepo,
        branch: githubBranch ?? 'main',
      }),
    })
  } catch {
    return NextResponse.json(
      { id: appId, deploymentQueued: false, error: 'Deploy queue unavailable' },
      { status: 202 }
    )
  }

  if (!deployRes.ok) {
    return NextResponse.json(
      { id: appId, deploymentQueued: false, error: 'Deploy queue error' },
      { status: 202 }
    )
  }

  let deploymentId: string | undefined
  try {
    const payload = await deployRes.json() as { deploymentId?: string }
    deploymentId = payload.deploymentId
  } catch {
    return NextResponse.json(
      { id: appId, deploymentQueued: false, error: 'Invalid deploy-manager response' },
      { status: 202 }
    )
  }

  if (!deploymentId) {
    return NextResponse.json(
      { id: appId, deploymentQueued: false, error: 'No deployment ID returned' },
      { status: 202 }
    )
  }

  return NextResponse.json({ id: appId, deploymentId, deploymentQueued: true }, { status: 201 })
}
