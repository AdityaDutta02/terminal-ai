import { db } from '@/lib/db'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
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
  [key: string]: unknown
}

type ChannelRow = { id: string; slug: string; name: string; [key: string]: unknown }

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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://terminalai.studioionique.com'
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://terminalai.studioionique.com'

  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      <div className="max-w-[1200px] mx-auto px-6 py-10">
        {/* Back link */}
        <a
          href={`/c/${channel.slug}`}
          className="inline-flex items-center gap-2 text-[14px] font-medium text-[#1e1e1f]/40 hover:text-[#1e1e1f]/70 transition-colors mb-10"
        >
          <ArrowLeft className="w-4 h-4" />
          {channel.name}
        </a>

        {/* App hero — clean, open */}
        <div className="mb-12">
          <div className="flex items-start gap-6">
            {/* App icon */}
            <div className="w-[72px] h-[72px] rounded-[20px] bg-gradient-to-br from-[#FF6B00] to-[#E55D00] flex items-center justify-center flex-shrink-0 shadow-lg shadow-orange-200/40">
              <span className="text-[28px] font-bold text-white/90">
                {app.name.charAt(0).toUpperCase()}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              {app.status === 'coming_soon' && (
                <span
                  data-testid="coming-soon-badge"
                  className="inline-block mb-2 px-3 py-1 rounded-full bg-violet-100 text-[11px] font-semibold text-violet-600"
                >
                  Coming Soon
                </span>
              )}
              <h1 className="text-[clamp(28px,4vw,42px)] font-display text-[#1e1e1f] tracking-[-0.02em] leading-[1.1]">
                {app.name}
              </h1>
              <p className="text-[14px] text-[#1e1e1f]/40 mt-1.5">
                by{' '}
                <a
                  href={`/c/${channel.slug}`}
                  className="text-[#FF6B00] hover:text-[#E55D00] font-medium transition-colors"
                >
                  {channel.name}
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-[#1e1e1f]/8 mb-10" />

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
    </div>
  )
}
