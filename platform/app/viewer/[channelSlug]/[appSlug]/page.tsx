import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import ViewerShell from './viewer-shell'

type AppRow = { id: string; name: string; iframe_url: string; credits_per_session: number }

async function getApp(channelSlug: string, appSlug: string): Promise<AppRow | null> {
  const result = await db.query<AppRow>(
    `SELECT a.id, a.name, a.iframe_url, a.credits_per_session
     FROM marketplace.apps a
     JOIN marketplace.channels c ON c.id = a.channel_id
     WHERE c.slug = $1 AND a.slug = $2 AND a.status = 'live' AND a.deleted_at IS NULL`,
    [channelSlug, appSlug]
  )
  return result.rows[0] ?? null
}

export default async function ViewerPage({
  params,
}: {
  params: Promise<{ channelSlug: string; appSlug: string }>
}) {
  const { channelSlug, appSlug } = await params
  const app = await getApp(channelSlug, appSlug)
  if (!app) notFound()

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) notFound()

  return <ViewerShell appId={app.id} appName={app.name} iframeUrl={app.iframe_url} />
}
