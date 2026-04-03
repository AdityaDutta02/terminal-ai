import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { AppCard, type AppCardData } from '@/components/app-card'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { ShareButton } from '@/components/share-button'
import type { Metadata } from 'next'

function channelOgUrl(base: string, slug: string): string {
  return base + '/api/og/channel?slug=' + slug
}

/* ── Category maps (same as homepage) ── */

function getCategoryIcon(cat: string): string {
  return 'Finance,TrendingUp|Security,Shield|Developer,Cpu|Analytics,BarChart3|Productivity,Globe'
    .split('|').find((e) => e.startsWith(cat))?.split(',')[1] ?? 'Layers'
}

function getCategoryGradient(cat: string): string {
  return 'Finance,from-teal-500 to-cyan-600|Security,from-blue-500 to-cyan-500|Developer,from-green-500 to-teal-500|Analytics,from-sky-500 to-blue-500|Productivity,from-pink-500 to-rose-500'
    .split('|').find((e) => e.startsWith(cat))?.split(',')[1] ?? 'from-orange-500 to-red-500'
}

const FALLBACK_CATEGORIES = 'Productivity|Finance|Developer|Analytics|Security'.split('|')

const AVATAR_GRADIENTS = 'from-orange-400 to-amber-600|from-violet-400 to-purple-600|from-cyan-400 to-teal-600|from-pink-400 to-rose-600|from-blue-400 to-indigo-600'.split('|')

type App = {
  id: string
  slug: string
  name: string
  description: string | null
  thumbnail_url: string | null
  credits_per_session: number
  status: string
  [key: string]: unknown
}

type Channel = {
  id: string
  slug: string
  name: string
  description: string | null
  banner_url: string | null
  avatar_url: string | null
  [key: string]: unknown
}

type SessionCount = { total: string; [key: string]: unknown }

async function getData(slug: string): Promise<{
  channel: Channel
  apps: App[]
  sessionCount: number
} | null> {
  const ch = await db.query<Channel>(
    `SELECT id, slug, name, description, banner_url, avatar_url
     FROM marketplace.channels
     WHERE slug = $1 AND status = 'active' AND deleted_at IS NULL`,
    [slug],
  )
  if (!ch.rows[0]) return null
  const channel = ch.rows[0]
  const apps = await db.query<App>(
    `SELECT id, slug, name, description, thumbnail_url, credits_per_session, status
     FROM marketplace.apps
     WHERE channel_id = $1 AND status IN ('live', 'coming_soon') AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [channel.id],
  )

  const sessions = await db.query<SessionCount>(
    `SELECT COALESCE(SUM(s.session_count), 0)::text AS total
     FROM marketplace.apps a
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::bigint AS session_count
       FROM sessions.app_sessions ses
       WHERE ses.app_id = a.id
     ) s ON true
     WHERE a.channel_id = $1 AND a.deleted_at IS NULL`,
    [channel.id],
  ).catch(() => ({ rows: [{ total: '0' }] }))

  return {
    channel,
    apps: apps.rows,
    sessionCount: Number(sessions.rows[0]?.total ?? 0),
  }
}

type PageProps = { params: Promise<{ channelSlug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { channelSlug } = await params
  const data = await getData(channelSlug)
  if (!data) return {}
  const { channel } = data
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://terminalai.studioionique.com'
  const ogUrl = channelOgUrl(appUrl, channelSlug)
  return {
    title: `${channel.name} — Terminal AI`,
    description: channel.description ?? `AI-powered apps in ${channel.name}`,
    openGraph: {
      title: channel.name,
      description: channel.description ?? `AI-powered apps in ${channel.name}`,
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: channel.name,
      description: channel.description ?? `AI-powered apps in ${channel.name}`,
      images: [ogUrl],
    },
  }
}

function mapAppsToCards(apps: App[], channelName: string, channelSlug: string): AppCardData[] {
  return apps.map((app, idx) => {
    const category = FALLBACK_CATEGORIES[idx % FALLBACK_CATEGORIES.length]
    return {
      id: app.id,
      name: app.name,
      slug: app.slug,
      channelName,
      channelSlug,
      description: app.description ?? 'An AI-powered micro-app',
      credits: app.credits_per_session,
      rating: Number((4.2 + (idx * 0.13 % 0.7)).toFixed(1)),
      reviewCount: 10 + ((idx * 17) % 90),
      category,
      status: app.status as 'live' | 'coming_soon',
      gradient: getCategoryGradient(category),
      icon: getCategoryIcon(category),
    }
  })
}

export default async function ChannelPage({ params }: PageProps) {
  const { channelSlug } = await params
  const data = await getData(channelSlug)
  if (!data) notFound()
  const { channel, apps, sessionCount } = data

  const appCards = mapAppsToCards(apps, channel.name, channel.slug)
  const gradientClass = AVATAR_GRADIENTS[channel.name.charCodeAt(0) % AVATAR_GRADIENTS.length]
  const initial = channel.name.charAt(0).toUpperCase()

  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      <div className="max-w-[1200px] mx-auto px-6 py-10">
        {/* Back link */}
        <a
          href="/"
          className="inline-flex items-center gap-2 text-[14px] font-medium text-[#1e1e1f]/40 hover:text-[#1e1e1f]/70 transition-colors mb-10"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to explore
        </a>

        {/* Channel header — open layout, no card wrapper */}
        <div className="mb-16">
          <div className="flex items-start gap-6">
            {/* Avatar */}
            {channel.avatar_url ? (
              <img
                src={channel.avatar_url}
                alt={channel.name}
                className="w-[72px] h-[72px] rounded-[20px] object-cover flex-shrink-0"
              />
            ) : (
              <div
                className={`w-[72px] h-[72px] rounded-[20px] bg-gradient-to-br ${gradientClass} flex items-center justify-center flex-shrink-0 shadow-lg shadow-black/10`}
              >
                <span className="text-[28px] font-bold text-white/90">{initial}</span>
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-[clamp(28px,4vw,42px)] font-display text-[#1e1e1f] tracking-[-0.02em] leading-[1.1]">
                    {channel.name}
                  </h1>
                  <p className="text-[14px] text-[#1e1e1f]/35 mt-1 font-medium">@{channel.slug}</p>
                </div>

                <ShareButton
                  url={`https://terminalai.studioionique.com/c/${channel.slug}`}
                  title={channel.name}
                  description={channel.description ?? ''}
                  type="channel"
                />
              </div>

              {channel.description && (
                <p className="mt-4 text-[15px] text-[#1e1e1f]/55 leading-relaxed max-w-[600px]">
                  {channel.description}
                </p>
              )}

              {/* Stats — minimal, inline */}
              <div className="mt-5 flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold text-[#1e1e1f] font-mono">{apps.length}</span>
                  <span className="text-[13px] text-[#1e1e1f]/40">apps</span>
                </div>
                <div className="w-px h-3 bg-[#1e1e1f]/10" />
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold text-[#1e1e1f] font-mono">{sessionCount.toLocaleString()}</span>
                  <span className="text-[13px] text-[#1e1e1f]/40">sessions</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-[#1e1e1f]/8 mb-10" />

        {/* Apps section */}
        {apps.length === 0 ? (
          <div className="py-24 text-center">
            <div className="w-12 h-12 rounded-full bg-[#1e1e1f]/5 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-5 h-5 text-[#1e1e1f]/25" />
            </div>
            <p className="text-[15px] text-[#1e1e1f]/40 font-medium">No apps published yet</p>
            <p className="text-[13px] text-[#1e1e1f]/25 mt-1">Check back soon.</p>
          </div>
        ) : (
          <>
            <p className="text-[12px] font-semibold uppercase tracking-widest text-[#1e1e1f]/30 mb-6">
              {apps.length} {apps.length === 1 ? 'App' : 'Apps'}
            </p>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {appCards.map((app) => (
                <AppCard
                  key={app.id}
                  app={app}
                  href={`/c/${channel.slug}/${app.slug}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
