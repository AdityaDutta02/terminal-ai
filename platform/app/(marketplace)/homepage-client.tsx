'use client'

import { useState, useMemo } from 'react'
import { AppCard, type AppCardData } from '@/components/app-card'
import { ChannelCard, type ChannelCardData } from '@/components/channel-card'
import { Footer } from '@/components/footer'
import { ArrowRight } from 'lucide-react'

const HERO_TAGS_RAW = 'AI Tools|Productivity|Finance|Analytics|Writing'
const HERO_TAGS = HERO_TAGS_RAW.split('|')

export function HomepageClient({
  apps,
  channels,
  categories,
}: {
  apps: AppCardData[]
  channels: ChannelCardData[]
  categories: string[]
}) {
  const [activeTab, setActiveTab] = useState('All')

  const filteredApps = useMemo(() => {
    const result =
      activeTab === 'All'
        ? apps
        : activeTab === 'Popular'
          ? apps.slice(0, 6)
          : activeTab === 'New'
            ? [...apps].reverse().slice(0, 6)
            : apps.filter((a) => a.category === activeTab)

    return result
  }, [apps, activeTab])

  const tabs = ['All', 'Popular', 'New', ...categories]

  return (
    <>
      <style>{`
        @keyframes aurora-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .aurora-bg {
          background: linear-gradient(
            135deg,
            #fce4ec 0%,
            #fdf3e7 20%,
            #f8eaf6 40%,
            #fce4ec 60%,
            #fff3e0 80%,
            #f3e5f5 100%
          );
          background-size: 300% 300%;
          animation: aurora-shift 12s ease infinite;
        }
      `}</style>

      {/* ── Hero ── */}
      <section className="aurora-bg pt-24 pb-20 relative overflow-hidden" data-testid="hero-section">
        {/* Soft radial blobs */}
        <div
          className="absolute top-[-80px] left-[-120px] w-[500px] h-[500px] rounded-full bg-pink-300/30 blur-[100px] pointer-events-none"
          aria-hidden="true"
        />
        <div
          className="absolute top-[60px] right-[-80px] w-[400px] h-[400px] rounded-full bg-purple-300/25 blur-[100px] pointer-events-none"
          aria-hidden="true"
        />
        <div
          className="absolute bottom-[-60px] left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-orange-200/30 blur-[90px] pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-4xl px-6 text-center">
          {/* Beta badge */}
          <span className="inline-flex items-center gap-2 rounded-full border border-pink-200 bg-white/60 backdrop-blur-sm px-4 py-1.5 text-[13px] font-medium text-pink-700 mb-8">
            Now in Beta &mdash; 10 free credits on signup
          </span>

          {/* Main heading */}
          <h1 className="font-display text-[56px] sm:text-[68px] leading-[1.08] text-slate-900 tracking-tight mb-8">
            Terminal AI is a platform for:
          </h1>

          {/* Category pills */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 mb-12" data-testid="hero-tags">
            {HERO_TAGS.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-slate-300/70 bg-white/50 backdrop-blur-sm px-4 py-1.5 text-[14px] font-medium text-slate-700 hover:border-slate-400 hover:bg-white/80 transition-all cursor-default"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* CTA */}
          <a
            href="#all-apps"
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-7 py-3.5 text-[15px] font-semibold text-white hover:bg-slate-700 transition-colors shadow-lg shadow-slate-900/10"
            data-testid="hero-cta"
          >
            Explore Apps
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* ── All Apps ── */}
      <section id="all-apps" className="mx-auto max-w-6xl px-6 pt-16 pb-16" data-testid="all-apps-section">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">All Apps</h2>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 bg-slate-100/80 rounded-lg p-1 mb-8 overflow-x-auto" data-testid="filter-tabs">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              data-testid={`tab-${tab}`}
              className={`px-4 py-2 rounded-md text-[13px] font-medium whitespace-nowrap transition-all ${
                activeTab === tab
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredApps.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              href={`/c/${app.channelSlug}/${app.slug}`}
            />
          ))}
        </div>

        {filteredApps.length === 0 && (
          <p className="text-center text-slate-400 py-12">
            {'No apps in this category yet.'}
          </p>
        )}
      </section>

      {/* ── Channels ── */}
      <section className="mx-auto max-w-6xl px-6 pb-16" data-testid="channels-section">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Explore Channels</h2>
          <p className="text-[14px] text-slate-500 mt-1">
            Discover creators and their app collections
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {channels.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              href={`/c/${channel.slug}`}
            />
          ))}
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="mx-auto max-w-6xl px-6 pb-16" data-testid="cta-section">
        <div className="bg-[#0A0A0A] rounded-2xl p-12 text-center relative overflow-hidden">
          <div
            className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,107,0,0.10),transparent_65%)] pointer-events-none"
            aria-hidden="true"
          />
          <div className="relative">
            <h2 className="text-3xl font-bold text-white mb-4">
              Start building with Terminal AI
            </h2>
            <p className="text-slate-400 mb-8 max-w-sm mx-auto text-[15px] leading-relaxed">
              Create a channel, deploy your app, and start earning credits from day one.
            </p>
            <a
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-[15px] font-semibold text-slate-900 hover:bg-slate-100 transition-colors shadow-lg"
              data-testid="cta-signup"
            >
              Get started
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <div className="mx-auto max-w-6xl px-6">
        <Footer />
      </div>
    </>
  )
}
