'use client'

import { useState, useEffect } from 'react'
import { Sparkles, ChevronDown } from 'lucide-react'
import { useSignOut } from '@/hooks/use-sign-out'

type Props = {
  isLoggedIn: boolean
  name: string | null
  email: string | null
  credits: number | null
  role: string | null
}

export function NavbarUser({ isLoggedIn, name, email, credits: initialCredits, role }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [liveCredits, setLiveCredits] = useState(initialCredits)
  const signOut = useSignOut()

  // Live credit refresh — poll every 15 seconds when logged in
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

  // Update from initial on mount
  useEffect(() => { setLiveCredits(initialCredits) }, [initialCredits])

  const initials = name
    ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '??'

  return (
    <div className="flex items-center gap-3">
      {isLoggedIn ? (
        <>
          {/* Credits pill */}
          <a
            href="/account"
            className="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-full px-3.5 py-1.5 cursor-pointer hover:bg-orange-100 transition-colors duration-150"
          >
            <Sparkles className="w-3.5 h-3.5 text-orange-600" />
            <span className="text-[13px] font-semibold text-orange-700 font-mono">
              {(liveCredits ?? 0).toLocaleString()}
            </span>
          </a>

          {/* Avatar dropdown */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 hover:bg-slate-50 rounded-lg px-2 py-1.5 transition-colors duration-150"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-slate-700 to-slate-800 rounded-full flex items-center justify-center text-white text-[12px] font-semibold">
                {initials}
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-12 w-[200px] bg-white rounded-xl border border-slate-100 shadow-xl shadow-slate-200/50 py-1.5 z-50">
                <div className="px-3.5 py-2.5 border-b border-slate-100">
                  <p className="text-[13px] font-medium text-slate-900">{name}</p>
                  <p className="text-[12px] text-slate-400">{email}</p>
                </div>
                <div className="py-1">
                  <DropdownLink href="/account">Account</DropdownLink>
                  {role === 'admin' && (
                    <DropdownLink href="/creator">Creator Studio</DropdownLink>
                  )}
                  <DropdownLink href="/pricing">Pricing</DropdownLink>
                  {role === 'admin' && (
                    <DropdownLink href="/admin">Admin Panel</DropdownLink>
                  )}
                </div>
                <div className="border-t border-slate-100 pt-1">
                  <button
                    type="button"
                    onClick={signOut}
                    className="w-full text-left px-3.5 py-2 text-[13px] text-red-500 hover:bg-red-50 transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <a
            href="/login"
            className="px-4 py-2 text-[14px] font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            Sign in
          </a>
          <a
            href="/signup"
            className="bg-[#FF6B00] hover:bg-[#E55D00] text-[#0A0A0A] rounded-xl px-5 py-2 text-[14px] font-semibold transition-colors"
          >
            Get started
          </a>
        </div>
      )}
    </div>
  )
}

function DropdownLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="block w-full text-left px-3.5 py-2 text-[13px] text-slate-600 hover:bg-slate-50 transition-colors"
    >
      {children}
    </a>
  )
}
