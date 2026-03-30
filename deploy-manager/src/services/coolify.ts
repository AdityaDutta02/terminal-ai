import { logger } from '../lib/logger'

function coolifyConfig() {
  const url = process.env.COOLIFY_URL
  const token = process.env.COOLIFY_TOKEN
  const serverUuid = process.env.COOLIFY_SERVER_UUID
  const projectUuid = process.env.COOLIFY_PROJECT_UUID
  if (!url || !token) throw new Error('COOLIFY_URL and COOLIFY_TOKEN must be set')
  if (!serverUuid || !projectUuid) throw new Error('COOLIFY_SERVER_UUID and COOLIFY_PROJECT_UUID must be set')
  return { url, token, serverUuid, projectUuid }
}

interface DeployResult {
  deploymentId: string
  status: string
}

export async function triggerDeploy(coolifyAppId: string): Promise<DeployResult> {
  const { url, token } = coolifyConfig()
  // Coolify deploy endpoint: GET /api/v1/deploy?uuid=<uuid>&force=false
  const res = await fetch(`${url}/api/v1/deploy?uuid=${coolifyAppId}&force=false`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Coolify deploy failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<DeployResult>
}

export async function getAppDetails(coolifyAppId: string): Promise<{ status: string; fqdn: string | null }> {
  const { url, token } = coolifyConfig()
  const res = await fetch(`${url}/api/v1/applications/${coolifyAppId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Coolify app details failed: ${res.status}`)
  const data = await res.json() as { status: string; fqdn?: string | null }
  return { status: data.status, fqdn: data.fqdn ?? null }
}

/** Set a single environment variable on a Coolify app. */
async function setEnvVar(coolifyAppId: string, key: string, value: string): Promise<void> {
  const { url, token } = coolifyConfig()
  const res = await fetch(`${url}/api/v1/applications/${coolifyAppId}/envs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value, is_preview: false }),
  })
  if (!res.ok) throw new Error(`Coolify set env ${key} failed: ${res.status} ${await res.text()}`)
}

export interface CreateAppResult {
  uuid: string
  /** Auto-generated domain returned by Coolify (e.g. http://<uuid>.<ip>.sslip.io) */
  domain: string
}

export async function createApp(params: {
  name: string
  githubRepo: string
  branch: string
  port: number
  envVars: Record<string, string>
}): Promise<CreateAppResult> {
  const { url, token, serverUuid, projectUuid } = coolifyConfig()
  const createBody = {
    name: params.name,
    git_repository: `https://github.com/${params.githubRepo}`,
    git_branch: params.branch,
    build_pack: 'dockerfile',
    ports_exposes: String(params.port),
    server_uuid: serverUuid,
    project_uuid: projectUuid,
    environment_name: 'production',
    instant_deploy: false,
  }
  const res = await fetch(`${url}/api/v1/applications/public`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(createBody),
  })
  const rawBody = await res.text()
  if (!res.ok) throw new Error(`Coolify create failed: ${res.status} ${rawBody}`)
  let data: Record<string, unknown>
  try {
    data = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    throw new Error(`Coolify create returned non-JSON: ${rawBody}`)
  }
  logger.info({ msg: 'coolify_create_response', name: params.name, body: data })

  const uuid = typeof data['uuid'] === 'string' ? data['uuid'] : undefined
  if (!uuid) throw new Error(`Coolify create returned no uuid. Full response: ${rawBody}`)

  // Coolify returns the domain under 'fqdn', 'domains', or 'url' depending on version
  const domain = (data['fqdn'] ?? data['domains'] ?? data['url'] ?? '') as string
  logger.info({ msg: 'coolify_app_created', name: params.name, uuid, domain })

  // Set env vars individually — Coolify's create endpoint does not accept them inline
  for (const [key, value] of Object.entries(params.envVars)) {
    await setEnvVar(uuid, key, value)
  }

  return { uuid, domain }
}
