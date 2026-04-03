'use client'

import { useRef, useEffect, useState } from 'react'
import type { AppCardData } from '@/components/app-card'
import { ArrowRight, ArrowUpRight, Plus, X } from 'lucide-react'

const CARD_GRADIENTS = 'from-green-400/80 to-emerald-600/90|from-orange-400/80 to-amber-600/90|from-violet-400/80 to-purple-600/90|from-cyan-400/80 to-teal-600/90|from-pink-400/80 to-rose-600/90|from-blue-400/80 to-indigo-600/90'

function getGradient(i: number): string {
  return CARD_GRADIENTS.split('|')[i % 6]
}

export function HomepageClient({
  apps,
  isLoggedIn = false,
  credits = null,
}: {
  apps: AppCardData[]
  channels: unknown[]
  categories: string[]
  isLoggedIn?: boolean
  credits?: number | null
}) {
  const carouselRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')

  /* Sticky carousel: pin the section and scroll cards horizontally as user scrolls */
  useEffect(() => {
    const section = sectionRef.current
    const carousel = carouselRef.current
    if (!section || !carousel) return

    const onScroll = () => {
      const rect = section.getBoundingClientRect()
      const sectionTop = window.scrollY + rect.top
      const scrollInSection = window.scrollY - sectionTop
      const maxScroll = carousel.scrollWidth - carousel.clientWidth

      if (scrollInSection > 0 && scrollInSection < maxScroll) {
        carousel.scrollLeft = scrollInSection
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* Limit to 6 cards, fill with placeholders */
  const topApps = apps.slice(0, 6)
  const fillCount = Math.max(0, 6 - topApps.length)

  return (
    <>
      <style>{`
        nav.sticky { display: none !important; }
        @keyframes grain { 0%,100%{transform:translate(0,0)} 10%{transform:translate(-5%,-10%)} 20%{transform:translate(-15%,5%)} 30%{transform:translate(7%,-25%)} 40%{transform:translate(-5%,25%)} 50%{transform:translate(-15%,10%)} 60%{transform:translate(15%,0%)} 70%{transform:translate(0%,15%)} 80%{transform:translate(3%,35%)} 90%{transform:translate(-10%,10%)} }
        .noise::before { content:''; position:absolute; inset:-50%; width:200%; height:200%; background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); opacity:0.04; pointer-events:none; animation:grain 8s steps(10) infinite; }
        @keyframes menuIn { from { opacity:0; transform:translateY(-8px) scale(0.95); } to { opacity:1; transform:translateY(0) scale(1); } }
        .menu-enter { animation: menuIn 0.2s ease-out forwards; }
        @keyframes spin45 { from { transform:rotate(0deg); } to { transform:rotate(45deg); } }
        @keyframes spinBack { from { transform:rotate(45deg); } to { transform:rotate(0deg); } }
        .plus-open { animation: spin45 0.2s ease-out forwards; }
        .plus-closed { animation: spinBack 0.2s ease-out forwards; }
      `}</style>

      {/* ── Top bar ── */}
      <div className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between px-8 py-5">
        <a href="/" className="text-[22px] font-display text-[#1e1e1f] tracking-tight">
          Terminal AI
        </a>
        <div className="flex items-center gap-3">
          {/* Tokens pill — only when logged in */}
          {isLoggedIn && (
            <a
              href="/pricing"
              className="flex items-center gap-2.5 rounded-full pl-2.5 pr-3.5 py-1.5 bg-white/60 backdrop-blur-sm hover:bg-white/80 transition-all duration-200"
            >
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#FF6B00] text-white">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1l2.1 4.3L15 6l-3.5 3.4.8 4.6L8 11.8 3.7 14l.8-4.6L1 6l4.9-.7L8 1z" fill="currentColor" />
                </svg>
              </span>
              <span className="text-[13px] font-mono font-semibold text-[#1e1e1f] tabular-nums">
                {(credits ?? 0).toLocaleString()}
              </span>
              <span className="text-[11px] text-[#1e1e1f]/35 font-medium hidden sm:inline">tokens</span>
            </a>
          )}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((p) => !p)}
              className="w-10 h-10 rounded-full bg-[#1e1e1f] flex items-center justify-center transition-all duration-200 hover:scale-110 hover:shadow-lg hover:shadow-black/20 active:scale-95"
            >
              {menuOpen
                ? <X className="w-5 h-5 text-white plus-open" />
                : <Plus className="w-5 h-5 text-white plus-closed" />}
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-14 w-[180px] bg-white rounded-2xl border border-[#1e1e1f]/[0.06] shadow-2xl py-2 z-50 menu-enter">
                {isLoggedIn ? (
                  <>
                    <a href="/c/invest-os" className="block px-4 py-2.5 text-[14px] text-[#1e1e1f] hover:bg-[#1e1e1f]/[0.03] transition-colors">Explore</a>
                    <a href="/account" className="block px-4 py-2.5 text-[14px] text-[#1e1e1f] hover:bg-[#1e1e1f]/[0.03] transition-colors">Account</a>
                    <a href="/pricing" className="block px-4 py-2.5 text-[14px] text-[#1e1e1f] hover:bg-[#1e1e1f]/[0.03] transition-colors">Pricing</a>
                  </>
                ) : (
                  <>
                    <a href="/login" className="block px-4 py-2.5 text-[14px] text-[#1e1e1f] hover:bg-[#1e1e1f]/[0.03] transition-colors">Sign in</a>
                    <a href="/signup" className="block px-4 py-2.5 text-[14px] text-[#1e1e1f] hover:bg-[#1e1e1f]/[0.03] transition-colors">Sign up</a>
                    <a href="/pricing" className="block px-4 py-2.5 text-[14px] text-[#1e1e1f] hover:bg-[#1e1e1f]/[0.03] transition-colors">Pricing</a>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Hero ── */}
      <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden noise">
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(145deg, #f8a4c8 0%, #f4845f 20%, #f7b267 40%, #f8a4c8 60%, #c9a7eb 80%, #f0e0d0 100%)' }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-[250px] bg-gradient-to-t from-[#f5f5f0] to-transparent" />

        <div className="relative z-10 max-w-[900px] mx-auto px-6 text-center pt-24 pb-16">
          <h1 className="font-display text-[clamp(42px,7vw,72px)] leading-[1.08] text-[#1e1e1f] tracking-[-0.03em]">
            Where AI apps
            <br />
            come alive
          </h1>
          <p className="mt-6 text-[17px] text-[#1e1e1f]/55 max-w-md mx-auto leading-relaxed">
            Discover, run, and build intelligent micro-apps — no setup, no code, no friction.
          </p>
          <a
            href={isLoggedIn ? '/c/invest-os' : '/login'}
            className="mt-8 inline-flex items-center gap-2 bg-[#1e1e1f] text-white rounded-full px-7 py-3.5 text-[15px] font-medium hover:bg-[#333] transition-all duration-200 hover:shadow-lg hover:shadow-black/15 active:scale-[0.98]"
          >
            {isLoggedIn ? 'Explore Apps' : 'Get Started'}
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* ── App Carousel (sticky-scroll) ── */}
      <section
        ref={sectionRef}
        className="bg-[#f5f5f0] pt-20 pb-10"
        style={{ minHeight: '200vh' }}
      >
        <div className="sticky top-0 pt-12 pb-20 overflow-hidden">
          <div className="max-w-[1400px] mx-auto px-8 mb-10">
            <h2 className="font-display text-[clamp(28px,4vw,42px)] text-[#1e1e1f] tracking-[-0.02em]">
              Featured Apps
            </h2>
          </div>

          <div
            ref={carouselRef}
            className="flex gap-6 px-8 overflow-x-hidden"
            style={{ scrollbarWidth: 'none' }}
          >
            {topApps.map((app, i) => (
              <a
                key={app.id}
                href={app.status === 'coming_soon' ? '#' : `/c/${app.channelSlug}/${app.slug}`}
                className="flex-shrink-0 w-[360px] group"
              >
                <div className={`relative h-[280px] rounded-[24px] overflow-hidden mb-4 bg-gradient-to-br ${getGradient(i)}`}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-28 h-28 rounded-3xl bg-white/20 backdrop-blur-sm rotate-12 group-hover:rotate-3 transition-transform duration-700" />
                    <div className="absolute w-16 h-16 rounded-2xl bg-white/30 backdrop-blur-sm -rotate-12 translate-x-10 translate-y-8 group-hover:-rotate-3 transition-transform duration-700" />
                    <div className="absolute w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm rotate-45 -translate-x-12 -translate-y-6 group-hover:rotate-[30deg] transition-transform duration-700" />
                  </div>
                  {app.status === 'coming_soon' ? (
                    <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-[#1e1e1f] rounded-full px-3 py-1.5">
                      <span className="text-[12px] font-medium text-white">Coming soon</span>
                      <ArrowUpRight className="w-3 h-3 text-white" />
                    </div>
                  ) : (
                    <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-[#1e1e1f]/80 backdrop-blur-sm rounded-full px-3 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <span className="text-[12px] font-medium text-white">Open app</span>
                      <ArrowUpRight className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
                <h3 className="text-[18px] font-medium text-[#1e1e1f] mb-1 tracking-[-0.01em]">{app.name}</h3>
                <p className="text-[14px] text-[#1e1e1f]/50 leading-relaxed line-clamp-2 mb-3">{app.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-medium text-[#1e1e1f]/70">{app.credits} credits</span>
                  {app.status === 'live' && (
                    <span className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Live
                    </span>
                  )}
                </div>
              </a>
            ))}

            {Array.from({ length: fillCount }, (_, i) => (
              <div key={`ph-${i}`} className="flex-shrink-0 w-[360px]">
                <div className={`relative h-[280px] rounded-[24px] overflow-hidden mb-4 bg-gradient-to-br ${getGradient(topApps.length + i)}`}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-28 h-28 rounded-3xl bg-white/20 backdrop-blur-sm rotate-12" />
                    <div className="absolute w-16 h-16 rounded-2xl bg-white/30 backdrop-blur-sm -rotate-12 translate-x-10 translate-y-8" />
                  </div>
                  <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-[#1e1e1f] rounded-full px-3 py-1.5">
                    <span className="text-[12px] font-medium text-white">Coming soon</span>
                    <ArrowUpRight className="w-3 h-3 text-white" />
                  </div>
                </div>
                <h3 className="text-[18px] font-medium text-[#1e1e1f] mb-1">AI App {i + 1}</h3>
                <p className="text-[14px] text-[#1e1e1f]/50 leading-relaxed line-clamp-2 mb-3">An intelligent app powered by AI.</p>
                <span className="text-[14px] font-medium text-[#1e1e1f]/70">5 credits</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="bg-[#f5f5f0] pb-24">
        <div className="max-w-[960px] mx-auto px-6">
          <h2 className="font-display text-[clamp(32px,5vw,50px)] text-[#1e1e1f] text-center tracking-[-0.02em] mb-4">
            Pricing
          </h2>

          {/* Billing toggle */}
          <div className="flex justify-center mb-12">
            <div className="inline-flex items-center bg-[#1e1e1f] rounded-full p-1">
              <button
                onClick={() => setBilling('monthly')}
                className={`px-5 py-2 rounded-full text-[13px] font-medium transition-all duration-200 ${billing === 'monthly' ? 'bg-[#FF6B00] text-white' : 'text-white/50 hover:text-white/80'}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBilling('annual')}
                className={`px-5 py-2 rounded-full text-[13px] font-medium transition-all duration-200 ${billing === 'annual' ? 'bg-[#FF6B00] text-white' : 'text-white/50 hover:text-white/80'}`}
              >
                Annual
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Subscription */}
            <div className="relative bg-white rounded-[24px] border-2 border-[#FF6B00] p-8">
              <div className="absolute -top-3 left-6">
                <span className="bg-[#FF6B00] text-white text-[11px] font-semibold px-3 py-1 rounded-full">Recommended</span>
              </div>
              <p className="text-[12px] font-semibold uppercase tracking-widest text-orange-600 mb-1">Subscription</p>
              <p className="text-[14px] text-slate-500 mb-5">Best value for regular users</p>
              <div className="mb-6">
                {billing === 'monthly' ? (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[40px] font-bold text-[#1e1e1f] tracking-tight">₹99</span>
                      <span className="text-slate-400 text-[14px]">/first month</span>
                    </div>
                    <p className="text-[13px] text-slate-400 mt-0.5">then ₹299/month</p>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[40px] font-bold text-[#1e1e1f] tracking-tight">₹2,499</span>
                      <span className="text-slate-400 text-[14px]">/year</span>
                    </div>
                    <p className="text-[13px] text-slate-400 mt-0.5">Save ₹1,089 vs monthly</p>
                  </>
                )}
              </div>
              <a href="/login?next=/pricing" className="block w-full py-3 rounded-full bg-[#FF6B00] hover:bg-[#E55D00] text-white font-semibold text-[14px] text-center transition-all duration-200 hover:shadow-lg hover:shadow-orange-200/50">
                Sign in to subscribe
              </a>
              <ul className="mt-6 space-y-2.5">
                <li className="flex items-start gap-2 text-[13px] text-slate-600"><span className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 flex-shrink-0" />Monthly credit allowance</li>
                <li className="flex items-start gap-2 text-[13px] text-slate-600"><span className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 flex-shrink-0" />Session-based billing</li>
                <li className="flex items-start gap-2 text-[13px] text-slate-600"><span className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 flex-shrink-0" />Access all marketplace apps</li>
                <li className="flex items-start gap-2 text-[13px] text-slate-600"><span className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 flex-shrink-0" />Email support</li>
                <li className="flex items-start gap-2 text-[13px] text-slate-600"><span className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 flex-shrink-0" />Usage analytics dashboard</li>
              </ul>
            </div>

            {/* Pay as you go */}
            <div className="bg-white rounded-[24px] border border-slate-200 p-8">
              <p className="text-[12px] font-semibold uppercase tracking-widest text-slate-500 mb-1">Pay as you go</p>
              <p className="text-[14px] text-slate-500 mb-5">Buy credits when you need them</p>
              <div className="mb-5">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-[32px] font-bold text-[#1e1e1f] tracking-tight">500</span>
                  <span className="text-[13px] text-slate-400">credits</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full">
                  <div className="h-full w-[10%] bg-[#1e1e1f] rounded-full" />
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                  <span>100</span>
                  <span>5,000</span>
                </div>
              </div>
              <div className="bg-[#f5f5f0] rounded-xl p-4 mb-5">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-[24px] font-bold text-[#1e1e1f]">₹225</span>
                    <span className="text-[13px] text-slate-400 ml-1">one-time</span>
                  </div>
                  <span className="text-[12px] text-slate-400">₹0.45/credit</span>
                </div>
              </div>
              <a href="/login?next=/pricing" className="block w-full py-3 rounded-full bg-[#1e1e1f] hover:bg-[#333] text-white font-semibold text-[14px] text-center transition-all duration-200 hover:shadow-lg">
                Sign in to buy
              </a>
              <p className="mt-4 text-[11px] text-slate-400 text-center">Credits never expire. Powered by Razorpay.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-[#1e1e1f] py-12">
        <div className="max-w-[1200px] mx-auto px-8 flex items-center justify-between">
          <a href="/" className="text-[18px] font-display text-white/80 tracking-tight hover:text-white transition-colors">
            Terminal AI
          </a>
          <div className="flex items-center gap-8">
            <a href="/terms" className="text-[13px] text-white/40 hover:text-white/70 transition-colors">Terms</a>
            <a href="/privacy" className="text-[13px] text-white/40 hover:text-white/70 transition-colors">Privacy</a>
          </div>
        </div>
      </footer>
    </>
  )
}
