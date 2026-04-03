import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { validateServiceToken, getCreatorIdFromRequest, unauthorizedResponse } from '@/lib/internal-auth'
import { slugify } from '@/lib/slugify'
import { logger } from '@/lib/logger'

const createInternalAppSchema = z.object({
  channelId: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  githubRepo: z.string().min(1),
  githubBranch: z.string().min(1).optional(),
})

export async function POST(req: Request): Promise<Response> {
  if (!validateServiceToken(req)) return unauthorizedResponse()

  const creatorId = getCreatorIdFromRequest(req)
  if (!creatorId) {
    return NextResponse.json({ error: 'Missing X-Creator-Id header' }, { status: 400 })
  }

  // Validate creatorId maps to a real creator in the DB (don't trust raw header alone)
  const creatorCheck = await db.query(
    `SELECT 1 FROM public."user" WHERE id = $1 AND role IN ('creator', 'admin')`,
    [creatorId],
  )
  if (!creatorCheck.rows[0]) {
    return NextResponse.json({ error: 'Creator not found' }, { status: 403 })
  }

  const parsed = createInternalAppSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const { channelId, name, description, githubRepo, githubBranch } = parsed.data

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
  const branch = githubBranch ?? 'main'

  // Extract owner/repo from full GitHub URL or bare "owner/repo" format
  const repoMatch = githubRepo.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/) ??
    githubRepo.match(/^([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)$/)
  if (!repoMatch) {
    return NextResponse.json({ error: 'Invalid githubRepo format' }, { status: 400 })
  }
  const githubRepoShort = repoMatch[1]

  // Generate a unique subdomain from the app slug + random suffix
  const suffix = Math.random().toString(36).slice(2, 7)
  const subdomain = `${slug}-${suffix}`.slice(0, 63)

  let appId: string
  try {
    const appResult = await db.query<{ id: string }>(
      `INSERT INTO marketplace.apps
         (channel_id, slug, name, description, github_repo, github_branch, iframe_url)
       VALUES ($1, $2, $3, $4, $5, $6, '')
       RETURNING id`,
      [channelId, slug, trimmedName, description ?? '', githubRepoShort, branch]
    )
    appId = appResult.rows[0].id
    logger.info({ msg: 'app_created', appId, channelId, creatorId, slug })
  } catch (err: unknown) {
    const pg = err as { code?: string }
    if (pg.code === '23505') {
      return NextResponse.json({ error: 'An app with this name already exists in this channel' }, { status: 409 })
    }
    logger.error({ msg: 'app_insert_failed', err: String(err), channelId, creatorId })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  // Create deployment record — deploy-manager expects this to already exist
  let deploymentId: string
  try {
    const depResult = await db.query<{ id: string }>(
      `INSERT INTO deployments.deployments (app_id, subdomain, github_repo, github_branch)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [appId, subdomain, githubRepoShort, branch]
    )
    deploymentId = depResult.rows[0].id
  } catch {
    return NextResponse.json({ error: 'Failed to create deployment record' }, { status: 500 })
  }

  // Trigger deployment via deploy-manager
  const deployManagerUrl = process.env.DEPLOY_MANAGER_URL ?? 'http://deploy-manager:3002'
  const deployPayload = JSON.stringify({ deploymentId, appId, githubRepo: githubRepoShort, branch, subdomain })
  try {
    const deployRes = await fetch(`${deployManagerUrl}/deploy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}`,
      },
      body: deployPayload,
    })

    if (!deployRes.ok) {
      return NextResponse.json(
        { id: appId, deploymentId, deploymentQueued: false, error: 'Deploy queue error' },
        { status: 202 }
      )
    }
  } catch {
    return NextResponse.json(
      { id: appId, deploymentId, deploymentQueued: false, error: 'Deploy queue unavailable' },
      { status: 202 }
    )
  }

  return NextResponse.json({ id: appId, deploymentId, deploymentQueued: true }, { status: 201 })
}
