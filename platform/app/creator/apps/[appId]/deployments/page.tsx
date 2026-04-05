import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { DeploymentList } from './deployment-list'

export default async function DeploymentsPage({
  params,
}: {
  params: Promise<{ appId: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')

  const { appId } = await params

  const { rows: appRows } = await db.query(
    `SELECT a.id, a.name FROM marketplace.apps a
     WHERE a.id = $1 AND a.channel_id IN (
       SELECT id FROM marketplace.channels WHERE creator_id = $2
     )`,
    [appId, session.user.id]
  )
  if (appRows.length === 0) redirect('/creator')

  const app = appRows[0] as { id: string; name: string }

  const { rows: deployments } = await db.query(
    `SELECT id, status, error_code, started_at, completed_at, retry_count, created_at
     FROM deployments.deployments
     WHERE app_id = $1
     ORDER BY created_at DESC LIMIT 20`,
    [appId]
  )

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          <a href="/creator" className="hover:underline">Creator</a>
          {' › '}
          <a href={`/creator/apps/${appId}`} className="hover:underline">{app.name}</a>
          {' › '}
          Deployments
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{app.name} - Deployments</h1>
      </div>
      <DeploymentList
        appId={appId}
        initialDeployments={deployments as Array<Record<string, string | null>>}
      />
    </div>
  )
}
