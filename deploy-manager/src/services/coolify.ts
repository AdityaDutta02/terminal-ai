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
  const res = await fetch(`${url}/api/v1/applications/${coolifyAppId}/deploy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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
export async function createApp(params: {
  name: string
  githubRepo: string
  branch: string
  port: number
  fqdn: string
  envVars: Record<string, string>
}): Promise<string> {
  const { url, token, serverUuid, projectUuid } = coolifyConfig()
  const res = await fetch(`${url}/api/v1/applications/public`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: params.name,
      fqdn: params.fqdn,
      git_repository: `https://github.com/${params.githubRepo}`,
      git_branch: params.branch,
      build_pack: 'dockerfile',
      ports_exposes: String(params.port),
      server_uuid: serverUuid,
      project_uuid: projectUuid,
      environment_name: 'production',
      environment_variables: params.envVars,
      instant_deploy: false,
    }),
  })
  if (!res.ok) throw new Error(`Coolify create failed: ${res.status} ${await res.text()}`)
  const data = await res.json() as { uuid: string }
  logger.info({ msg: 'coolify_app_created', name: params.name, uuid: data.uuid, fqdn: params.fqdn })
  return data.uuid
}
