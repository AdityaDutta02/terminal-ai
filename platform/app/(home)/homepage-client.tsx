'use client'

import { useRef, useState, useCallback } from 'react'
import type { AppCardData } from '@/components/app-card'
import { ArrowRight, ArrowUpRight, Plus, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useSignOut } from '@/hooks/use-sign-out'

const CARD_GRADIENTS = 'from-green-400/80 to-emerald-600/90|from-orange-400/80 to-amber-600/90|from-violet-400/80 to-purple-600/90|from-cyan-400/80 to-teal-600/90|from-pink-400/80 to-rose-600/90|from-blue-400/80 to-indigo-600/90'

function getGradient(i: number): string {
  return CARD_GRADIENTS.split('|')[i % 6]
}

export function HomepageClient({
  apps,
  isLoggedIn = false,
  credits = null,
  paymentSuccess = false,
}: {
  apps: AppCardData[]
  channels: unknown[]
  categories: string[]
  isLoggedIn?: boolean
  credits?: number | null
  paymentSuccess?: boolean
}) {
  const carouselRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(paymentSuccess)
  const signOut = useSignOut()

  const scrollCarousel = useCallback((direction: -1 | 1) => {
    const carousel = carouselRef.current
    if (!carousel) return
    carousel.scrollBy({ left: direction * 384, behavior: 'smooth' })
  }, [])

  const topApps = apps.slice(0, 6)
  const fillCount = Math.max(0, 6 - topApps.length)

  return (
    <>
      {/* Payment success modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-[28px] p-8 max-w-[420px] w-full text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-[#FF6B00]/10 flex items-center justify-center mx-auto mb-5">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="16" fill="#FF6B00" fillOpacity="0.12"/><path d="M10 16.5l4.5 4.5 7.5-9" stroke="#FF6B00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <h2 className="font-display text-[24px] text-[#1e1e1f] tracking-tight mb-2">You&apos;re all set</h2>
            <p className="text-[14px] text-[#1e1e1f]/50 mb-7">
              Your credits have been added to your account. Start exploring apps on the marketplace.
            </p>
            <button
              onClick={() => {
                setShowSuccessModal(false)
                window.history.replaceState(null, '', '/')
              }}
              className="w-full py-3 rounded-full bg-[#FF6B00] hover:bg-[#E55D00] text-white font-medium text-[14px] transition-colors"
            >
              Explore apps
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes grain { 0%,100%{transform:translate(0,0)} 10%{transform:translate(-5%,-10%)} 20%{transform:translate(-15%,5%)} 30%{transform:translate(7%,-25%)} 40%{transform:translate(-5%,25%)} 50%{transform:translate(-15%,10%)} 60%{transform:translate(15%,0%)} 70%{transform:translate(0%,15%)} 80%{transform:translate(3%,35%)} 90%{transform:translate(-10%,10%)} }
        .noise::before { content:''; position:absolute; inset:-50%; width:200%; height:200%; background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); opacity:0.04; pointer-events:none; animation:grain 8s steps(10) infinite; }
        @keyframes menuIn { from { opacity:0; transform:translateY(-8px) scale(0.95); } to { opacity:1; transform:translateY(0) scale(1); } }
        .menu-enter { animation: menuIn 0.2s ease-out forwards; }
      `}</style>

      {/* ── Top bar ── */}
      <div className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between px-8 py-5">
        <a href="/" className="text-[22px] font-display text-[#1e1e1f] tracking-tight">
          Terminal AI
        </a>
        <div className="flex items-center gap-3">
          {isLoggedIn && (
            <a
              href="/pricing"
              className="flex items-center gap-2.5 rounded-full pl-2.5 pr-3.5 py-1.5 bg-white/60 backdrop-blur-sm hover:bg-white/80 transition-all duration-200"
              aria-label={`${(credits ?? 0).toLocaleString()} tokens - view pricing`}
            >
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#FF6B00] text-white" aria-hidden="true">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1l2.1 4.3L15 6l-3.5 3.4.8 4.6L8 11.8 3.7 14l.8-4.6L1 6l4.9-.7L8 1z" fill="currentColor" />
                </svg>
              </span>
              <span className="text-[13px] font-mono font-semibold text-[#1e1e1f] tabular-nums" aria-hidden="true">
                {(credits ?? 0).toLocaleString()}
              </span>
              <span className="text-[11px] text-[#1e1e1f]/35 font-medium hidden sm:inline" aria-hidden="true">tokens</span>
            </a>
          )}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((p) => !p)}
              aria-expanded={menuOpen}
              aria-haspopup="true"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              className="w-10 h-10 rounded-full bg-[#1e1e1f] flex items-center justify-center transition-all duration-200 hover:scale-110 hover:shadow-lg hover:shadow-black/20 active:scale-95"
            >
              {menuOpen
                ? <X className="w-5 h-5 text-white" aria-hidden="true" />
                : <Plus className="w-5 h-5 text-white" aria-hidden="true" />}
            </button>
            {menuOpen && (
              <div
                role="menu"
                aria-label="Navigation menu"
                className="absolute right-0 top-14 w-[180px] bg-white rounded-2xl border border-[#1e1e1f]/[0.06] shadow-2xl py-2 z-50 menu-enter"
              >
                {isLoggedIn ? (
                  <>
                    <a href="/account" role="menuitem" className="block px-4 py-2.5 text-[14px] text-[#1e1e1f] hover:bg-[#1e1e1f]/[0.03] transition-colors">Account</a>
                    <a href="/account/usage" role="menuitem" className="block px-4 py-2.5 text-[14px] text-[#1e1e1f] hover:bg-[#1e1e1f]/[0.03] transition-colors">Usage</a>
                    <div className="border-t border-[#1e1e1f]/[0.06] mt-1 pt-1">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={signOut}
                        className="w-full text-left px-4 py-2.5 text-[14px] text-red-500 hover:bg-red-50/50 transition-colors"
                      >
                        Sign out
                      </button>
                    </div>
                  </>
                ) : (
                  <a href="/login" role="menuitem" className="block px-4 py-2.5 text-[14px] text-[#1e1e1f] hover:bg-[#1e1e1f]/[0.03] transition-colors">Sign in</a>
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
            Discover and run AI-powered apps - instant access, zero setup.
          </p>
          <a
            href={isLoggedIn ? '/c/invest-os' : '/login'}
            className="mt-8 inline-flex items-center gap-2 bg-[#1e1e1f] text-white rounded-full px-7 py-3.5 text-[15px] font-medium hover:bg-[#333] transition-all duration-200 hover:shadow-lg hover:shadow-black/15 active:scale-[0.98]"
          >
            {isLoggedIn ? 'Explore Apps' : 'Get Started'}
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </a>
        </div>
      </section>

      {/* ── App Carousel ── */}
      <section className="bg-[#f5f5f0] pt-8 pb-16">
        <div className="max-w-[1400px] mx-auto px-8 mb-10 flex items-end justify-between">
          <h2 className="font-display text-[clamp(28px,4vw,42px)] text-[#1e1e1f] tracking-[-0.02em]">
            Featured Apps
          </h2>
          <div className="flex gap-2" role="group" aria-label="Carousel controls">
            <button
              onClick={() => scrollCarousel(-1)}
              aria-label="Previous apps"
              className="w-10 h-10 rounded-full bg-[#1e1e1f]/[0.06] hover:bg-[#1e1e1f]/[0.12] flex items-center justify-center transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-[#1e1e1f]" aria-hidden="true" />
            </button>
            <button
              onClick={() => scrollCarousel(1)}
              aria-label="Next apps"
              className="w-10 h-10 rounded-full bg-[#1e1e1f]/[0.06] hover:bg-[#1e1e1f]/[0.12] flex items-center justify-center transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-[#1e1e1f]" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div
          ref={carouselRef}
          className="flex gap-6 px-8 overflow-x-hidden scroll-smooth"
          style={{ scrollbarWidth: 'none' }}
          role="list"
          aria-label="Featured apps"
        >
          {topApps.map((app, i) => {
            const isComingSoon = app.status === 'coming_soon'
            const thumbnail = (
              <div className={`relative h-[280px] rounded-[24px] overflow-hidden mb-4 bg-gradient-to-br ${getGradient(i)} ${!isComingSoon ? 'group-hover:shadow-xl group-hover:shadow-black/10 transition-shadow duration-500' : ''}`}>
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/[0.04] transition-colors duration-300" aria-hidden="true" />
                {isComingSoon ? (
                  <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-[#1e1e1f] rounded-full px-3 py-1.5">
                    <span className="text-[12px] font-medium text-white">Coming soon</span>
                  </div>
                ) : (
                  <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-[#1e1e1f]/80 backdrop-blur-sm rounded-full px-3 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" aria-hidden="true">
                    <span className="text-[12px] font-medium text-white">Open app</span>
                    <ArrowUpRight className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
            )
            const meta = (
              <>
                <h3 className="text-[18px] font-medium text-[#1e1e1f] mb-1 tracking-[-0.01em]">{app.name}</h3>
                <p className="text-[14px] text-[#1e1e1f]/50 leading-relaxed line-clamp-2 mb-3">{app.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-medium text-[#1e1e1f]/70">{app.credits} credits</span>
                  {app.status === 'live' && (
                    <span className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-600" aria-label="Live">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                      Live
                    </span>
                  )}
                </div>
              </>
            )

            return isComingSoon ? (
              <div
                key={app.id}
                role="listitem"
                aria-label={`${app.name} - coming soon`}
                className="flex-shrink-0 w-[clamp(280px,85vw,360px)] opacity-60 group"
              >
                {thumbnail}
                {meta}
              </div>
            ) : (
              <a
                key={app.id}
                href={`/c/${app.channelSlug}/${app.slug}`}
                role="listitem"
                className="flex-shrink-0 w-[clamp(280px,85vw,360px)] group transition-transform duration-300 ease-out hover:-translate-y-1"
              >
                {thumbnail}
                {meta}
              </a>
            )
          })}

          {Array.from({ length: fillCount }, (_, i) => (
            <div
              key={`ph-${i}`}
              role="listitem"
              aria-label={`AI App ${i + 1} - coming soon`}
              className="flex-shrink-0 w-[clamp(280px,85vw,360px)] opacity-60"
            >
              <div className={`relative h-[280px] rounded-[24px] overflow-hidden mb-4 bg-gradient-to-br ${getGradient(topApps.length + i)}`}>
                <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-[#1e1e1f] rounded-full px-3 py-1.5">
                  <span className="text-[12px] font-medium text-white">Coming soon</span>
                </div>
              </div>
              <h3 className="text-[18px] font-medium text-[#1e1e1f] mb-1">AI App {i + 1}</h3>
              <p className="text-[14px] text-[#1e1e1f]/50 leading-relaxed line-clamp-2 mb-3">An intelligent app powered by AI.</p>
              <span className="text-[14px] font-medium text-[#1e1e1f]/70">5 credits</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="bg-[#f5f5f0] py-20 border-t border-[#1e1e1f]/[0.06]">
        <div className="max-w-[960px] mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="font-display text-[clamp(28px,4vw,42px)] text-[#1e1e1f] tracking-[-0.02em] mb-3">Simple pricing</h2>
            <p className="text-[15px] text-[#1e1e1f]/45">Subscribe for monthly credits or buy as you go. No hidden fees.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {/* Monthly */}
            <div className="bg-white rounded-[24px] border border-[#1e1e1f]/[0.06] p-7">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#1e1e1f]/35 mb-3">Monthly</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-[36px] font-display text-[#1e1e1f] tracking-[-0.02em]">&#8377;99</span>
                <span className="text-[13px] text-[#1e1e1f]/35">/first month</span>
              </div>
              <p className="text-[12px] text-[#1e1e1f]/35 mb-6">then &#8377;299/month</p>
              <ul className="space-y-2 mb-7">
                {['300 credits per month', 'First month just ₹99', 'Every app on the marketplace', 'Cancel any time'].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-[13px] text-[#1e1e1f]/55">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1e1e1f]/30 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <a href="/pricing?plan=monthly" className="block w-full py-2.5 rounded-full border border-[#1e1e1f]/15 hover:border-[#1e1e1f]/30 text-[#1e1e1f] text-center text-[13px] font-medium transition-colors">
                Start for ₹99
              </a>
            </div>

            {/* Annual */}
            <div className="relative bg-white rounded-[24px] border-2 border-[#FF6B00] p-7">
              <div className="absolute -top-3 left-6">
                <span className="bg-[#FF6B00] text-white text-[11px] font-semibold px-3 py-1 rounded-full">Recommended</span>
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#FF6B00] mb-3">Annual</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-[36px] font-display text-[#1e1e1f] tracking-[-0.02em]">&#8377;2,490</span>
                <span className="text-[13px] text-[#1e1e1f]/35">/year</span>
              </div>
              <p className="text-[12px] text-[#1e1e1f]/35 mb-6">Over 3 months free vs monthly</p>
              <ul className="space-y-2 mb-7">
                {['300 credits/month, 3,600/year', 'Save ₹1,098 on annual billing', 'Every app on the marketplace', 'Credits stay active all year'].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-[13px] text-[#1e1e1f]/55">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B00] flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <a href="/pricing?plan=annual" className="block w-full py-2.5 rounded-full bg-[#FF6B00] hover:bg-[#E55D00] text-white text-center text-[13px] font-medium transition-colors">
                Get the best deal
              </a>
            </div>

            {/* Pay as you go */}
            <div className="bg-white rounded-[24px] border border-[#1e1e1f]/[0.06] p-7">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#1e1e1f]/35 mb-3">Pay as you go</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-[36px] font-display text-[#1e1e1f] tracking-[-0.02em]">&#8377;1.25</span>
                <span className="text-[13px] text-[#1e1e1f]/35">/credit</span>
              </div>
              <p className="text-[12px] text-[#1e1e1f]/35 mb-6">No subscription needed</p>
              <ul className="space-y-2 mb-7">
                {['Buy only what you need', 'Valid for 12 months', 'Every app on the marketplace', 'Top up any time'].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-[13px] text-[#1e1e1f]/55">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1e1e1f]/30 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <a href="/pricing" className="block w-full py-2.5 rounded-full border border-[#1e1e1f]/15 hover:border-[#1e1e1f]/30 text-[#1e1e1f] text-center text-[13px] font-medium transition-colors">
                Buy credits
              </a>
            </div>
          </div>

          <p className="text-center text-[12px] text-[#1e1e1f]/25 mt-8">All plans include access to every app on the marketplace.</p>
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
