import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { AppCard, type AppCardData } from '@/components/app-card'
import { ChevronLeft, Share2, Box, Users } from 'lucide-react'
import type { Metadata } from 'next'

function channelOgUrl(base: string, slug: string): string {
  return base + '/api/og/channel?slug=' + slug
}

/* ── Icon name + gradient maps (same as homepage) ── */

const categoryIcons: Record<string, string> = {
  Finance: 'TrendingUp',
  Security: 'Shield',
  Developer: 'Cpu',
  Analytics: 'BarChart3',
  Productivity: 'Globe',
  default: 'Layers',
}

const categoryGradients: Record<string, string> = {
  Finance: 'from-teal-500 to-cyan-600',
  Security: 'from-blue-500 to-cyan-500',
  Developer: 'from-green-500 to-teal-500',
  Analytics: 'from-sky-500 to-blue-500',
  Productivity: 'from-pink-500 to-rose-500',
  default: 'from-orange-500 to-red-500',
}

const FALLBACK_CATEGORIES = ['Productivity', 'Finance', 'Developer', 'Analytics', 'Security']

const channelColors = [
  'bg-orange-600',
  'bg-blue-600',
  'bg-rose-600',
  'bg-teal-600',
  'bg-amber-600',
]

type App = {
  id: string
  slug: string
  name: string
  description: string | null
  thumbnail_url: string | null
  credits_per_session: number
}

type Channel = {
  id: string
  slug: string
  name: string
  description: string | null
  banner_url: string | null
  avatar_url: string | null
}

type SessionCount = { total: string }

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
    `SELECT id, slug, name, description, thumbnail_url, credits_per_session
     FROM marketplace.apps
     WHERE channel_id = $1 AND status = 'live' AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [channel.id],
  )

  // Get total session count for the channel
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://terminalai.app'
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
      gradient: categoryGradients[category] ?? categoryGradients.default,
      icon: categoryIcons[category] ?? categoryIcons.default,
    }
  })
}

export default async function ChannelPage({ params }: PageProps) {
  const { channelSlug } = await params
  const data = await getData(channelSlug)
  if (!data) notFound()
  const { channel, apps, sessionCount } = data

  const appCards = mapAppsToCards(apps, channel.name, channel.slug)
  const colorClass = channelColors[channel.name.charCodeAt(0) % channelColors.length]
  const initial = channel.name.charAt(0).toUpperCase()

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <a
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        All channels
      </a>

      {/* Channel header card */}
      <div className="mb-8 rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          {channel.avatar_url ? (
            <img
              src={channel.avatar_url}
              alt={channel.name}
              className="w-16 h-16 rounded-2xl object-cover flex-shrink-0"
            />
          ) : (
            <div
              className={`w-16 h-16 rounded-2xl ${colorClass} flex items-center justify-center flex-shrink-0`}
            >
              <span className="text-2xl font-bold text-white">{initial}</span>
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight">
                  {channel.name}
                </h1>
                <p className="text-sm text-slate-400">@{channel.slug}</p>
              </div>

              {/* Share button */}
              <button className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-xl text-sm font-medium transition-colors flex-shrink-0">
                <Share2 className="w-4 h-4" />
                Share
              </button>
            </div>

            {channel.description && (
              <p className="mt-3 text-slate-600 leading-relaxed">{channel.description}</p>
            )}

            <div className="mt-4 flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-sm text-slate-500">
                <Box className="w-4 h-4 text-slate-400" />
                <span className="font-medium text-slate-700">{apps.length}</span>
                <span>apps</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-slate-500">
                <Users className="w-4 h-4 text-slate-400" />
                <span className="font-medium text-slate-700">{sessionCount.toLocaleString()}</span>
                <span>sessions</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sort tabs */}
      <div className="mb-6 flex items-center gap-1 bg-slate-50 rounded-xl p-1 w-fit">
        {['Popular', 'Newest', 'Most Used'].map((tab, idx) => (
          <button
            key={tab}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              idx === 0
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* App grid */}
      {apps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-20 text-center">
          <Box className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-400">No apps in this channel yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {appCards.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              href={`/c/${channel.slug}/${app.slug}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
