import { db } from '@/lib/db'
import { HomepageClient } from './homepage-client'
import type { AppCardData } from '@/components/app-card'
import type { ChannelCardData } from '@/components/channel-card'
import { TrendingUp, Shield, Cpu, BarChart3, Globe, Layers } from 'lucide-react'

/* ── Icon + gradient maps ── */

const categoryIcons: Record<string, typeof TrendingUp> = {
  Finance: TrendingUp,
  Security: Shield,
  Developer: Cpu,
  Analytics: BarChart3,
  Productivity: Globe,
  default: Layers,
}

const categoryGradients: Record<string, string> = {
  Finance: 'from-teal-500 to-cyan-600',
  Security: 'from-blue-500 to-cyan-500',
  Developer: 'from-green-500 to-teal-500',
  Analytics: 'from-sky-500 to-blue-500',
  Productivity: 'from-pink-500 to-rose-500',
  default: 'from-orange-500 to-red-500',
}

const channelColors = [
  'bg-orange-600',
  'bg-blue-600',
  'bg-rose-600',
  'bg-teal-600',
  'bg-violet-600',
]

/* ── Category assignment (round-robin until a real column exists) ── */
const FALLBACK_CATEGORIES = ['Productivity', 'Finance', 'Developer', 'Analytics', 'Security']

/* ── Data fetching ── */

type AppRow = {
  id: string
  name: string
  slug: string
  description: string | null
  credits_per_session: number
  channel_name: string
  channel_slug: string
}

async function getApps(): Promise<AppCardData[]> {
  const result = await db.query<AppRow>(
    `SELECT a.id, a.name, a.slug, a.description,
            COALESCE(a.credits_per_session, 50) AS credits_per_session,
            c.name AS channel_name, c.slug AS channel_slug
     FROM marketplace.apps a
     JOIN marketplace.channels c ON c.id = a.channel_id
     WHERE a.status = 'live' AND a.deleted_at IS NULL AND c.deleted_at IS NULL
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
      rating: Number((4.2 + Math.random() * 0.7).toFixed(1)),
      reviewCount: 10 + Math.floor(Math.random() * 90),
      category,
      gradient: categoryGradients[category] ?? categoryGradients.default,
      icon: categoryIcons[category] ?? categoryIcons.default,
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
  const [apps, channels] = await Promise.all([getApps(), getChannels()])

  const categories = Array.from(new Set(apps.map((a) => a.category)))

  return <HomepageClient apps={apps} channels={channels} categories={categories} />
}
