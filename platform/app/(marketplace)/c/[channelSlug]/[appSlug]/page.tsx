import { db } from '@/lib/db'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { notFound } from 'next/navigation'
import { ChevronLeft, Star, Play } from 'lucide-react'
import { AppDetailClient } from './app-detail-client'
import type { Metadata } from 'next'

function appOgUrl(base: string, id: string): string {
  return base + '/api/og/app?id=' + id
}

type AppRow = {
  id: string
  slug: string
  name: string
  description: string | null
  thumbnail_url: string | null
  credits_per_session: number
  status: 'live' | 'coming_soon'
}

type ChannelRow = { id: string; slug: string; name: string }

async function getData(
  channelSlug: string,
  appSlug: string,
): Promise<{ channel: ChannelRow; app: AppRow } | null> {
  const ch = await db.query<ChannelRow>(
    `SELECT id, slug, name FROM marketplace.channels
     WHERE slug = $1 AND deleted_at IS NULL`,
    [channelSlug],
  )
  if (!ch.rows[0]) return null
  const ap = await db.query<AppRow>(
    `SELECT id, slug, name, description, thumbnail_url, credits_per_session, status
     FROM marketplace.apps
     WHERE channel_id = $1 AND slug = $2 AND status IN ('live', 'coming_soon') AND deleted_at IS NULL`,
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
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <a
        href={`/c/${channel.slug}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        {channel.name}
      </a>

      {/* App hero */}
      <div className="mb-8">
        <div className="flex items-start gap-5">
          {/* Icon */}
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center flex-shrink-0">
            <Play className="w-9 h-9 text-white" />
          </div>

          <div className="min-w-0">
            <span className="text-[11px] font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
              AI App
            </span>
            <h1 className="mt-1.5 text-[32px] font-extrabold text-slate-900 tracking-tight leading-tight">
              {app.name}
            </h1>
            <p className="text-sm text-slate-500">
              by{' '}
              <a
                href={`/c/${channel.slug}`}
                className="text-orange-600 hover:underline font-medium"
              >
                {channel.name}
              </a>
            </p>
            <div className="mt-2 flex items-center gap-3">
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-orange-400 fill-orange-400" />
                <span className="text-sm font-medium text-slate-700">4.5</span>
                <span className="text-sm text-slate-400">(2 reviews)</span>
              </div>
              <span className="text-slate-200">|</span>
              <span className="text-sm text-slate-400">-- sessions</span>
            </div>
          </div>
        </div>
      </div>

      {/* Coming soon banner */}
      {app.status === 'coming_soon' && (
        <div
          data-testid="coming-soon-banner"
          className="rounded-xl border border-violet-200 bg-violet-50 p-4 mb-6"
        >
          <p className="text-sm font-medium text-violet-700">
            This app is coming soon. Stay tuned!
          </p>
        </div>
      )}

      {/* Two-column layout */}
      <AppDetailClient
        appName={app.name}
        appDescription={app.description ?? 'An AI-powered micro-app on Terminal AI.'}
        channelName={channel.name}
        channelSlug={channel.slug}
        appSlug={app.slug}
        credits={app.credits_per_session}
        isLoggedIn={!!session}
        appUrl={appUrl}
      />
    </div>
  )
}
