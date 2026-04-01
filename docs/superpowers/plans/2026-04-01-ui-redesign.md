# Terminal AI — Full UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign every page of the Terminal AI platform to match the Figr v11 prototype — premium light theme with Neon Orange (`#FF6B00`) accent, elevated card surfaces, sidebar navigation, and a dark hero/auth aesthetic.

**Architecture:** The redesign is purely visual — all data fetching logic, API routes, auth guards, and database queries remain unchanged. Each page gets rewritten with new Tailwind classes matching the Figr v11 design. Shared components (Navbar, AppCard, ChannelCard, Sidebars, Footer) are extracted first, then pages are rebuilt using them. The existing shadcn/ui primitives (Button, Input, Dialog, etc.) are kept but restyled via globals.css.

**Tech Stack:** Next.js App Router, Tailwind CSS, lucide-react icons, shadcn/ui primitives, existing `@/lib/db` + `@/lib/auth` unchanged.

**Design Reference:** Figr project `267b8124-c63e-40e8-a7c7-44dc19c61b9f`, artifact `Terminal AI::v11.jsx` (1530 lines). Local copy at `/tmp/terminal-ai-v11.jsx`.

---

## Design System Summary

These values are extracted from the Figr v11 design and must be applied consistently:

| Token | Value | Usage |
|-------|-------|-------|
| Primary accent | `#FF6B00` | CTAs, active states, badges, pills |
| Hover accent | `#E55D00` | Button hover states |
| Background | `#FAFAFA` | Page canvas |
| Card surface | `#FFFFFF` | Cards, tables, panels |
| Dark surface | `#0A0A0A` | Hero, auth pages, viewer, CTA banners |
| Text primary | `slate-900` | Headings, labels |
| Text secondary | `slate-400`/`slate-500` | Descriptions, metadata |
| Border | `slate-100` | Card borders, dividers |
| Card shadow | `shadow-sm` | Default card shadow |
| Hover shadow | `shadow-lg shadow-orange-100/50` | Card hover glow |
| Border radius | `rounded-2xl` (16px) cards, `rounded-xl` (12px) inner, `rounded-lg` (8px) buttons |
| Input height | `h-[44px]` | All form inputs |
| Focus ring | `focus:border-orange-300 focus:ring-2 focus:ring-orange-100` | Input focus state |
| Max width | `max-w-[1200px]` | Content container |
| Navbar height | `h-[60px]` | Sticky navbar |
| Sidebar width | `w-[220px]` | Account/Creator/Admin sidebars |
| Font mono | `font-mono` | Credits, numbers, code |
| Active sidebar | `bg-orange-50 text-orange-700 border-l-2 border-orange-600` | Active nav item |

---

## File Structure

### New Files to Create
```
platform/components/app-card.tsx           — Reusable app card (gradient icon, rating, credits)
platform/components/channel-card.tsx       — Reusable channel card (avatar, stats, arrow)
platform/components/sidebar-nav.tsx        — Reusable sidebar navigation component
platform/components/footer.tsx             — Shared footer
platform/components/hero-keyframes.tsx     — CSS keyframes for hero floating animation
platform/app/(marketplace)/account/account-sidebar.tsx  — Account sidebar wrapper (already exists pattern)
platform/app/(marketplace)/account/usage/page.tsx       — New usage history page
platform/app/admin/users/[userId]/page.tsx              — New admin user detail page
```

### Files to Rewrite (full visual overhaul, keep data logic)
```
platform/app/globals.css                                    — New color system (orange accent)
platform/components/navbar.tsx                              — Complete redesign (search bar, credits pill, dropdown)
platform/components/navbar-user.tsx                         — Client dropdown with navigation
platform/app/(marketplace)/layout.tsx                       — Update bg color + container
platform/app/(marketplace)/page.tsx                         — Full homepage redesign
platform/app/(marketplace)/c/[channelSlug]/page.tsx         — Channel page redesign
platform/app/(marketplace)/c/[channelSlug]/[appSlug]/page.tsx — App detail redesign
platform/app/(marketplace)/pricing/page.tsx (or pricing-client.tsx) — Pricing page redesign
platform/app/(marketplace)/account/page.tsx                 — Credits tab redesign
platform/app/(marketplace)/account/account-password-form.tsx — Security section redesign
platform/app/(marketplace)/developers/page.tsx              — Developer API redesign
platform/app/(auth)/login/page.tsx                          — Dark bg + OAuth buttons
platform/app/(auth)/signup/page.tsx                         — Dark bg + OAuth buttons
platform/app/creator/layout.tsx                             — Sidebar layout
platform/app/creator/page.tsx                               — Dashboard redesign
platform/app/creator/channels/new/page.tsx                  — Create channel redesign
platform/app/admin/layout.tsx                               — Light theme + sidebar
platform/app/admin/page.tsx                                 — Overview redesign
platform/app/admin/users/page.tsx                           — Users table redesign
platform/app/admin/apps/page.tsx                            — Apps table redesign
platform/app/viewer/[channelSlug]/[appSlug]/viewer-shell.tsx — Viewer bar redesign
```

---

## Phase 0: Design System + Shared Components

### Task 1: Update CSS Design System

**Files:**
- Modify: `platform/app/globals.css`

- [ ] **Step 1: Replace globals.css with new orange-accent color system**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: #FAFAFA;
    --foreground: #0F172A;
    --card: #FFFFFF;
    --card-foreground: #0F172A;
    --popover: #FFFFFF;
    --popover-foreground: #0F172A;
    --primary: #FF6B00;
    --primary-foreground: #0A0A0A;
    --secondary: #F1F5F9;
    --secondary-foreground: #0F172A;
    --muted: #F1F5F9;
    --muted-foreground: #64748B;
    --accent: #FF6B00;
    --accent-foreground: #0A0A0A;
    --destructive: #EF4444;
    --destructive-foreground: #FFFFFF;
    --border: #F1F5F9;
    --input: #E2E8F0;
    --ring: #FF6B00;
    --radius: 0.75rem;
    --radius-sm: 0.5rem;
    --radius-md: 0.75rem;
    --radius-lg: 1rem;
  }

  .dark {
    --background: #0A0A0A;
    --foreground: #F8FAFC;
    --card: #1A1A1A;
    --card-foreground: #F8FAFC;
    --popover: #1A1A1A;
    --popover-foreground: #F8FAFC;
    --primary: #FF6B00;
    --primary-foreground: #0A0A0A;
    --secondary: #1E293B;
    --secondary-foreground: #F8FAFC;
    --muted: #1E293B;
    --muted-foreground: #94A3B8;
    --accent: #FF6B00;
    --accent-foreground: #0A0A0A;
    --destructive: #EF4444;
    --destructive-foreground: #FFFFFF;
    --border: #1E293B;
    --input: #1E293B;
    --ring: #FF6B00;
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground antialiased;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add platform/app/globals.css
git commit -m "style(platform): update design system to orange accent theme"
```

---

### Task 2: Create Shared AppCard Component

**Files:**
- Create: `platform/components/app-card.tsx`

- [ ] **Step 1: Create the AppCard component**

This is a client component (needs hover state). Matches the v11 design: gradient icon area, category badge, name, channel, description (2-line clamp), rating stars, credit cost.

```tsx
'use client'

import { useState } from 'react'
import { Star, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type AppCardData = {
  id: string
  name: string
  slug: string
  channelName: string
  channelSlug: string
  description: string
  credits: number
  rating: number
  reviewCount: number
  category: string
  gradient: string
  icon: LucideIcon
}

export function AppCard({ app, href }: { app: AppCardData; href: string }) {
  const [hovered, setHovered] = useState(false)
  const Icon = app.icon

  return (
    <a
      href={href}
      className={`bg-white rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col ${
        hovered
          ? 'border-orange-200 shadow-lg shadow-orange-100/50 -translate-y-0.5'
          : 'border-slate-100 shadow-sm'
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={`m-3 mb-0 rounded-xl bg-gradient-to-br ${app.gradient} p-6 flex items-center justify-center`}>
        <Icon className="w-8 h-8 text-white" />
      </div>
      <div className="p-4 pt-3 flex flex-col flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
            {app.category}
          </span>
        </div>
        <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight">{app.name}</h3>
        <p className="text-[13px] text-slate-500 mb-1">{app.channelName}</p>
        <p className="text-[13px] text-slate-500 leading-relaxed mb-3 line-clamp-2 flex-1">
          {app.description}
        </p>
        <div className="flex items-center justify-between pt-3 border-t border-slate-50">
          <div className="flex items-center gap-1">
            <Star className="w-3.5 h-3.5 text-orange-400 fill-orange-400" />
            <span className="text-[13px] font-medium text-slate-700">{app.rating}</span>
            <span className="text-[12px] text-slate-400">({app.reviewCount})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-[13px] font-semibold text-slate-700 font-mono">{app.credits}</span>
            <span className="text-[12px] text-slate-400">/session</span>
          </div>
        </div>
      </div>
    </a>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add platform/components/app-card.tsx
git commit -m "feat(platform): add AppCard component matching v11 design"
```

---

### Task 3: Create Shared ChannelCard Component

**Files:**
- Create: `platform/components/channel-card.tsx`

- [ ] **Step 1: Create the ChannelCard component**

```tsx
'use client'

import { useState } from 'react'
import { Box, Users, ArrowRight } from 'lucide-react'

export type ChannelCardData = {
  id: string
  slug: string
  name: string
  handle: string
  description: string
  appCount: number
  sessionCount: number
  avatarColor: string
  letter: string
}

export function ChannelCard({ channel, href }: { channel: ChannelCardData; href: string }) {
  const [hovered, setHovered] = useState(false)

  return (
    <a
      href={href}
      className={`bg-white rounded-2xl border p-5 transition-all duration-200 cursor-pointer block ${
        hovered
          ? 'border-orange-200 shadow-lg shadow-orange-100/50 -translate-y-0.5'
          : 'border-slate-100 shadow-sm'
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start gap-4">
        <div
          className={`w-11 h-11 ${channel.avatarColor} rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0`}
        >
          {channel.letter}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight mb-0.5">
            {channel.name}
          </h3>
          <p className="text-[13px] text-slate-400 mb-2">{channel.handle}</p>
          <p className="text-[13px] text-slate-500 leading-relaxed line-clamp-2 mb-3">
            {channel.description}
          </p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Box className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[13px] text-slate-500">{channel.appCount} apps</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[13px] text-slate-500">
                {channel.sessionCount.toLocaleString()} sessions
              </span>
            </div>
          </div>
        </div>
        <ArrowRight
          className={`w-4 h-4 mt-1 flex-shrink-0 transition-all duration-200 ${
            hovered ? 'text-orange-500 translate-x-0.5' : 'text-slate-300'
          }`}
        />
      </div>
    </a>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add platform/components/channel-card.tsx
git commit -m "feat(platform): add ChannelCard component matching v11 design"
```

---

### Task 4: Create Shared SidebarNav Component

**Files:**
- Create: `platform/components/sidebar-nav.tsx`

- [ ] **Step 1: Create the reusable SidebarNav**

Used by Account, Creator Studio, and Admin pages. Takes a title and list of tabs.

```tsx
'use client'

import type { LucideIcon } from 'lucide-react'
import { usePathname } from 'next/navigation'

type SidebarTab = {
  id: string
  label: string
  icon: LucideIcon
  href: string
}

export function SidebarNav({ title, tabs }: { title: string; tabs: SidebarTab[] }) {
  const pathname = usePathname()

  return (
    <div className="w-[220px] flex-shrink-0">
      <h2 className="text-[13px] font-semibold text-slate-400 uppercase tracking-wider mb-3 px-3">
        {title}
      </h2>
      <div className="space-y-0.5">
        {tabs.map((t) => {
          const TabIcon = t.icon
          const isActive = pathname === t.href
          return (
            <a
              key={t.id}
              href={t.href}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-orange-50 text-orange-700 border-l-2 border-orange-600'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <TabIcon
                className={`w-4 h-4 ${isActive ? 'text-orange-600' : 'text-slate-400'}`}
              />
              {t.label}
            </a>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add platform/components/sidebar-nav.tsx
git commit -m "feat(platform): add SidebarNav component for Account/Creator/Admin"
```

---

### Task 5: Create Footer Component

**Files:**
- Create: `platform/components/footer.tsx`

- [ ] **Step 1: Create the Footer**

```tsx
import { Zap } from 'lucide-react'

export function Footer() {
  return (
    <footer className="border-t border-slate-200 py-8 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-[#0A0A0A] rounded-md flex items-center justify-center">
          <Zap className="w-3 h-3 text-white" />
        </div>
        <span className="text-[13px] font-semibold text-slate-400">Terminal AI</span>
      </div>
      <div className="flex items-center gap-6">
        <a href="/pricing" className="text-[13px] text-slate-400 hover:text-slate-600 transition-colors">
          Pricing
        </a>
        <a href="/developers" className="text-[13px] text-slate-400 hover:text-slate-600 transition-colors">
          Developers
        </a>
        <a href="/terms" className="text-[13px] text-slate-400 hover:text-slate-600 transition-colors">
          Terms
        </a>
        <a href="/privacy" className="text-[13px] text-slate-400 hover:text-slate-600 transition-colors">
          Privacy
        </a>
      </div>
    </footer>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add platform/components/footer.tsx
git commit -m "feat(platform): add Footer component matching v11 design"
```

---

### Task 6: Redesign Navbar

**Files:**
- Modify: `platform/components/navbar.tsx`
- Modify: `platform/components/navbar-user.tsx`

- [ ] **Step 1: Rewrite navbar.tsx**

The Navbar is a server component that reads session + credits, then renders the client NavbarUser. New design: logo left, search center (with Cmd+K hint), credits pill + avatar dropdown right. Max width 1200px, 60px height, white/80 backdrop blur.

```tsx
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NavbarUser } from '@/components/navbar-user'
import { Zap } from 'lucide-react'

async function getCreditBalance(userId: string): Promise<number> {
  const result = await db.query<{ credits: number }>(
    `SELECT COALESCE(
       (SELECT balance_after FROM subscriptions.credit_ledger
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1),
       (SELECT credits FROM "user" WHERE id = $1),
       0
     ) AS credits`,
    [userId],
  ).catch(() => null)
  return result?.rows[0]?.credits ?? 0
}

export async function Navbar() {
  const session = await auth.api.getSession({ headers: await headers() })
  const credits = session ? await getCreditBalance(session.user.id) : null
  const role = session
    ? (((session.user as Record<string, unknown>).role as string | undefined) ?? 'user')
    : null

  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100">
      <div className="max-w-[1200px] mx-auto px-6 h-[60px] flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#0A0A0A] rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="text-[16px] font-bold text-slate-900 tracking-tight">Terminal AI</span>
        </a>

        {/* Right side */}
        <NavbarUser
          isLoggedIn={!!session}
          name={session?.user.name ?? null}
          email={session?.user.email ?? null}
          credits={credits}
          role={role}
        />
      </div>
    </nav>
  )
}
```

- [ ] **Step 2: Rewrite navbar-user.tsx**

Client component with search bar, credits pill, and avatar dropdown matching v11.

```tsx
'use client'

import { useState } from 'react'
import { Search, Sparkles, ChevronDown, Command } from 'lucide-react'
import { SignOutButton } from '@/components/sign-out-button'

type Props = {
  isLoggedIn: boolean
  name: string | null
  email: string | null
  credits: number | null
  role: string | null
}

export function NavbarUser({ isLoggedIn, name, email, credits, role }: Props) {
  const [searchFocused, setSearchFocused] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const initials = name
    ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '??'

  return (
    <div className="flex items-center gap-3">
      {/* Search bar */}
      <div
        className={`flex items-center gap-2 bg-slate-50 rounded-xl px-3.5 py-2 w-[340px] border transition-all duration-200 ${
          searchFocused
            ? 'border-orange-300 bg-white shadow-sm shadow-orange-100/50 ring-2 ring-orange-100'
            : 'border-transparent'
        }`}
      >
        <Search className="w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search apps and channels..."
          className="bg-transparent text-[14px] text-slate-700 placeholder-slate-400 outline-none flex-1"
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
        />
        <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-md px-1.5 py-0.5">
          <Command className="w-3 h-3 text-slate-400" />
          <span className="text-[11px] text-slate-400 font-medium">K</span>
        </div>
      </div>

      {isLoggedIn ? (
        <>
          {/* Credits pill */}
          <a
            href="/account"
            className="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-full px-3.5 py-1.5 cursor-pointer hover:bg-orange-100 transition-colors duration-150"
          >
            <Sparkles className="w-3.5 h-3.5 text-orange-600" />
            <span className="text-[13px] font-semibold text-orange-700 font-mono">
              {(credits ?? 0).toLocaleString()}
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
                  {(role === 'creator' || role === 'admin') && (
                    <DropdownLink href="/creator">Creator Studio</DropdownLink>
                  )}
                  <DropdownLink href="/developers">Developer API</DropdownLink>
                  <DropdownLink href="/pricing">Pricing</DropdownLink>
                  {role === 'admin' && (
                    <DropdownLink href="/admin">Admin Panel</DropdownLink>
                  )}
                </div>
                <div className="border-t border-slate-100 pt-1">
                  <SignOutButton className="w-full text-left px-3.5 py-2 text-[13px] text-red-500 hover:bg-red-50 transition-colors" />
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
```

- [ ] **Step 3: Commit**

```bash
git add platform/components/navbar.tsx platform/components/navbar-user.tsx
git commit -m "style(platform): redesign Navbar with search, credits pill, orange accent"
```

---

### Task 7: Update Marketplace Layout

**Files:**
- Modify: `platform/app/(marketplace)/layout.tsx`

- [ ] **Step 1: Update layout with new bg and max-width**

```tsx
import { Navbar } from '@/components/navbar'

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Navbar />
      <main>{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add platform/app/\(marketplace\)/layout.tsx
git commit -m "style(platform): update marketplace layout bg to #FAFAFA"
```

---

## Phase 1: Consumer Flow Pages

### Task 8: Redesign Homepage

**Files:**
- Modify: `platform/app/(marketplace)/page.tsx`
- Create: `platform/components/hero-keyframes.tsx`

This is the largest single page. The homepage has:
1. **Dark hero** (`#060608`) with perspective grid, floating glass app cards, "AI micro-apps" headline, stats, CTA buttons
2. **Trust bar** — "Trusted by teams at" company names
3. **Featured Apps** — 3-col grid with AppCard
4. **All Apps** — filter tabs (All/Popular/New/categories) + 3-col grid
5. **CTA Banner** — dark card with "Ready to build your own AI app?"
6. **Channels** — 2-col grid with ChannelCard
7. **Footer**

- [ ] **Step 1: Create hero-keyframes.tsx**

```tsx
export function HeroKeyframes() {
  return (
    <style>{`
      @keyframes float1 { 0%, 100% { transform: translateY(0) rotate(-1deg); } 50% { transform: translateY(-18px) rotate(1deg); } }
      @keyframes float2 { 0%, 100% { transform: translateY(0) rotate(1deg); } 50% { transform: translateY(-14px) rotate(-1deg); } }
      @keyframes float3 { 0%, 100% { transform: translateY(0) rotate(0.5deg); } 50% { transform: translateY(-20px) rotate(-0.5deg); } }
    `}</style>
  )
}
```

- [ ] **Step 2: Create homepage-client.tsx for interactive parts**

Create `platform/app/(marketplace)/homepage-client.tsx` — handles filter tabs and renders the client-interactive portions. The server page.tsx fetches data and passes it down.

```tsx
'use client'

import { useState } from 'react'
import { Zap, BarChart3, Shield, Globe, Sparkles, ArrowRight } from 'lucide-react'
import { AppCard, type AppCardData } from '@/components/app-card'
import { ChannelCard, type ChannelCardData } from '@/components/channel-card'
import { Footer } from '@/components/footer'
import { HeroKeyframes } from '@/components/hero-keyframes'

export function HomepageClient({
  apps,
  channels,
  categories,
}: {
  apps: AppCardData[]
  channels: ChannelCardData[]
  categories: string[]
}) {
  const [activeFilter, setActiveFilter] = useState('All')
  const filters = ['All', 'Popular', 'New', ...categories]

  const filteredApps = activeFilter === 'All' || activeFilter === 'Popular' || activeFilter === 'New'
    ? apps
    : apps.filter((a) => a.category === activeFilter)

  return (
    <>
      <HeroKeyframes />

      {/* ===== HERO — Dark with Perspective Grid ===== */}
      <div className="bg-[#060608] pt-20 pb-20 relative overflow-hidden">
        {/* Perspective grid */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,107,0,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,107,0,0.07)_1px,transparent_1px)] bg-[size:60px_60px] [perspective:600px] [transform:rotateX(55deg)] [transform-origin:50%_0%] [mask-image:linear-gradient(to_bottom,transparent_5%,black_30%,black_50%,transparent_90%)]" />
        </div>
        {/* Horizon glow */}
        <div className="absolute bottom-[15%] left-1/2 -translate-x-1/2 w-[800px] h-[3px] bg-[#FF6B00]/20 blur-[2px] rounded-full" />
        <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2 w-[600px] h-[60px] bg-[#FF6B00]/[0.08] blur-[40px] rounded-full" />
        {/* Ambient glow */}
        <div className="absolute top-[20%] left-[10%] w-[300px] h-[300px] bg-[#FF6B00]/5 blur-[120px] rounded-full" />
        {/* Rising particles */}
        <div className="absolute w-1.5 h-1.5 bg-[#FF6B00]/50 rounded-full bottom-[20%] left-[25%] animate-ping" />
        <div className="absolute w-1 h-1 bg-[#FF6B00]/40 rounded-full bottom-[30%] left-[45%] animate-ping [animation-delay:1s]" />
        <div className="absolute w-1 h-1 bg-[#FF6B00]/30 rounded-full bottom-[25%] left-[65%] animate-ping [animation-delay:2s]" />

        {/* Floating glass cards — right side */}
        <div className="absolute right-[8%] top-[12%] w-[200px] h-[120px] rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-4 [animation:float1_7s_ease-in-out_infinite] hidden lg:block">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center"><Zap className="w-4 h-4 text-white" /></div>
            <div><div className="w-16 h-2.5 rounded bg-white/10 mb-1.5" /><div className="w-10 h-2 rounded bg-white/5" /></div>
          </div>
          <div className="w-full h-2 rounded bg-white/[0.06] mb-2" />
          <div className="w-3/4 h-2 rounded bg-white/[0.04]" />
        </div>

        <div className="absolute right-[22%] top-[52%] w-[180px] h-[110px] rounded-2xl border border-[#FF6B00]/[0.12] bg-[#FF6B00]/[0.03] backdrop-blur-sm p-4 [animation:float2_9s_ease-in-out_infinite] [animation-delay:1s] hidden lg:block">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center"><BarChart3 className="w-4 h-4 text-white" /></div>
            <div><div className="w-14 h-2.5 rounded bg-white/10 mb-1.5" /><div className="w-8 h-2 rounded bg-white/5" /></div>
          </div>
          <div className="w-full h-2 rounded bg-white/[0.06] mb-2" />
          <div className="w-2/3 h-2 rounded bg-white/[0.04]" />
        </div>

        <div className="absolute right-[4%] top-[55%] w-[170px] h-[105px] rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-4 [animation:float3_8s_ease-in-out_infinite] [animation-delay:0.5s] hidden lg:block">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center"><Shield className="w-4 h-4 text-white" /></div>
            <div><div className="w-12 h-2.5 rounded bg-white/10 mb-1.5" /><div className="w-9 h-2 rounded bg-white/5" /></div>
          </div>
          <div className="w-full h-2 rounded bg-white/[0.06] mb-2" />
          <div className="w-1/2 h-2 rounded bg-white/[0.04]" />
        </div>

        {/* Hero content — left side */}
        <div className="max-w-[1200px] mx-auto px-6 relative z-10">
          <div className="max-w-[600px]">
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-8">
              <div className="w-2 h-2 bg-[#FF6B00] rounded-full animate-pulse" />
              <span className="text-[13px] font-medium text-white/70">Now in Beta — 20 free credits on signup</span>
            </div>
            <h1 className="text-[56px] font-black text-white tracking-tight leading-[1.05] mb-6">
              AI micro-apps.<br />Built by creators.<br />
              <span className="text-[#FF6B00]">Ready to use.</span>
            </h1>
            <p className="text-[18px] text-white/50 leading-relaxed mb-10 max-w-[520px]">
              A marketplace of curated AI tools you can run instantly. No setup, no API keys, no code. Just credits and go.
            </p>
            <div className="flex items-center gap-4 mb-12">
              <a href="/signup" className="bg-[#FF6B00] hover:bg-[#E55D00] text-[#0A0A0A] rounded-xl px-8 py-4 text-[16px] font-bold transition-colors shadow-lg shadow-orange-900/40">
                Start for free
              </a>
              <a href="/pricing" className="bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl px-8 py-4 text-[16px] font-medium transition-colors">
                View pricing
              </a>
            </div>
            <div className="flex items-center gap-8">
              <div><p className="text-[28px] font-black text-white font-mono">86+</p><p className="text-[13px] text-white/40">AI apps live</p></div>
              <div className="w-px h-10 bg-white/10" />
              <div><p className="text-[28px] font-black text-white font-mono">34</p><p className="text-[13px] text-white/40">Creator channels</p></div>
              <div className="w-px h-10 bg-white/10" />
              <div><p className="text-[28px] font-black text-white font-mono">12k+</p><p className="text-[13px] text-white/40">Sessions this month</p></div>
              <div className="w-px h-10 bg-white/10" />
              <div><p className="text-[28px] font-black text-white font-mono">4.7</p><p className="text-[13px] text-white/40">Avg app rating</p></div>
            </div>
          </div>
        </div>
      </div>

      {/* Trust bar */}
      <div className="bg-[#F5F5F5] border-b border-slate-200 py-4">
        <div className="max-w-[1200px] mx-auto px-6 flex items-center justify-center gap-8">
          <span className="text-[13px] text-slate-400">Trusted by teams at</span>
          {['Acme Corp', 'Vercel', 'Stripe', 'Linear', 'Notion'].map((c) => (
            <span key={c} className="text-[14px] font-semibold text-slate-300">{c}</span>
          ))}
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6">
        {/* Featured Apps */}
        <div className="mb-12 mt-12">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-[22px] font-black text-slate-900 tracking-tight">Featured Apps</h2>
              <p className="text-[14px] text-slate-400 mt-0.5">Handpicked by the Terminal AI team</p>
            </div>
            <button className="flex items-center gap-1.5 text-[13px] font-semibold text-[#FF6B00] hover:text-[#E55D00] transition-colors duration-150">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {apps.slice(0, 3).map((app) => (
              <AppCard key={app.id} app={app} href={`/c/${app.channelSlug}/${app.slug}`} />
            ))}
          </div>
        </div>

        {/* All Apps with filter tabs */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[22px] font-black text-slate-900 tracking-tight">All Apps</h2>
            <div className="flex items-center gap-1 bg-slate-100/70 rounded-lg p-1">
              {filters.map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-all duration-150 ${
                    activeFilter === f
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {filteredApps.map((app) => (
              <AppCard key={app.id} app={app} href={`/c/${app.channelSlug}/${app.slug}`} />
            ))}
          </div>
        </div>

        {/* CTA Banner */}
        <div className="bg-[#0A0A0A] rounded-2xl p-12 mb-12 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,107,0,0.1),transparent_60%)]" />
          <div className="relative">
            <h2 className="text-[32px] font-black text-white tracking-tight mb-3">Ready to build your own AI app?</h2>
            <p className="text-[16px] text-white/50 mb-8 max-w-[400px] mx-auto">Deploy from Claude, Cursor, or any MCP editor. Live in minutes.</p>
            <div className="flex items-center justify-center gap-3">
              <a href="/creator" className="bg-[#FF6B00] hover:bg-[#E55D00] text-[#0A0A0A] rounded-xl px-6 py-3 text-[15px] font-bold transition-colors">Become a creator</a>
              <a href="/developers" className="bg-white/10 hover:bg-white/15 text-white rounded-xl px-6 py-3 text-[15px] font-medium border border-white/10 transition-colors">Read the docs</a>
            </div>
          </div>
        </div>

        {/* Channels */}
        <div className="mb-16">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-[22px] font-black text-slate-900 tracking-tight">Explore Channels</h2>
              <p className="text-[14px] text-slate-400 mt-0.5">Collections of AI apps by creators</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {channels.map((ch) => (
              <ChannelCard key={ch.id} channel={ch} href={`/c/${ch.slug}`} />
            ))}
          </div>
        </div>

        <Footer />
      </div>
    </>
  )
}
```

- [ ] **Step 3: Rewrite the server page.tsx to fetch data and render client component**

The server `page.tsx` keeps the existing DB query for channels, adds a query for apps, then passes both to `HomepageClient`. Map DB rows to `AppCardData` and `ChannelCardData` types.

```tsx
import { db } from '@/lib/db'
import { TrendingUp, Shield, Cpu, BarChart3, Globe, Layers } from 'lucide-react'
import { HomepageClient } from './homepage-client'
import type { AppCardData } from '@/components/app-card'
import type { ChannelCardData } from '@/components/channel-card'

// Icon map for app categories — extend as needed
const categoryIcons: Record<string, typeof TrendingUp> = {
  Finance: TrendingUp, Security: Shield, Developer: Cpu,
  Analytics: BarChart3, Productivity: Globe, default: Layers,
}
const categoryGradients: Record<string, string> = {
  Finance: 'from-teal-500 to-cyan-600', Security: 'from-blue-500 to-cyan-500',
  Developer: 'from-green-500 to-teal-500', Analytics: 'from-sky-500 to-blue-500',
  Productivity: 'from-pink-500 to-rose-500', default: 'from-orange-500 to-red-500',
}
const channelColors = ['bg-orange-600', 'bg-blue-600', 'bg-rose-600', 'bg-teal-600', 'bg-violet-600']

async function getApps() {
  const result = await db.query<{
    id: string; name: string; slug: string; description: string;
    credits_per_session: number; category: string;
    channel_name: string; channel_slug: string;
  }>(
    `SELECT a.id, a.name, a.slug, a.description,
            COALESCE(a.credits_per_session, 50) AS credits_per_session,
            COALESCE(a.category, 'Productivity') AS category,
            c.name AS channel_name, c.slug AS channel_slug
     FROM marketplace.apps a
     JOIN marketplace.channels c ON c.id = a.channel_id
     WHERE a.status = 'live' AND a.deleted_at IS NULL AND c.deleted_at IS NULL
     ORDER BY a.created_at DESC
     LIMIT 30`,
  )
  return result.rows
}

async function getChannels() {
  const result = await db.query<{
    id: string; slug: string; name: string; description: string;
    avatar_url: string | null; app_count: string; session_count: string;
  }>(
    `SELECT c.id, c.slug, c.name, c.description, c.avatar_url,
            COUNT(a.id) AS app_count,
            COALESCE(SUM(a.session_count), 0) AS session_count
     FROM marketplace.channels c
     LEFT JOIN marketplace.apps a ON a.channel_id = c.id AND a.status = 'live' AND a.deleted_at IS NULL
     WHERE c.status = 'active' AND c.deleted_at IS NULL
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
  )
  return result.rows
}

export default async function HomePage() {
  const [rawApps, rawChannels] = await Promise.all([getApps(), getChannels()])

  const apps: AppCardData[] = rawApps.map((a) => ({
    id: a.id,
    name: a.name,
    slug: a.slug,
    channelName: a.channel_name,
    channelSlug: a.channel_slug,
    description: a.description ?? '',
    credits: a.credits_per_session,
    rating: 4.7,   // TODO(P2): real ratings when review system ships
    reviewCount: 0,
    category: a.category,
    gradient: categoryGradients[a.category] ?? categoryGradients.default,
    icon: categoryIcons[a.category] ?? categoryIcons.default,
  }))

  const channels: ChannelCardData[] = rawChannels.map((c, i) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    handle: `@${c.slug}`,
    description: c.description ?? '',
    appCount: Number(c.app_count),
    sessionCount: Number(c.session_count),
    avatarColor: channelColors[i % channelColors.length],
    letter: c.name.charAt(0).toUpperCase(),
  }))

  const categories = [...new Set(apps.map((a) => a.category))]

  return <HomepageClient apps={apps} channels={channels} categories={categories} />
}
```

- [ ] **Step 4: Commit**

```bash
git add platform/components/hero-keyframes.tsx platform/app/\(marketplace\)/homepage-client.tsx platform/app/\(marketplace\)/page.tsx
git commit -m "style(platform): redesign homepage with dark hero, floating cards, orange accent"
```

---

### Task 9: Redesign Channel Page

**Files:**
- Modify: `platform/app/(marketplace)/c/[channelSlug]/page.tsx`

- [ ] **Step 1: Rewrite channel page**

Keep the existing data fetching. Redesign to match v11: back breadcrumb, rich channel header card (avatar, name, handle, description, stats, share button), sort tabs, 3-col app grid, empty state.

Refer to v11 lines 318-367 for exact styling. The page is a server component; sort tabs can be a small client component or static for now.

- [ ] **Step 2: Commit**

```bash
git add platform/app/\(marketplace\)/c/\[channelSlug\]/page.tsx
git commit -m "style(platform): redesign channel page matching v11 design"
```

---

### Task 10: Redesign App Detail Page

**Files:**
- Modify: `platform/app/(marketplace)/c/[channelSlug]/[appSlug]/page.tsx`

- [ ] **Step 1: Rewrite app detail page**

Two-column layout: main content (app hero with gradient icon, tabs: Overview/Screenshots/Reviews) + sticky sidebar (credits cost, Open App CTA button, Share/Save buttons, details list, Report link).

Refer to v11 lines 370-496 for exact styling. The "Open App" button links to `/viewer/{channelSlug}/{appSlug}`.

- [ ] **Step 2: Commit**

```bash
git add platform/app/\(marketplace\)/c/\[channelSlug\]/\[appSlug\]/page.tsx
git commit -m "style(platform): redesign app detail page with tabs and sidebar"
```

---

### Task 11: Redesign Pricing Page

**Files:**
- Modify: `platform/app/(marketplace)/pricing/pricing-client.tsx`

- [ ] **Step 1: Rewrite pricing page**

Dark hero header, billing toggle (monthly/annual), two-column grid: Subscription card (recommended badge, orange border, feature list) + Pay-as-you-go card (credit slider, volume discounts). Trust section below. Footer.

Refer to v11 lines 1189-1303 for exact styling. Keep existing Razorpay integration logic.

- [ ] **Step 2: Commit**

```bash
git add platform/app/\(marketplace\)/pricing/
git commit -m "style(platform): redesign pricing page with dark hero and billing toggle"
```

---

### Task 12: Redesign Account Credits Page

**Files:**
- Modify: `platform/app/(marketplace)/account/page.tsx`

- [ ] **Step 1: Rewrite account credits page**

Sidebar nav (Credits/Security/Usage History) + main content: dark gradient balance card, recent transactions list (icon per type, color-coded amounts), top-up cards (3-col grid with popular badge).

Refer to v11 lines 539-604 for exact styling. Keep existing DB queries for balance and transactions.

- [ ] **Step 2: Commit**

```bash
git add platform/app/\(marketplace\)/account/page.tsx
git commit -m "style(platform): redesign account credits page with sidebar nav"
```

---

### Task 13: Redesign Account Security Page

**Files:**
- Modify: `platform/app/(marketplace)/account/account-password-form.tsx`

Create a new route or tab for security. In the design, security is a separate sidebar tab but same URL pattern. The simplest approach: make `/account` show credits, add `/account/security` for security, `/account/usage` for usage history.

- [ ] **Step 1: Create account security page at `platform/app/(marketplace)/account/security/page.tsx`**

Sidebar + main: Change Password card, 2FA toggle card, Active Sessions list (with revoke), Connected Accounts (Google/GitHub). Refer to v11 lines 606-685.

- [ ] **Step 2: Create account layout with sidebar at `platform/app/(marketplace)/account/layout.tsx`**

```tsx
import { SidebarNav } from '@/components/sidebar-nav'
import { Sparkles, Shield, Clock } from 'lucide-react'

const accountTabs = [
  { id: 'credits', label: 'Credits', icon: Sparkles, href: '/account' },
  { id: 'security', label: 'Security', icon: Shield, href: '/account/security' },
  { id: 'usage', label: 'Usage History', icon: Clock, href: '/account/usage' },
]

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex gap-8">
        <SidebarNav title="Account" tabs={accountTabs} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add platform/app/\(marketplace\)/account/
git commit -m "style(platform): add account sidebar layout + security page"
```

---

### Task 14: Create Account Usage History Page

**Files:**
- Create: `platform/app/(marketplace)/account/usage/page.tsx`

- [ ] **Step 1: Create usage history page**

Summary cards (sessions this week, credits used, most used app) + data table (app, channel, date, duration, credits). Refer to v11 lines 1305-1360.

Fetch data from `gateway.api_calls` or `subscriptions.credit_ledger` joined with apps.

- [ ] **Step 2: Commit**

```bash
git add platform/app/\(marketplace\)/account/usage/page.tsx
git commit -m "feat(platform): add usage history page under account"
```

---

## Phase 2: Auth Flow

### Task 15: Redesign Login Page

**Files:**
- Modify: `platform/app/(auth)/login/page.tsx`

- [ ] **Step 1: Rewrite login page**

Dark background (`#0A0A0A`), centered 420px card. White Zap icon on white rounded-xl bg. "Welcome back" heading. White card with: Google OAuth button (slate bg), GitHub OAuth button (dark bg), "or" divider, email input, password input, sign-in button (dark bg), "No account? Sign up free" link in orange.

Refer to v11 lines 1362-1405. Keep existing `authClient.signIn.email` logic, add `Forgot password?` link between label and input.

```tsx
'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Zap } from 'lucide-react'

function LoginForm() {
  const router = useRouter()
  const next = useSearchParams().get('next') ?? '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await authClient.signIn.email({ email, password })
    setLoading(false)
    if (error) { setError(error.message ?? 'Sign in failed.'); return }
    router.push(next)
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
      <div className="w-[420px]">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mx-auto mb-4">
            <Zap className="w-6 h-6 text-[#0A0A0A]" />
          </div>
          <h1 className="text-[28px] font-black text-white tracking-tight">Welcome back</h1>
          <p className="text-[15px] text-white/40 mt-1">Sign in to Terminal AI</p>
        </div>
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          {/* OAuth buttons */}
          <button type="button" className="w-full flex items-center justify-center gap-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl py-3 text-[14px] font-medium text-slate-700 transition-colors mb-4">
            <span className="w-5 h-5 bg-slate-300 rounded-full flex items-center justify-center text-[10px] font-bold text-white">G</span>
            Continue with Google
          </button>
          <button type="button" className="w-full flex items-center justify-center gap-3 bg-[#0A0A0A] hover:bg-[#1A1A1A] rounded-xl py-3 text-[14px] font-medium text-white transition-colors mb-6">
            <span className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-[10px] font-bold">GH</span>
            Continue with GitHub
          </button>
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[12px] text-slate-400 font-medium">or</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[13px] font-medium text-slate-700 mb-1.5 block">Email</label>
              <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="w-full h-[44px] px-4 rounded-xl border border-slate-200 text-[14px] text-slate-700 placeholder-slate-400 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[13px] font-medium text-slate-700">Password</label>
                <a href="/forgot-password" className="text-[12px] font-medium text-[#FF6B00] hover:underline">Forgot password?</a>
              </div>
              <input type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" className="w-full h-[44px] px-4 rounded-xl border border-slate-200 text-[14px] text-slate-700 placeholder-slate-400 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all" />
            </div>
            {error && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-600">{error}</div>
            )}
            <button type="submit" disabled={loading} className="w-full bg-[#0A0A0A] hover:bg-[#1A1A1A] text-white rounded-xl py-3 text-[15px] font-bold transition-colors">
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
          <p className="text-center text-[13px] text-slate-400 mt-4">
            No account?{' '}
            <a href="/signup" className="text-[#FF6B00] font-semibold hover:underline">Sign up free</a>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>
}
```

- [ ] **Step 2: Commit**

```bash
git add platform/app/\(auth\)/login/page.tsx
git commit -m "style(platform): redesign login page with dark bg + OAuth buttons"
```

---

### Task 16: Redesign Signup Page

**Files:**
- Modify: `platform/app/(auth)/signup/page.tsx`

- [ ] **Step 1: Rewrite signup page**

Same dark bg pattern as login. "Create your account" heading, "Get 20 free credits on signup" subtitle. White card with: Google/GitHub OAuth, "or" divider, Full name + Email + Password inputs, orange "Create account" CTA, terms text, "Already have an account? Sign in" link.

Refer to v11 lines 1407-1451. Keep existing `authClient.signUp.email` logic.

- [ ] **Step 2: Commit**

```bash
git add platform/app/\(auth\)/signup/page.tsx
git commit -m "style(platform): redesign signup page with dark bg + OAuth buttons"
```

---

## Phase 3: Creator Flow

### Task 17: Redesign Creator Layout

**Files:**
- Modify: `platform/app/creator/layout.tsx`

- [ ] **Step 1: Rewrite creator layout**

Replace top nav with the marketplace Navbar (imported). The sidebar nav is rendered by individual pages using SidebarNav component. Keep auth guard.

```tsx
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Navbar } from '@/components/navbar'

export default async function CreatorLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login?next=/creator')
  if (session.user.role !== 'creator' && session.user.role !== 'admin') {
    redirect('/?error=not_creator')
  }
  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Navbar />
      <main>{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add platform/app/creator/layout.tsx
git commit -m "style(platform): redesign creator layout with shared Navbar"
```

---

### Task 18: Redesign Creator Dashboard

**Files:**
- Modify: `platform/app/creator/page.tsx`

- [ ] **Step 1: Rewrite creator dashboard**

SidebarNav (Dashboard/Channels/Developer API) + main: heading + "New Channel" orange button, 4-col stat cards (Total Apps, Sessions, Credit Revenue, Active Users), "Your Channels" 2-col grid with channel cards showing status badge.

Refer to v11 lines 712-769. Keep existing DB queries.

- [ ] **Step 2: Commit**

```bash
git add platform/app/creator/page.tsx
git commit -m "style(platform): redesign creator dashboard with stat cards and sidebar"
```

---

### Task 19: Redesign Create Channel Page

**Files:**
- Modify: `platform/app/creator/channels/new/page.tsx`

- [ ] **Step 1: Rewrite create channel page**

Centered 600px card (Stripe-style). Back breadcrumb, "Create a channel" heading, avatar upload area (dashed border circle), form fields: channel name, URL slug with live prefix preview (`terminal.app/c/`), description textarea, category select dropdown. Cancel/Create buttons.

Refer to v11 lines 771-825. Keep existing form submission logic.

- [ ] **Step 2: Commit**

```bash
git add platform/app/creator/channels/new/page.tsx
git commit -m "style(platform): redesign create channel page with centered card form"
```

---

### Task 20: Redesign Developer API Page

**Files:**
- Modify: `platform/app/(marketplace)/developers/page.tsx`

- [ ] **Step 1: Rewrite developer API page**

SidebarNav under Creator Studio + main: "Developer API" badge, heading, 4 tabs (Getting Started / API Keys / MCP Setup / API Reference).

- **Getting Started:** 4 numbered step cards (01-04) with icons
- **API Keys:** input + "Generate Key" button, keys table with revoke
- **MCP Setup:** dark code block with Transport/Endpoint/Auth/Tools
- **API Reference:** endpoint list with method badges (GET=green, POST=blue, PATCH=amber, DELETE=red)

Refer to v11 lines 827-925. Keep existing API key management logic.

- [ ] **Step 2: Commit**

```bash
git add platform/app/\(marketplace\)/developers/
git commit -m "style(platform): redesign developer API page with tabs and code blocks"
```

---

## Phase 4: Admin Flow

### Task 21: Redesign Admin Layout

**Files:**
- Modify: `platform/app/admin/layout.tsx`

- [ ] **Step 1: Rewrite admin layout**

Switch from dark theme to light theme with shared Navbar. Keep auth guard. Individual pages render SidebarNav.

```tsx
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Navbar } from '@/components/navbar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login?next=/admin')
  if (session.user.role !== 'admin') redirect('/?error=forbidden')
  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Navbar />
      <main>{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add platform/app/admin/layout.tsx
git commit -m "style(platform): redesign admin layout to light theme with shared Navbar"
```

---

### Task 22: Redesign Admin Overview

**Files:**
- Modify: `platform/app/admin/page.tsx`

- [ ] **Step 1: Rewrite admin overview**

SidebarNav (Overview/Users/Apps/Activity Log) + main: alert banners (warning/info/error with action buttons), 6 stat cards in 3-col grid, "Recent Activity" list.

Refer to v11 lines 973-1031. Keep existing DB queries for stats.

- [ ] **Step 2: Commit**

```bash
git add platform/app/admin/page.tsx
git commit -m "style(platform): redesign admin overview with alerts, stats, and activity"
```

---

### Task 23: Redesign Admin Users Page

**Files:**
- Modify: `platform/app/admin/users/page.tsx`

- [ ] **Step 1: Rewrite admin users page**

SidebarNav + main: heading with count, search bar + role filter tabs (All/Admin/Creator/User), data table with 12-col grid (avatar+name, email, role badge, credits, status badge, joined date). Clickable rows link to user detail.

Refer to v11 lines 1033-1079. Role badges: admin=orange, creator=blue, user=slate. Status badges: active=green, suspended=red.

- [ ] **Step 2: Commit**

```bash
git add platform/app/admin/users/page.tsx
git commit -m "style(platform): redesign admin users page with filterable data table"
```

---

### Task 24: Redesign Admin Apps Page

**Files:**
- Modify: `platform/app/admin/apps/page.tsx`

- [ ] **Step 1: Rewrite admin apps page**

Same pattern as users: SidebarNav + search + status filter (All/Live/Pending/Suspended) + data table (app name, channel, creator, status badge, sessions, credits, created date).

Refer to v11 lines 1081-1122.

- [ ] **Step 2: Commit**

```bash
git add platform/app/admin/apps/page.tsx
git commit -m "style(platform): redesign admin apps page with filterable data table"
```

---

### Task 25: Create Admin User Detail Page

**Files:**
- Create: `platform/app/admin/users/[userId]/page.tsx`

- [ ] **Step 1: Create user detail page**

Back breadcrumb, profile header card (avatar, name, role badge, status badge, email, joined date, credit balance), 4 action buttons (Change Role, Adjust Credits, View As User, Suspend/Unsuspend), credit history table, activity log table.

Refer to v11 lines 1124-1187. Fetch user by ID from `"user"` table, credit history from `subscriptions.credit_ledger`.

- [ ] **Step 2: Commit**

```bash
git add platform/app/admin/users/\[userId\]/page.tsx
git commit -m "feat(platform): add admin user detail page with actions and history"
```

---

## Phase 5: Viewer Shell

### Task 26: Redesign Viewer Shell Header

**Files:**
- Modify: `platform/app/viewer/[channelSlug]/[appSlug]/viewer-shell.tsx`

- [ ] **Step 1: Update viewer shell header bar**

Dark header bar (`#0A0A0A` border-b white/10): Back button (left), app icon + name + "by channel" text, credits pill (orange), session active indicator (right). The iframe area below remains white.

Refer to v11 lines 1453-1493. Keep ALL existing viewer state machine logic (deploying/loading/ready/session_ended/deploy_failed). Only restyle the header bar and status indicators to use orange accent instead of violet.

- [ ] **Step 2: Commit**

```bash
git add platform/app/viewer/\[channelSlug\]/\[appSlug\]/viewer-shell.tsx
git commit -m "style(platform): redesign viewer shell header with orange accent"
```

---

## Phase 6: Cleanup

### Task 27: Remove Old Components and Update Imports

**Files:**
- Modify: `platform/components/marketplace-filter.tsx` — may be unused after homepage rewrite
- Remove unused imports across all modified files

- [ ] **Step 1: Check for dead imports and unused components**

Run TypeScript compiler to catch any import errors:

```bash
cd platform && npx tsc --noEmit 2>&1 | head -50
```

Fix any type errors found.

- [ ] **Step 2: Commit**

```bash
git add -u platform/
git commit -m "chore(platform): cleanup dead imports and unused components"
```

---

### Task 28: Build Verification

- [ ] **Step 1: Run full build**

```bash
cd platform && npm run build 2>&1 | tail -30
```

Fix any build errors.

- [ ] **Step 2: Final commit if fixes needed**

```bash
git add -u platform/
git commit -m "fix(platform): resolve build errors from UI redesign"
```

---

## Summary

| Phase | Tasks | Pages Affected |
|-------|-------|---------------|
| 0: Design System + Shared Components | 1-7 | globals.css, navbar, app-card, channel-card, sidebar-nav, footer, marketplace layout |
| 1: Consumer Flow | 8-14 | Homepage, Channel, App Detail, Pricing, Account Credits/Security/Usage |
| 2: Auth Flow | 15-16 | Login, Signup |
| 3: Creator Flow | 17-20 | Creator layout, Dashboard, Create Channel, Developer API |
| 4: Admin Flow | 21-25 | Admin layout, Overview, Users, Apps, User Detail |
| 5: Viewer | 26 | Viewer shell header |
| 6: Cleanup | 27-28 | Build verification |

**Total: 28 tasks, 22 files modified, 6 files created, 17 screens redesigned.**
