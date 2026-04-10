'use client'

import { useState, useEffect } from 'react'
import { Sparkles, Layers, Zap } from 'lucide-react'

const VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4'

export default function WaitlistPage() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [waitlistCount, setWaitlistCount] = useState(237)

  useEffect(() => {
    fetch('/api/waitlist/count')
      .then((r) => r.json())
      .then((data: { count?: number }) => {
        if (typeof data.count === 'number') setWaitlistCount(data.count)
      })
      .catch(() => {/* keep default */})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    try {
      const res = await fetch('/api/waitlist/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: name || undefined }),
      })
      if (res.ok) {
        setSubmitted(true)
        setWaitlistCount((c) => c + 1)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main>
      {/* ── HERO ── */}
      <section className="relative min-h-screen flex flex-col overflow-hidden">
        {/* Video background */}
        <video
          src={VIDEO_URL}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover z-0"
        />

        {/* Nav */}
        <nav className="relative z-10 w-full">
          <div className="max-w-7xl mx-auto px-8 py-6 flex justify-between items-center">
            <span
              className="text-3xl text-white tracking-tight"
              style={{ fontFamily: "'Instrument Serif', serif" }}
            >
              Terminal AI
            </span>
            <div className="flex items-center gap-8">
              <div className="md:flex hidden items-center gap-6">
                {['Apps', 'Creators', 'About'].map((link) => (
                  <a
                    key={link}
                    href="#"
                    className="text-sm text-white/60 hover:text-white transition-colors"
                  >
                    {link}
                  </a>
                ))}
              </div>
              <a
                href="/login"
                className="liquid-glass rounded-full px-6 py-2.5 text-sm text-white hover:scale-[1.03] transition-transform"
              >
                Sign in →
              </a>
            </div>
          </div>
        </nav>

        {/* Hero body */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 pt-8 pb-40">
          <p className="text-[#FF6B00] text-sm tracking-widest uppercase mb-6 animate-fade-rise">
            PRIVATE BETA
          </p>
          <h1
            className="text-5xl sm:text-7xl md:text-8xl text-white leading-[0.95] tracking-[-2.46px] mb-8 animate-fade-rise"
            style={{ fontFamily: "'Instrument Serif', serif" }}
          >
            AI-powered apps,
            <br />
            built for{' '}
            <em className="not-italic text-white/50">everyone.</em>
          </h1>
          <p className="text-white/60 text-base sm:text-lg max-w-2xl leading-relaxed animate-fade-rise-delay">
            Creator-built AI apps that actually work. Join the waitlist and be first in.
          </p>

          {/* Email capture */}
          <div className="animate-fade-rise-delay-2 mt-12">
            {submitted ? (
              <div className="text-white text-lg font-medium">
                You&apos;re on the list. We&apos;ll be in touch.
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="flex gap-3 justify-center flex-wrap"
              >
                <input
                  type="text"
                  placeholder="Your name (optional)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="liquid-glass rounded-full px-6 py-3.5 text-white placeholder-white/40 text-sm w-56 outline-none"
                />
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="liquid-glass rounded-full px-6 py-3.5 text-white placeholder-white/40 text-sm w-72 outline-none"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-[#FF6B00] text-white rounded-full px-8 py-3.5 font-semibold text-sm hover:scale-[1.03] hover:bg-orange-500 transition-all disabled:opacity-60"
                >
                  {loading ? 'Joining…' : 'Join the waitlist'}
                </button>
              </form>
            )}
            <p className="text-white/40 text-sm mt-4">
              {waitlistCount.toLocaleString()} people already waiting
            </p>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="bg-white">
        <div className="max-w-5xl mx-auto px-6 py-24">
          <h2
            className="text-4xl text-[#0F172A] text-center mb-16"
            style={{ fontFamily: "'Instrument Serif', serif" }}
          >
            Claude-level AI.
            <br />
            Without the Claude price.
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              {
                icon: Sparkles,
                title: 'Built by Creators',
                body: 'Apps made for real workflows, not demos.',
              },
              {
                icon: Layers,
                title: 'For Every Use Case',
                body: "Finance, productivity, dev tools, and more. If you need it, it's here.",
              },
              {
                icon: Zap,
                title: 'Just Works',
                body: 'Open. Ask. Done. No setup. No prompt engineering needed.',
              },
            ].map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="bg-white border border-[#F1F5F9] rounded-2xl p-6 shadow-sm"
              >
                <div className="bg-orange-50 text-[#FF6B00] rounded-xl p-3 w-fit mb-4">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-[#0F172A] mb-2">{title}</h3>
                <p className="text-sm text-[#64748B] leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="bg-[#0F172A]">
        <div className="max-w-5xl mx-auto px-6 py-24 text-center">
          <h2
            className="text-4xl text-white"
            style={{ fontFamily: "'Instrument Serif', serif" }}
          >
            Simple pricing.
          </h2>
          <p className="text-lg text-white/60 mt-3">Start with ₹99 per month.</p>

          <div className="max-w-sm mx-auto mt-12">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-left">
              <p className="text-[#FF6B00] text-xs font-semibold tracking-widest uppercase mb-4">
                STARTER
              </p>
              <div className="flex items-baseline gap-1 mb-6">
                <span
                  className="text-5xl text-white"
                  style={{ fontFamily: "'Instrument Serif', serif" }}
                >
                  ₹99
                </span>
                <span className="text-white/50 text-lg">/month</span>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  '350 AI credits/month',
                  'Access to all creator apps',
                  'Email support',
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-white/70">
                    <span className="text-[#FF6B00]">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                onClick={() =>
                  document.querySelector<HTMLInputElement>('input[type="email"]')?.focus()
                }
                className="w-full bg-[#FF6B00] text-white rounded-xl py-3 font-semibold hover:bg-orange-500 transition-colors"
              >
                Join the waitlist
              </button>
            </div>
          </div>

          <p className="text-white/30 text-sm mt-16 pb-12">Terminal AI by Studio Ionique</p>
        </div>
      </section>
    </main>
  )
}
