type DeployJob = {
  deploymentId: string
  appId: string
  githubRepo: string
  branch: string
  subdomain: string
}
const DEPLOY_MANAGER_URL = process.env.DEPLOY_MANAGER_URL ?? 'http://deploy-manager:3002'
export const deployQueue = {
  add: async (_name: string, job: DeployJob): Promise<void> => {
    const res = await fetch(DEPLOY_MANAGER_URL + '/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job),
    })
    if (!res.ok) throw new Error('deploy-manager enqueue failed: ' + res.status)
  },
}
