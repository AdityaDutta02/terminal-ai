import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { DeploymentDetail } from './deployment-detail'

const DEPLOY_MANAGER_URL = process.env.DEPLOY_MANAGER_URL ?? 'http://deploy-manager:3002'

export default async function DeploymentDetailPage({
  params,
}: {
  params: Promise<{ appId: string; deploymentId: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')

  const { appId, deploymentId } = await params

  const res = await fetch(`${DEPLOY_MANAGER_URL}/deployments/${deploymentId}/logs`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}` },
  })
  if (!res.ok) redirect(`/creator/apps/${appId}/deployments`)

  const data = await res.json() as {
    deployment: Record<string, string | null | number>
    events: Array<Record<string, string | null>>
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          <a href="/creator" className="hover:underline">Creator</a>
          {' › '}
          <a href={`/creator/apps/${appId}/deployments`} className="hover:underline">Deployments</a>
          {' › '}
          <span className="font-mono text-xs">{deploymentId.slice(0, 8)}</span>
        </p>
      </div>
      <DeploymentDetail
        appId={appId}
        deploymentId={deploymentId}
        initialData={data}
      />
    </div>
  )
}
