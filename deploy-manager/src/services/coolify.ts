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

export type ResourceClass = 'micro' | 'small' | 'medium'

function getResourceLimits(rc: ResourceClass): { memory: string; cpus: string } {
  if (rc === 'small') return { memory: '1g', cpus: '1.0' }
  if (rc === 'medium') return { memory: '2g', cpus: '2.0' }
  return { memory: '512m', cpus: '0.5' }
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

export async function deleteApp(coolifyAppId: string): Promise<void> {
  const { url, token } = coolifyConfig()
  const res = await fetch(
    `${url}/api/v1/applications/${coolifyAppId}?deleteConfigurations=true&deleteVolumes=true&dockerCleanup=true&deleteConnectedNetworks=true`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
  )
  // 404 means already gone — treat as success
  if (!res.ok && res.status !== 404) {
    throw new Error(`Coolify delete failed: ${res.status} ${await res.text()}`)
  }
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

/** Update the FQDN (domain) for a Coolify app. Required so Traefik routes to the correct domain.
 *  Uses force_domain_override=true to avoid 409 conflicts from stale apps holding the same domain. */
export async function updateAppFqdn(coolifyAppId: string, fqdn: string): Promise<void> {
  const { url, token } = coolifyConfig()
  const res = await fetch(`${url}/api/v1/applications/${coolifyAppId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ domains: fqdn, force_domain_override: true }),
  })
  if (!res.ok) {
    const body = await res.text()
    logger.warn({ msg: 'coolify_update_fqdn_failed', coolifyAppId, fqdn, status: res.status, body })
  } else {
    logger.info({ msg: 'coolify_fqdn_updated', coolifyAppId, fqdn })
  }
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
  resourceClass?: ResourceClass
}): Promise<CreateAppResult> {
  const { url, token, serverUuid, projectUuid } = coolifyConfig()
  const limits = getResourceLimits(params.resourceClass ?? 'micro')
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
    limits_memory: limits.memory,
    limits_cpus: limits.cpus,
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

/** Fetch recent deployment logs from Coolify for a given application. */
export async function getDeploymentLogs(coolifyAppId: string): Promise<string> {
  const { url, token } = coolifyConfig()
  try {
    // Coolify stores deployment history per application
    const deploymentsRes = await fetch(`${url}/api/v1/applications/${coolifyAppId}/deployments?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!deploymentsRes.ok) return `Failed to fetch deployments list: HTTP ${deploymentsRes.status}`
    const deployments = await deploymentsRes.json() as { data?: Array<{ deployment_uuid?: string }> }
    const latestUuid = deployments.data?.[0]?.deployment_uuid
    if (!latestUuid) return 'No deployment history found in Coolify'

    const logsRes = await fetch(`${url}/api/v1/deployments/${latestUuid}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!logsRes.ok) return `Failed to fetch deployment logs: HTTP ${logsRes.status}`
    const logsData = await logsRes.json() as { logs?: string; status?: string }
    return logsData.logs ?? `Deployment status: ${logsData.status ?? 'unknown'}, no logs available`
  } catch (err) {
    return `Error fetching Coolify logs: ${err instanceof Error ? err.message : String(err)}`
  }
}

export async function waitForHealthy(
  appUrl: string,
  options = { maxWaitMs: 180_000, intervalMs: 10_000 }
): Promise<void> {
  const deadline = Date.now() + options.maxWaitMs
  let lastError: string = 'unknown'

  // Try /health first, fall back to root path (not all apps have /health)
  const endpoints = [`${appUrl}/health`, appUrl]

  while (Date.now() < deadline) {
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          signal: AbortSignal.timeout(8000),
          // Skip TLS verification for sslip.io domains (self-signed or no cert)
          ...(endpoint.startsWith('http://') ? {} : {}),
        })
        if (res.ok) {
          logger.info({ msg: 'health_check_passed', url: endpoint })
          return
        }
        lastError = `HTTP ${res.status} from ${endpoint}`
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'connection refused'
      }
    }
    await new Promise(resolve => setTimeout(resolve, options.intervalMs))
  }

  throw Object.assign(
    new Error(`Health check failed after ${options.maxWaitMs / 1000}s: ${lastError}`),
    { code: 'HEALTH_CHECK_FAILED' }
  )
}
