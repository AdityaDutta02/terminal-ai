import { db } from '@/lib/db'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { HomepageClient } from './homepage-client'
import type { AppCardData } from '@/components/app-card'
import type { ChannelCardData } from '@/components/channel-card'
/* ── Icon name + gradient maps ── */

function getCategoryIcon(cat: string): string {
  return 'Finance,TrendingUp|Security,Shield|Developer,Cpu|Analytics,BarChart3|Productivity,Globe'
    .split('|').find((e) => e.startsWith(cat))?.split(',')[1] ?? 'Layers'
}

function getCategoryGradient(cat: string): string {
  return 'Finance,from-teal-500 to-cyan-600|Security,from-blue-500 to-cyan-500|Developer,from-green-500 to-teal-500|Analytics,from-sky-500 to-blue-500|Productivity,from-pink-500 to-rose-500'
    .split('|').find((e) => e.startsWith(cat))?.split(',')[1] ?? 'from-orange-500 to-red-500'
}

async function getCreditBalance(userId: string): Promise<number> {
  const result = await db.query<{ credits: number; [key: string]: unknown }>(
    `SELECT COALESCE(
       (SELECT balance_after FROM subscriptions.credit_ledger
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1),
       (SELECT credits FROM "user" WHERE id = $1),
       0
     ) AS credits`,
    [userId],
  ).catch(() => null)
  return result?.rows[0]?.credits ?? 0
}

const channelColors = [
  'bg-orange-600',
  'bg-blue-600',
  'bg-rose-600',
  'bg-teal-600',
  'bg-amber-600',
]

/* ── Category assignment (round-robin until a real column exists) ── */
const FALLBACK_CATEGORIES = ['Productivity', 'Finance', 'Developer', 'Analytics', 'Security']

/* ── Deterministic pseudo-random values seeded by app ID ── */
function idHash(id: string, seed: number): number {
  let h = seed
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0
  return h >>> 0
}
function deterministicRating(id: string): number {
  return Number((4.2 + (idHash(id, 7) % 8) * 0.1).toFixed(1))
}
function deterministicReviewCount(id: string): number {
  return 10 + (idHash(id, 13) % 90)
}

/* ── Data fetching ── */

type AppRow = {
  id: string
  name: string
  slug: string
  description: string | null
  credits_per_session: number
  channel_name: string
  channel_slug: string
  status: string
}

async function getApps(): Promise<AppCardData[]> {
  const result = await db.query<AppRow>(
    `SELECT a.id, a.name, a.slug, a.description, a.status,
            COALESCE(a.credits_per_session, 5) AS credits_per_session,
            c.name AS channel_name, c.slug AS channel_slug
     FROM marketplace.apps a
     JOIN marketplace.channels c ON c.id = a.channel_id
     WHERE a.status IN ('live', 'coming_soon') AND a.deleted_at IS NULL AND c.deleted_at IS NULL
     ORDER BY a.created_at DESC
     LIMIT 30`,
  )

  return result.rows.map((row, idx) => {
    const category = FALLBACK_CATEGORIES[idx % FALLBACK_CATEGORIES.length]
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      channelName: row.channel_name,
      channelSlug: row.channel_slug,
      description: row.description ?? 'An AI-powered micro-app',
      credits: row.credits_per_session,
      rating: deterministicRating(row.id),
      reviewCount: deterministicReviewCount(row.id),
      category,
      status: row.status as 'live' | 'coming_soon',
      gradient: getCategoryGradient(category),
      icon: getCategoryIcon(category),
    }
  })
}

type ChannelRow = {
  id: string
  slug: string
  name: string
  description: string | null
  avatar_url: string | null
  app_count: string
  session_count: string
}

async function getChannels(): Promise<ChannelCardData[]> {
  const result = await db.query<ChannelRow>(
    `SELECT c.id, c.slug, c.name, c.description, c.avatar_url,
            COUNT(a.id) AS app_count,
            0 AS session_count
     FROM marketplace.channels c
     LEFT JOIN marketplace.apps a
       ON a.channel_id = c.id AND a.status = 'live' AND a.deleted_at IS NULL
     WHERE c.status = 'active' AND c.deleted_at IS NULL
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
  )

  return result.rows.map((row, idx) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    handle: `@${row.slug}`,
    description: row.description ?? 'A creator channel on Terminal AI',
    appCount: Number(row.app_count),
    sessionCount: Number(row.session_count),
    avatarColor: channelColors[idx % channelColors.length],
    letter: row.name.charAt(0).toUpperCase(),
  }))
}

/* ── Page ── */

export default async function HomePage() {
  const [apps, channels, session] = await Promise.all([
    getApps(),
    getChannels(),
    auth.api.getSession({ headers: await headers() }),
  ])
  const credits = session ? await getCreditBalance(session.user.id) : null

  const categories = Array.from(new Set(apps.map((a) => a.category)))

  return (
    <HomepageClient
      apps={apps}
      channels={channels}
      categories={categories}
      isLoggedIn={!!session}
      credits={credits}
    />
  )
}
