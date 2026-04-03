'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { useSignOut } from '@/hooks/use-sign-out'

type Props = {
  isLoggedIn: boolean
  name: string | null
  email: string | null
  credits: number | null
  role: string | null
}

export function NavbarUser(props: Props) {
  const { isLoggedIn, name, email, credits: initialCredits, role } = props
  const [menuOpen, setMenuOpen] = useState(false)
  const [liveCredits, setLiveCredits] = useState(initialCredits)
  const menuRef = useRef<HTMLDivElement>(null)
  const signOut = useSignOut()

  // Live credit refresh — poll every 15s
  useEffect(() => {
    if (!isLoggedIn) return
    let active = true
    const poll = async () => {
      try {
        const res = await fetch('/api/credits/balance')
        if (res.ok) {
          const { balance } = await res.json() as { balance: number }
          if (active) setLiveCredits(balance)
        }
      } catch { /* ignore */ }
    }
    const interval = setInterval(poll, 15_000)
    return () => { active = false; clearInterval(interval) }
  }, [isLoggedIn])

  useEffect(() => { setLiveCredits(initialCredits) }, [initialCredits])

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const initials = name
    ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '??'

  const creditCount = liveCredits ?? 0

  return (
    <div className="flex items-center gap-3">
      {isLoggedIn ? (
        <>
          {/* Tokens remaining pill */}
          <a
            href="/pricing"
            className="group flex items-center gap-2.5 rounded-full pl-2.5 pr-3.5 py-1.5 bg-[#1e1e1f]/[0.04] hover:bg-[#1e1e1f]/[0.08] transition-all duration-200 cursor-pointer"
          >
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#FF6B00] text-white">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                <path d="M8 1l2.1 4.3L15 6l-3.5 3.4.8 4.6L8 11.8 3.7 14l.8-4.6L1 6l4.9-.7L8 1z" fill="currentColor" />
              </svg>
            </span>
            <span className="text-[13px] font-mono font-semibold text-[#1e1e1f] tabular-nums">
              {creditCount.toLocaleString()}
            </span>
            <span className="text-[11px] text-[#1e1e1f]/35 font-medium hidden sm:inline">
              tokens
            </span>
          </a>

          {/* Avatar + dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((prev) => !prev)}
              className="flex items-center gap-1.5 rounded-full pl-1 pr-2 py-1 hover:bg-[#1e1e1f]/[0.05] transition-all duration-200"
            >
              <div className="w-7 h-7 bg-[#1e1e1f] rounded-full flex items-center justify-center text-white text-[11px] font-semibold">
                {initials}
              </div>
              <ChevronDown className={`w-3 h-3 text-[#1e1e1f]/35 transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-11 w-[210px] bg-white rounded-2xl border border-[#1e1e1f]/[0.06] shadow-2xl shadow-black/8 py-2 z-50 animate-[menuIn_0.15s_ease-out]">
                <div className="px-4 py-2.5 border-b border-[#1e1e1f]/[0.06]">
                  <p className="text-[13px] font-medium text-[#1e1e1f]">{name}</p>
                  <p className="text-[11px] text-[#1e1e1f]/35">{email}</p>
                </div>
                <div className="py-1">
                  <DropdownLink href="/account">Account</DropdownLink>
                  <DropdownLink href="/account/usage">Usage</DropdownLink>
                  {role === 'admin' && (
                    <DropdownLink href="/creator">Creator Studio</DropdownLink>
                  )}
                  <DropdownLink href="/pricing">Pricing</DropdownLink>
                  {role === 'admin' && (
                    <DropdownLink href="/admin">Admin Panel</DropdownLink>
                  )}
                </div>
                <div className="border-t border-[#1e1e1f]/[0.06] pt-1">
                  <button
                    type="button"
                    onClick={signOut}
                    className="w-full text-left px-4 py-2 text-[13px] text-red-500 hover:bg-red-50/50 transition-colors rounded-lg mx-0"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2.5">
          <a
            href="/login"
            className="px-4 py-2 text-[14px] font-medium text-[#1e1e1f]/50 hover:text-[#1e1e1f] transition-colors"
          >
            Sign in
          </a>
          <a
            href="/signup"
            className="bg-[#1e1e1f] hover:bg-[#333] text-white rounded-full px-5 py-2 text-[14px] font-medium hover:shadow-lg hover:shadow-black/15 active:scale-[0.98] transition-all duration-200"
          >
            Get started
          </a>
        </div>
      )}
    </div>
  )
}

function DropdownLink(linkProps: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={linkProps.href}
      className="block w-full text-left px-4 py-2 text-[13px] text-[#1e1e1f]/60 hover:text-[#1e1e1f] hover:bg-[#1e1e1f]/[0.03] transition-colors"
    >
      {linkProps.children}
    </a>
  )
}
