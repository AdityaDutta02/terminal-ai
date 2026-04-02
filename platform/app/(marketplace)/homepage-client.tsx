'use client'

import { useRef, useEffect, useState } from 'react'
import { AppCard, type AppCardData } from '@/components/app-card'
import { Footer } from '@/components/footer'
import { ArrowRight, ArrowUpRight, Plus } from 'lucide-react'

/* ── Placeholder 3D gradient cards for empty slots ── */
const PLACEHOLDER_GRADIENTS = 'from-green-400/80 to-emerald-600/90|from-orange-400/80 to-amber-600/90|from-violet-400/80 to-purple-600/90|from-cyan-400/80 to-teal-600/90|from-pink-400/80 to-rose-600/90|from-blue-400/80 to-indigo-600/90'

function getPlaceholderGradient(index: number): string {
  const gradients = PLACEHOLDER_GRADIENTS.split('|')
  return gradients[index % gradients.length]
}

export function HomepageClient({
  apps,
}: {
  apps: AppCardData[]
  channels: unknown[]
  categories: string[]
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  /* Auto-scroll carousel on page scroll */
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const handleScroll = () => {
      const rect = container.getBoundingClientRect()
      const viewH = window.innerHeight
      if (rect.top < viewH && rect.bottom > 0) {
        const progress = 1 - (rect.top / viewH)
        const maxScroll = container.scrollWidth - container.clientWidth
        container.scrollLeft = Math.max(0, Math.min(maxScroll, progress * maxScroll * 0.6))
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  /* Build display cards — real apps + placeholders to fill at least 6 */
  const displayCards = [...apps]
  const placeholderCount = Math.max(0, 6 - apps.length)
  const placeholders = Array.from({ length: placeholderCount }, (_, i) => ({
    id: `placeholder-${i}`,
    name: `AI App ${i + 1}`,
    description: 'An intelligent app that helps you accomplish tasks faster with AI.',
    credits: 5,
    isPlaceholder: true,
    gradientIndex: apps.length + i,
    status: 'coming_soon' as const,
  }))

  return (
    <>
      <style>{`
        @keyframes grain { 0%,100% { transform: translate(0,0) } 10% { transform: translate(-5%,-10%) } 20% { transform: translate(-15%,5%) } 30% { transform: translate(7%,-25%) } 40% { transform: translate(-5%,25%) } 50% { transform: translate(-15%,10%) } 60% { transform: translate(15%,0%) } 70% { transform: translate(0%,15%) } 80% { transform: translate(3%,35%) } 90% { transform: translate(-10%,10%) } }
        .noise-overlay::before { content: ''; position: absolute; inset: -50%; width: 200%; height: 200%; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); opacity: 0.035; pointer-events: none; animation: grain 8s steps(10) infinite; }
      `}</style>

      {/* ── Minimal top bar (overlays the layout Navbar) ── */}
      <div className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between px-8 py-5">
        <a href="/" className="text-[22px] font-display text-[#1e1e1f] tracking-tight">
          Terminal AI
        </a>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((p) => !p)}
            className="w-10 h-10 rounded-full bg-[#1e1e1f] flex items-center justify-center hover:bg-[#333] transition-colors"
          >
            <Plus className="w-5 h-5 text-white" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-14 w-[180px] bg-white rounded-xl border border-slate-100 shadow-xl py-1.5 z-50">
              <a href="/login" className="block px-4 py-2 text-[14px] text-slate-700 hover:bg-slate-50">Sign in</a>
              <a href="/signup" className="block px-4 py-2 text-[14px] text-slate-700 hover:bg-slate-50">Sign up</a>
              <a href="/pricing" className="block px-4 py-2 text-[14px] text-slate-700 hover:bg-slate-50">Pricing</a>
              <a href="/account" className="block px-4 py-2 text-[14px] text-slate-700 hover:bg-slate-50">Account</a>
            </div>
          )}
        </div>
      </div>

      {/* ── Hero ── */}
      <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden noise-overlay">
        {/* Gradient background */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, #f8a4c8 0%, #f4845f 25%, #f7b267 45%, #f8a4c8 65%, #c9a7eb 85%, #f0e0d0 100%)',
          }}
        />
        {/* Fade to white at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-[200px] bg-gradient-to-t from-[#f5f5f0] to-transparent" />

        <div className="relative z-10 max-w-[900px] mx-auto px-6 text-center pt-24 pb-16">
          <h1
            className="font-display text-[clamp(40px,7vw,72px)] leading-[1.08] text-[#1e1e1f] tracking-[-0.03em]"
          >
            Where AI apps
            <br />
            come alive
          </h1>
          <p className="mt-6 text-[17px] text-[#1e1e1f]/60 max-w-md mx-auto leading-relaxed">
            Discover, run, and build intelligent micro-apps — no setup, no code, no friction.
          </p>
        </div>
      </section>

      {/* ── Apps Carousel ── */}
      <section className="bg-[#f5f5f0] py-20">
        <div className="max-w-[1400px] mx-auto px-8">
          <div className="flex items-end justify-between mb-10">
            <h2 className="font-display text-[clamp(28px,4vw,42px)] text-[#1e1e1f] tracking-[-0.02em] leading-tight">
              Featured Apps
            </h2>
          </div>

          {/* Scroll-on-scroll carousel */}
          <div
            ref={scrollRef}
            className="flex gap-6 overflow-x-auto scroll-smooth pb-4"
            style={{ scrollbarWidth: 'none' }}
          >
            {displayCards.map((app, i) => (
              <a
                key={app.id}
                href={app.status === 'coming_soon' ? '#' : `/c/${app.channelSlug}/${app.slug}`}
                className="flex-shrink-0 w-[360px] group"
              >
                {/* Card image area */}
                <div className={`relative h-[280px] rounded-[24px] overflow-hidden mb-4 bg-gradient-to-br ${getPlaceholderGradient(i)}`}>
                  {/* 3D-style floating shapes */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-24 h-24 rounded-2xl bg-white/20 backdrop-blur-sm rotate-12 group-hover:rotate-6 transition-transform duration-500" />
                    <div className="absolute w-16 h-16 rounded-xl bg-white/30 backdrop-blur-sm -rotate-12 translate-x-8 translate-y-6 group-hover:-rotate-6 transition-transform duration-500" />
                  </div>
                  {/* Coming Soon / View badge */}
                  {app.status === 'coming_soon' ? (
                    <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-[#1e1e1f] rounded-full px-3 py-1.5">
                      <span className="text-[12px] font-medium text-white">Coming soon</span>
                      <ArrowUpRight className="w-3 h-3 text-white" />
                    </div>
                  ) : (
                    <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-[#1e1e1f]/80 backdrop-blur-sm rounded-full px-3 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[12px] font-medium text-white">Open app</span>
                      <ArrowUpRight className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
                {/* Card info */}
                <h3 className="text-[18px] font-medium text-[#1e1e1f] mb-1 tracking-[-0.01em]">
                  {app.name}
                </h3>
                <p className="text-[14px] text-[#1e1e1f]/50 leading-relaxed line-clamp-2 mb-3">
                  {app.description}
                </p>
                {/* Credits + status */}
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-medium text-[#1e1e1f]/70">
                    {app.credits} credits
                  </span>
                  {app.status === 'live' && (
                    <span className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Live
                    </span>
                  )}
                </div>
              </a>
            ))}

            {/* Placeholder cards */}
            {placeholders.map((p) => (
              <div key={p.id} className="flex-shrink-0 w-[360px]">
                <div className={`relative h-[280px] rounded-[24px] overflow-hidden mb-4 bg-gradient-to-br ${getPlaceholderGradient(p.gradientIndex)}`}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-24 h-24 rounded-2xl bg-white/20 backdrop-blur-sm rotate-12" />
                    <div className="absolute w-16 h-16 rounded-xl bg-white/30 backdrop-blur-sm -rotate-12 translate-x-8 translate-y-6" />
                  </div>
                  <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-[#1e1e1f] rounded-full px-3 py-1.5">
                    <span className="text-[12px] font-medium text-white">Coming soon</span>
                    <ArrowUpRight className="w-3 h-3 text-white" />
                  </div>
                </div>
                <h3 className="text-[18px] font-medium text-[#1e1e1f] mb-1">{p.name}</h3>
                <p className="text-[14px] text-[#1e1e1f]/50 leading-relaxed line-clamp-2 mb-3">{p.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-medium text-[#1e1e1f]/70">{p.credits} credits</span>
                  <span className="text-[12px] font-medium text-violet-600">Coming Soon</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="bg-[#0A0A0A] py-24">
        <div className="max-w-[960px] mx-auto px-6">
          <h2 className="font-display text-[clamp(32px,5vw,50px)] text-white text-center tracking-[-0.02em] mb-4">
            Pricing
          </h2>

          {/* Billing toggle */}
          <div className="flex justify-center mb-12">
            <div className="inline-flex items-center bg-white/10 rounded-full p-1">
              <span className="px-5 py-2 rounded-full text-sm font-medium bg-[#FF6B00] text-white">
                Monthly
              </span>
              <span className="px-5 py-2 rounded-full text-sm font-medium text-white/60">
                Annual
              </span>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Subscription */}
            <div className="relative bg-white rounded-[24px] p-8">
              <div className="absolute -top-3 left-6">
                <span className="bg-[#FF6B00] text-white text-[11px] font-semibold px-3 py-1 rounded-full">
                  Recommended
                </span>
              </div>
              <p className="text-[12px] font-semibold uppercase tracking-widest text-orange-600 mb-1">
                Subscription
              </p>
              <p className="text-[14px] text-slate-500 mb-5">Best value for regular users</p>
              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-[40px] font-bold text-[#1e1e1f] tracking-tight">₹99</span>
                  <span className="text-slate-400 text-[14px]">/first month</span>
                </div>
                <p className="text-[13px] text-slate-400 mt-0.5">then ₹299/month</p>
              </div>
              <a
                href="/login?next=/pricing"
                className="block w-full py-3 rounded-xl bg-[#FF6B00] hover:bg-[#E55D00] text-white font-semibold text-[14px] text-center transition-colors"
              >
                Sign in to subscribe
              </a>
              <ul className="mt-6 space-y-2.5">
                <li className="flex items-start gap-2 text-[13px] text-slate-600"><span className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 flex-shrink-0" />Monthly credit allowance</li>
                <li className="flex items-start gap-2 text-[13px] text-slate-600"><span className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 flex-shrink-0" />Session-based billing</li>
                <li className="flex items-start gap-2 text-[13px] text-slate-600"><span className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 flex-shrink-0" />Access all marketplace apps</li>
                <li className="flex items-start gap-2 text-[13px] text-slate-600"><span className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 flex-shrink-0" />Email support</li>
                <li className="flex items-start gap-2 text-[13px] text-slate-600"><span className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 flex-shrink-0" />Priority support (Creator+)</li>
                <li className="flex items-start gap-2 text-[13px] text-slate-600"><span className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 flex-shrink-0" />Usage analytics dashboard</li>
              </ul>
            </div>

            {/* Pay as you go */}
            <div className="bg-[#f5f5f0] rounded-[24px] p-8">
              <p className="text-[12px] font-semibold uppercase tracking-widest text-slate-500 mb-1">
                Pay as you go
              </p>
              <p className="text-[14px] text-slate-500 mb-5">Buy credits when you need them</p>
              <div className="mb-5">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-[32px] font-bold text-[#1e1e1f] tracking-tight">500</span>
                  <span className="text-[13px] text-slate-400">credits</span>
                </div>
                <div className="w-full h-1.5 bg-slate-300/50 rounded-full">
                  <div className="h-full w-[10%] bg-[#1e1e1f] rounded-full" />
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                  <span>100</span>
                  <span>5,000</span>
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 mb-5">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-[24px] font-bold text-[#1e1e1f]">₹225</span>
                    <span className="text-[13px] text-slate-400 ml-1">one-time</span>
                  </div>
                  <span className="text-[12px] text-slate-400">₹0.45/credit</span>
                </div>
              </div>
              <a
                href="/login?next=/pricing"
                className="block w-full py-3 rounded-xl bg-[#1e1e1f] hover:bg-[#333] text-white font-semibold text-[14px] text-center transition-colors"
              >
                Sign in to buy
              </a>
              <p className="mt-4 text-[11px] text-slate-400 text-center">
                Credits never expire. Powered by Razorpay.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <div className="bg-[#f5f5f0]">
        <div className="max-w-[1200px] mx-auto px-6">
          <Footer />
        </div>
      </div>
    </>
  )
}
