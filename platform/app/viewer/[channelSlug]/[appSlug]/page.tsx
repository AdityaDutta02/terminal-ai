import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { ViewerShell } from './viewer-shell'

type AppRow = {
  id: string
  name: string
  iframe_url: string
  credits_per_session: number
  deployment_status: string | null
  deployment_error: string | null
}

async function getApp(channelSlug: string, appSlug: string): Promise<AppRow | null> {
  const result = await db.query<AppRow>(
    `SELECT a.id, a.name, a.iframe_url, a.credits_per_session,
            d.status AS deployment_status,
            d.error_message AS deployment_error
     FROM marketplace.apps a
     JOIN marketplace.channels c ON c.id = a.channel_id
     LEFT JOIN LATERAL (
       SELECT status, error_message
       FROM deployments.deployments
       WHERE app_id = a.id
       ORDER BY created_at DESC
       LIMIT 1
     ) d ON true
     WHERE c.slug = $1 AND a.slug = $2 AND a.deleted_at IS NULL`,
    [channelSlug, appSlug],
  )
  return result.rows[0] ?? null
}

async function getCredits(userId: string): Promise<number> {
  const res = await db.query<{ credits: number }>(
    `SELECT COALESCE(
       (SELECT balance_after FROM subscriptions.credit_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1),
       (SELECT credits FROM "user" WHERE id = $1), 0
     ) AS credits`,
    [userId],
  ).catch(() => null)
  return res?.rows[0]?.credits ?? 0
}

export default async function ViewerPage({
  params,
}: {
  params: Promise<{ channelSlug: string; appSlug: string }>
}) {
  const { channelSlug, appSlug } = await params
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) notFound()
  const [app, credits] = await Promise.all([
    getApp(channelSlug, appSlug),
    getCredits(session.user.id),
  ])
  if (!app) notFound()
  return (
    <ViewerShell
      appId={app.id}
      appName={app.name}
      channelSlug={channelSlug}
      iframeUrl={app.iframe_url}
      initialCredits={credits}
      userName={session.user.name ?? session.user.email ?? ''}
      deploymentStatus={app.deployment_status}
      deploymentError={app.deployment_error}
    />
  )
}
