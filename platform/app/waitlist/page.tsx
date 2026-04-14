'use client'

import { useState, useEffect, useRef } from 'react'
import { Mail } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

const BASE_OFFSET = 2346
const STORAGE_KEY = 'tai_wl_floor'

const DUPLICATE_MESSAGES = [
  "Someone's eager...",
  "You're already in! We haven't forgotten you.",
  "Twice the enthusiasm, same spot in line.",
  "Already saved! Your future self thanks you.",
  "Bold move submitting twice. You're on the list.",
]

export default function WaitlistPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [displayCount, setDisplayCount] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { toast } = useToast()

  // Read stored floor from localStorage so count never goes backward across sessions
  function getStoredFloor(): number {
    try {
      return parseInt(localStorage.getItem(STORAGE_KEY) ?? '0', 10) || 0
    } catch {
      return 0
    }
  }

  function persistFloor(n: number) {
    try {
      const stored = getStoredFloor()
      if (n > stored) localStorage.setItem(STORAGE_KEY, String(n))
    } catch { /* localStorage unavailable */ }
  }

  useEffect(() => {
    fetch('/api/waitlist/count')
      .then((r) => r.json())
      .then((data: { count?: number }) => {
        const real = typeof data.count === 'number' ? data.count : 0
        const apiCount = BASE_OFFSET + real
        const floor = Math.max(apiCount, getStoredFloor())
        setDisplayCount(floor)
        persistFloor(floor)
      })
      .catch(() => {
        const floor = Math.max(BASE_OFFSET, getStoredFloor())
        setDisplayCount(floor)
      })
  }, [])

  // Auto-increment: jittered interval so it doesn't feel like a timer
  useEffect(() => {
    if (displayCount === null) return

    function scheduleNext() {
      const jitter = 3500 + Math.random() * 1500 // 3.5-5s
      timerRef.current = setTimeout(() => {
        setDisplayCount((c) => {
          const next = (c ?? BASE_OFFSET) + Math.floor(Math.random() * 8) + 1
          persistFloor(next)
          return next
        })
        scheduleNext()
      }, jitter)
    }

    timerRef.current = setTimeout(scheduleNext, 6000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [displayCount === null]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    try {
      const res = await fetch('/api/waitlist/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.ok) {
        const data = (await res.json()) as { joined: boolean; alreadyJoined: boolean }
        if (data.alreadyJoined) {
          const msg = DUPLICATE_MESSAGES[Math.floor(Math.random() * DUPLICATE_MESSAGES.length)]
          toast({ description: msg })
        } else {
          setSubmitted(true)
          setDisplayCount((c) => {
            const next = (c ?? BASE_OFFSET) + 1
            persistFloor(next)
            return next
          })
        }
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative w-full h-dvh overflow-hidden">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&q=85')`,
        }}
      />
      {/* Bottom gradient for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0c1a2e]/80 via-[#0c1a2e]/20 to-transparent" />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Brand */}
        <div className="px-6 sm:px-10 py-6">
          <span
            className="text-white text-2xl tracking-tight"
            style={{ fontFamily: 'var(--font-display), serif' }}
          >
            Terminal AI
          </span>
        </div>

        <div className="flex-1" />

        {/* Hero Section */}
        <div className="px-6 sm:px-10 pb-8 sm:pb-12">
          <h1 className="text-white text-[clamp(2.2rem,5.5vw,3.8rem)] font-bold leading-[1.08] tracking-tight max-w-[680px] mb-5">
            AI-powered apps,
            <br />
            built for everyone.
          </h1>

          <p className="text-white/75 text-sm sm:text-[15px] leading-relaxed max-w-[520px] mb-7">
            Creator-built AI apps that actually work. Get Claude-level AI without the
            Claude price - join the waitlist and be first in.
          </p>

          {submitted ? (
            <p className="text-white text-base font-medium mb-7">
              You&apos;re on the list. We&apos;ll be in touch.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex items-center max-w-[480px] mb-3">
              <div className="flex items-center flex-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-4 py-2.5 gap-3">
                <Mail className="text-white/50 shrink-0" size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email address..."
                  required
                  className="bg-transparent text-white placeholder-white/40 text-sm outline-none flex-1 min-w-0"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-white text-[#0c1a2e] text-sm font-semibold px-5 py-2 rounded-full whitespace-nowrap shrink-0 hover:bg-white/90 transition-colors duration-150 disabled:opacity-60"
                >
                  {loading ? 'Joining...' : 'Join Terminal AI'}
                </button>
              </div>
            </form>
          )}

          <p className="text-white/50 text-xs mb-6">
            {displayCount !== null ? (
              <>
                <span
                  key={displayCount}
                  className="animate-count-bump font-bold text-white"
                >
                  {displayCount.toLocaleString()}
                </span>
                {' '}people already waiting
              </>
            ) : '\u00A0'}
          </p>

          {/* Powered By */}
          <div className="flex items-end justify-between">
            <div />
            <div className="flex flex-col items-end gap-1.5">
              <span className="text-white/40 text-[11px] tracking-wider uppercase">
                Powered By
              </span>
              <span
                className="text-white text-lg tracking-tight"
                style={{ fontFamily: 'var(--font-display), serif' }}
              >
                Claude
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
