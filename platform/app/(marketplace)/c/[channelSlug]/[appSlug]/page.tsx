import { db } from '@/lib/db'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ShareButton } from '@/components/share-button'
import { ArrowLeft, Coins, ExternalLink, Layers } from 'lucide-react'
import type { Metadata } from 'next'
function appOgUrl(base: string, id: string) {
  return base + '/api/og/app?id=' + id
}
type AppRow = {
  id: string
  slug: string
  name: string
  description: string | null
  thumbnail_url: string | null
  credits_per_session: number
}
type ChannelRow = { id: string; slug: string; name: string }
async function getData(channelSlug: string, appSlug: string) {
  const ch = await db.query<ChannelRow>(
    `SELECT id, slug, name FROM marketplace.channels
     WHERE slug = $1 AND deleted_at IS NULL`,
    [channelSlug],
  )
  if (!ch.rows[0]) return null
  const ap = await db.query<AppRow>(
    `SELECT id, slug, name, description, thumbnail_url, credits_per_session
     FROM marketplace.apps
     WHERE channel_id = $1 AND slug = $2 AND status = 'live' AND deleted_at IS NULL`,
    [ch.rows[0].id, appSlug],
  )
  if (!ap.rows[0]) return null
  return { channel: ch.rows[0], app: ap.rows[0] }
}
type PageProps = { params: Promise<{ channelSlug: string; appSlug: string }> }
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { channelSlug, appSlug } = await params
  const data = await getData(channelSlug, appSlug)
  if (!data) return {}
  const { channel, app } = data
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://terminalai.app'
  const ogUrl = appOgUrl(appUrl, app.id)
  return {
    title: `${app.name} — Terminal AI`,
    description: app.description ?? `An AI-powered app in ${channel.name}`,
    openGraph: {
      title: app.name,
      description: app.description ?? `An AI-powered app in ${channel.name}`,
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: app.name,
      description: app.description ?? `An AI-powered app in ${channel.name}`,
      images: [ogUrl],
    },
  }
}
export default async function AppDetailPage({ params }: PageProps) {
  const { channelSlug, appSlug } = await params
  const data = await getData(channelSlug, appSlug)
  if (!data) notFound()
  const { channel, app } = data
  const session = await auth.api.getSession({ headers: await headers() })
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://terminalai.app'
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <a
        href={`/c/${channel.slug}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {channel.name}
      </a>
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-col gap-8 p-8 sm:flex-row">
          <div className="flex-shrink-0">
            {app.thumbnail_url ? (
              <img
                src={app.thumbnail_url}
                alt={app.name}
                className="h-48 w-48 rounded-xl object-cover border border-gray-100 shadow-sm"
              />
            ) : (
              <div className="flex h-48 w-48 items-center justify-center rounded-xl bg-gradient-to-br from-violet-50 to-indigo-50 border border-gray-100">
                <Layers className="h-12 w-12 text-violet-200" />
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col">
            <div className="mb-2 flex items-start gap-2 flex-wrap">
              <Badge variant="violet">AI App</Badge>
              <ShareButton url={appUrl + '/c/' + channel.slug + '/' + app.slug} title={app.name} description={app.description ?? ''} type="app" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">{app.name}</h1>
            <p className="mt-1 text-sm text-gray-400">in {channel.name}</p>
            {app.description && (
              <p className="mt-4 text-gray-600 leading-relaxed">{app.description}</p>
            )}
            <div className="mt-6 flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <Coins className="h-4 w-4 text-violet-500" />
              <span className="text-sm text-gray-600">
                <span className="font-semibold text-gray-900">{app.credits_per_session} credits</span>
                {' '}per session
              </span>
            </div>
            <div className="mt-6">
              {session ? (
                <Button size="lg" asChild className="w-full sm:w-auto">
                  <a href={`/viewer/${channel.slug}/${app.slug}`}>
                    <ExternalLink className="h-4 w-4" />
                    Open app
                  </a>
                </Button>
              ) : (
                <div className="space-y-3">
                  <Button size="lg" asChild className="w-full sm:w-auto">
                    <a href={`/login?next=/viewer/${channel.slug}/${app.slug}`}>
                      Sign in to launch
                    </a>
                  </Button>
                  <p className="text-xs text-gray-400">
                    New users get 20 free credits after email verification.{' '}
                    <a href="/signup" className="text-violet-600 hover:underline">Create account →</a>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
