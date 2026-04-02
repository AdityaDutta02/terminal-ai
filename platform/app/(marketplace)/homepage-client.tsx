'use client'

import { useState, useMemo } from 'react'
import { AppCard, type AppCardData } from '@/components/app-card'
import { ChannelCard, type ChannelCardData } from '@/components/channel-card'
import { Footer } from '@/components/footer'
import { ArrowRight, Zap, Star, BarChart3, Headphones, Search } from 'lucide-react'

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
  const [searchQuery, setSearchQuery] = useState('')

  const featuredApps = apps.slice(0, 3)

  const filteredApps = useMemo(() => {
    let result =
      activeTab === 'All'
        ? apps
        : activeTab === 'Popular'
          ? apps.slice(0, 6)
          : activeTab === 'New'
            ? [...apps].reverse().slice(0, 6)
            : apps.filter((a) => a.category === activeTab)

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.description ?? '').toLowerCase().includes(q) ||
          a.channelName.toLowerCase().includes(q),
      )
    }

    return result
  }, [apps, activeTab, searchQuery])

  const filteredChannels = useMemo(() => {
    if (!searchQuery.trim()) return channels
    const q = searchQuery.toLowerCase()
    return channels.filter(
      (ch) =>
        ch.name.toLowerCase().includes(q) ||
        ch.slug.toLowerCase().includes(q),
    )
  }, [channels, searchQuery])

  const tabs = ['All', 'Popular', 'New', ...categories]

  return (
    <>
      <style>{`
        @keyframes float1 { 0%, 100% { transform: translateY(0) rotate(-1deg); } 50% { transform: translateY(-18px) rotate(1deg); } }
        @keyframes float2 { 0%, 100% { transform: translateY(0) rotate(1deg); } 50% { transform: translateY(-14px) rotate(-1deg); } }
        @keyframes float3 { 0%, 100% { transform: translateY(0) rotate(0.5deg); } 50% { transform: translateY(-20px) rotate(-0.5deg); } }
      `}</style>

      {/* ── Hero ── */}
      <section className="bg-[#060608] pt-20 pb-20 relative overflow-hidden">
        {/* Perspective grid */}
        <div
          className="absolute inset-0 bg-[linear-gradient(rgba(255,107,0,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,107,0,0.07)_1px,transparent_1px)] bg-[size:60px_60px] [perspective:600px] [transform:rotateX(55deg)] [transform-origin:50%_0%] [mask-image:linear-gradient(to_bottom,transparent_5%,black_30%,black_50%,transparent_90%)]"
          aria-hidden="true"
        />
        {/* Horizon glow */}
        <div
          className="absolute left-0 right-0 top-1/2 h-px bg-gradient-to-r from-transparent via-orange-500/30 to-transparent"
          aria-hidden="true"
        />
        {/* Ambient glow */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-orange-500/5 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-6xl px-6 flex items-center gap-12">
          {/* Left copy */}
          <div className="flex-1 min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 border border-orange-500/20 px-4 py-1.5 text-[13px] font-medium text-orange-400 mb-6">
              <Zap className="w-3.5 h-3.5" />
              Now in Beta &mdash; 10 free credits on signup
            </span>
            <h1 className="text-[56px] leading-[1.08] font-black text-white tracking-tight mb-6">
              AI micro-apps.
              <br />
              Built by creators.
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">
                Ready to use.
              </span>
            </h1>
            <p className="text-lg text-slate-400 mb-8 max-w-md leading-relaxed">
              Browse curated AI tools from independent creators. Run them
              instantly&mdash;no installs, no setup.
            </p>
            <div className="flex items-center gap-4 mb-10">
              <a
                href="/signup"
                className="inline-flex items-center gap-2 rounded-xl bg-[#FF6B00] px-6 py-3 text-[15px] font-semibold text-white shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-colors"
              >
                Start for free
                <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-6 py-3 text-[15px] font-semibold text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
              >
                View pricing
              </a>
            </div>
            {/* Stats row */}
            <div className="flex items-center gap-8">
              {[
                { value: '86+', label: 'Apps' },
                { value: '34', label: 'Channels' },
                { value: '12k+', label: 'Sessions' },
                { value: '4.7', label: 'Rating' },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <p className="text-xl font-bold text-white">{stat.value}</p>
                  <p className="text-[12px] text-slate-500 uppercase tracking-wide">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right floating cards */}
          <div className="hidden lg:block relative w-[380px] h-[400px] flex-shrink-0">
            {/* Card 1 */}
            <div
              className="absolute top-4 left-0 w-[220px] rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-5 shadow-2xl"
              style={{ animation: 'float1 6s ease-in-out infinite' }}
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center mb-3">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <p className="text-[14px] font-semibold text-white mb-1">Finance Analyzer</p>
              <p className="text-[12px] text-slate-400">Real-time market insights</p>
              <div className="flex items-center gap-1 mt-3">
                <Star className="w-3 h-3 text-orange-400 fill-orange-400" />
                <span className="text-[12px] text-slate-300">4.9</span>
              </div>
            </div>
            {/* Card 2 */}
            <div
              className="absolute top-16 right-0 w-[200px] rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-5 shadow-2xl"
              style={{ animation: 'float2 7s ease-in-out infinite' }}
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center mb-3">
                <Headphones className="w-5 h-5 text-white" />
              </div>
              <p className="text-[14px] font-semibold text-white mb-1">Content Writer</p>
              <p className="text-[12px] text-slate-400">AI-powered copywriting</p>
              <div className="flex items-center gap-1 mt-3">
                <Star className="w-3 h-3 text-orange-400 fill-orange-400" />
                <span className="text-[12px] text-slate-300">4.8</span>
              </div>
            </div>
            {/* Card 3 */}
            <div
              className="absolute bottom-8 left-10 w-[210px] rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-5 shadow-2xl"
              style={{ animation: 'float3 8s ease-in-out infinite' }}
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-3">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <p className="text-[14px] font-semibold text-white mb-1">Code Assistant</p>
              <p className="text-[12px] text-slate-400">Debug & refactor faster</p>
              <div className="flex items-center gap-1 mt-3">
                <Star className="w-3 h-3 text-orange-400 fill-orange-400" />
                <span className="text-[12px] text-slate-300">4.7</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust bar ── */}
      <section className="bg-[#F5F5F5] border-b border-slate-200 py-4">
        <div className="mx-auto max-w-6xl px-6 flex items-center justify-center gap-10">
          <span className="text-[12px] text-slate-400 uppercase tracking-wider whitespace-nowrap">
            Trusted by teams at
          </span>
          {['Acme Corp', 'Globex', 'Initech', 'Umbrella', 'Soylent'].map((name) => (
            <span
              key={name}
              className="text-[14px] font-semibold text-slate-300 tracking-wide hidden sm:inline"
            >
              {name}
            </span>
          ))}
        </div>
      </section>

      {/* ── Featured Apps ── */}
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-8">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Featured Apps</h2>
            <p className="text-[14px] text-slate-500 mt-1">
              Handpicked by the Terminal AI team
            </p>
          </div>
          <a
            href="#all-apps"
            className="text-[14px] font-medium text-[#FF6B00] hover:text-orange-700 transition-colors flex items-center gap-1"
          >
            View all <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featuredApps.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              href={`/c/${app.channelSlug}/${app.slug}`}
            />
          ))}
        </div>
      </section>

      {/* ── All Apps ── */}
      <section id="all-apps" className="mx-auto max-w-6xl px-6 pt-8 pb-16">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">All Apps</h2>
          <p className="text-[14px] text-slate-500 mt-1">
            Browse the full catalogue
          </p>
        </div>
        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search apps by name, description, or creator…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-[14px] text-slate-700 placeholder-slate-400 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all bg-white"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 bg-slate-100/70 rounded-lg p-1 mb-8 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
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
            {searchQuery.trim()
              ? `No apps matching "${searchQuery}". Try a different search.`
              : 'No apps in this category yet.'}
          </p>
        )}
      </section>

      {/* ── CTA Banner ── */}
      <section className="mx-auto max-w-6xl px-6">
        <div className="bg-[#0A0A0A] rounded-2xl p-12 mb-12 text-center relative overflow-hidden">
          <div
            className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,107,0,0.12),transparent_70%)]"
            aria-hidden="true"
          />
          <div className="relative">
            <h2 className="text-3xl font-bold text-white mb-3">
              Ready to build your own AI app?
            </h2>
            <p className="text-slate-400 mb-8 max-w-md mx-auto">
              Create a channel, deploy your app, and start earning credits from day one.
            </p>
            <div className="flex items-center justify-center gap-4">
              <a
                href="/signup"
                className="inline-flex items-center gap-2 rounded-xl bg-[#FF6B00] px-6 py-3 text-[15px] font-semibold text-white shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-colors"
              >
                Get started
                <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href="/developers"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-6 py-3 text-[15px] font-semibold text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
              >
                Read the docs
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Channels ── */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Explore Channels</h2>
          <p className="text-[14px] text-slate-500 mt-1">
            Discover creators and their app collections
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {filteredChannels.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              href={`/c/${channel.slug}`}
            />
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <div className="mx-auto max-w-6xl px-6">
        <Footer />
      </div>
    </>
  )
}
