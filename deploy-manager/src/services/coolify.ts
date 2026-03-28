import { logger } from '../lib/logger'
function coolifyConfig() {
  const url = process.env.COOLIFY_URL
  const token = process.env.COOLIFY_TOKEN
  if (!url || !token) throw new Error('COOLIFY_URL and COOLIFY_TOKEN must be set')
  return { url, token }
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
export async function getAppStatus(coolifyAppId: string): Promise<string> {
  const { url, token } = coolifyConfig()
  const res = await fetch(`${url}/api/v1/applications/${coolifyAppId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Coolify status failed: ${res.status}`)
  const data = await res.json() as { status: string }
  return data.status
}
export async function createApp(params: {
  name: string
  githubRepo: string
  branch: string
  port: number
  envVars: Record<string, string>
}): Promise<string> {
  const { url, token } = coolifyConfig()
  const res = await fetch(`${url}/api/v1/applications`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: params.name,
      git_repository: params.githubRepo,
      git_branch: params.branch,
      ports_exposes: String(params.port),
      environment_variables: params.envVars,
    }),
  })
  if (!res.ok) throw new Error(`Coolify create failed: ${res.status} ${await res.text()}`)
  const data = await res.json() as { uuid: string }
  logger.info({ msg: 'coolify_app_created', name: params.name, uuid: data.uuid })
  return data.uuid
}
