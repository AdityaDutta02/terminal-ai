'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, X } from 'lucide-react'
import { useSignOut } from '@/hooks/use-sign-out'

type Props = {
  isLoggedIn: boolean
  name: string | null
  email: string | null
  credits: number | null
  role: string | null
}

export function NavbarUser(props: Props) {
  const { isLoggedIn, name, credits: initialCredits, role } = props
  const [menuOpen, setMenuOpen] = useState(false)
  const [liveCredits, setLiveCredits] = useState(initialCredits)
  const menuRef = useRef<HTMLDivElement>(null)
  const signOut = useSignOut()

  const handleMenuKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!menuOpen) return
    if (e.key === 'Escape') {
      setMenuOpen(false)
      menuRef.current?.querySelector<HTMLElement>('button')?.focus()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
      )
      if (items.length === 0) return
      const idx = items.indexOf(document.activeElement as HTMLElement)
      const next = e.key === 'ArrowDown'
        ? items[(idx + 1) % items.length]
        : items[(idx - 1 + items.length) % items.length]
      next.focus()
    }
  }, [menuOpen])

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

  const creditCount = liveCredits ?? 0

  return (
    <div className="flex items-center gap-3">
      {/* Tokens pill — only when logged in */}
      {isLoggedIn && (
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
      )}

      {/* Plus button + dropdown — same pattern as landing page */}
      <div className="relative" ref={menuRef} onKeyDown={handleMenuKeyDown}>
        <button
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-haspopup="true"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          className="w-9 h-9 rounded-full bg-[#1e1e1f] flex items-center justify-center transition-all duration-200 hover:scale-110 hover:shadow-lg hover:shadow-black/20 active:scale-95"
        >
          {menuOpen
            ? <X className="w-4 h-4 text-white" />
            : <Plus className="w-4 h-4 text-white" />}
        </button>
        {menuOpen && (
          <div role="menu" aria-label="Navigation menu" className="absolute right-0 top-12 w-[180px] bg-white rounded-2xl border border-[#1e1e1f]/[0.06] shadow-2xl py-2 z-50 animate-[menuIn_0.15s_ease-out]">
            {isLoggedIn ? (
              <>
                <MenuLink href="/account">Account</MenuLink>
                <MenuLink href="/account/usage">Usage</MenuLink>
                {role === 'admin' && (
                  <MenuLink href="/creator">Creator Studio</MenuLink>
                )}
                {role === 'admin' && (
                  <MenuLink href="/admin">Admin Panel</MenuLink>
                )}
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
              <MenuLink href="/login">Sign in</MenuLink>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function MenuLink(linkProps: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={linkProps.href}
      role="menuitem"
      className="block px-4 py-2.5 text-[14px] text-[#1e1e1f] hover:bg-[#1e1e1f]/[0.03] transition-colors"
    >
      {linkProps.children}
    </a>
  )
}
