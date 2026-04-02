import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { SidebarNav } from '@/components/sidebar-nav'
import { getCreatorTabs } from '@/lib/creator-tabs'
import { Box, Layers, Play, Sparkles, Users, Plus } from 'lucide-react'

type ChannelRow = {
  id: string
  slug: string
  name: string
  description: string | null
  app_count: string
  total_sessions: string
}

async function getCreatorChannels(userId: string): Promise<ChannelRow[]> {
  const result = await db.query<ChannelRow>(
    `SELECT c.id, c.slug, c.name, c.description,
            COUNT(DISTINCT a.id) AS app_count,
            COUNT(DISTINCT ac.id) AS total_sessions
     FROM marketplace.channels c
     LEFT JOIN marketplace.apps a ON a.channel_id = c.id AND a.deleted_at IS NULL
     LEFT JOIN gateway.api_calls ac ON ac.app_id = a.id
     WHERE c.creator_id = $1 AND c.deleted_at IS NULL
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    [userId],
  )
  return result.rows
}


function getChannelColor(index: number): string {
  const colors = 'bg-orange-100,bg-blue-100,bg-emerald-100,bg-purple-100,bg-pink-100,bg-amber-100,bg-cyan-100,bg-rose-100'
  const list = colors.split(',')
  return list[index % list.length]
}

export default async function CreatorDashboard() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login?next=/creator')
  // Creator routes locked to admin — remove this check to open to all creators
  if ((session.user as Record<string, unknown>).role !== 'admin') redirect('/')
  const channels = await getCreatorChannels(session.user.id)

  const totalApps = channels.reduce((sum, ch) => sum + Number(ch.app_count), 0)
  const totalSessions = channels.reduce((sum, ch) => sum + Number(ch.total_sessions), 0)

  const stats = [
    {
      label: 'Total Apps',
      value: totalApps.toLocaleString(),
      change: 'Across all channels',
      icon: Box,
      iconBg: 'bg-orange-50',
      iconColor: 'text-orange-600',
    },
    {
      label: 'Total Sessions',
      value: totalSessions.toLocaleString(),
      change: 'All time',
      icon: Play,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
    },
    {
      label: 'Credit Revenue',
      value: '0',
      change: 'Coming soon',
      icon: Sparkles,
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
    },
    {
      label: 'Active Users',
      value: '0',
      change: 'Coming soon',
      icon: Users,
      iconBg: 'bg-purple-50',
      iconColor: 'text-purple-600',
    },
  ]

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex gap-8">
        <SidebarNav title="Creator Studio" tabs={getCreatorTabs()} />

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight">Dashboard</h1>
              <p className="text-[14px] text-slate-400 mt-1">Manage your channels and apps</p>
            </div>
            <a
              href="/creator/channels/new"
              className="inline-flex items-center gap-2 h-[40px] px-5 rounded-xl bg-[#FF6B00] text-[14px] font-semibold text-white shadow-sm hover:bg-[#E55F00] transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Channel
            </a>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            {stats.map((stat) => {
              const StatIcon = stat.icon
              return (
                <div
                  key={stat.label}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5"
                >
                  <div className={`w-10 h-10 rounded-xl ${stat.iconBg} flex items-center justify-center mb-3`}>
                    <StatIcon className={`w-5 h-5 ${stat.iconColor}`} />
                  </div>
                  <p className="text-[13px] text-slate-400">{stat.label}</p>
                  <p className="text-[24px] font-extrabold font-mono text-slate-900 mt-0.5">{stat.value}</p>
                  <p className="text-[12px] text-slate-400 mt-1">{stat.change}</p>
                </div>
              )
            })}
          </div>

          {/* Channels section */}
          <div>
            <h2 className="text-[18px] font-bold text-slate-900 mb-4">Your Channels</h2>
            {channels.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 py-20 text-center">
                <Layers className="mx-auto mb-4 h-10 w-10 text-slate-200" />
                <h3 className="mb-1 text-[14px] font-semibold text-slate-500">No channels yet</h3>
                <p className="mb-6 text-[14px] text-slate-400">Create your first channel to start publishing AI apps</p>
                <a
                  href="/creator/channels/new"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#FF6B00] px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-[#E55F00] transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Create channel
                </a>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {channels.map((ch, index) => (
                  <a
                    key={ch.id}
                    href={`/creator/channels/${ch.slug}`}
                    className="group bg-white rounded-2xl border border-slate-100 shadow-sm p-5 transition-all hover:border-orange-200 hover:shadow-md"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 ${getChannelColor(index)} rounded-xl flex items-center justify-center flex-shrink-0`}>
                        <span className="text-[18px] font-bold text-slate-600">
                          {ch.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-[15px] font-semibold text-slate-900 group-hover:text-orange-700 transition-colors truncate">
                            {ch.name}
                          </h3>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-[11px] font-medium text-emerald-600 flex-shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Live
                          </span>
                        </div>
                        <p className="text-[13px] text-slate-400 mt-0.5">@{ch.slug}</p>
                        <div className="flex items-center gap-4 mt-3 text-[13px] text-slate-400">
                          <span className="flex items-center gap-1.5">
                            <Box className="w-3.5 h-3.5" />
                            {ch.app_count} apps
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Play className="w-3.5 h-3.5" />
                            {ch.total_sessions} sessions
                          </span>
                        </div>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
