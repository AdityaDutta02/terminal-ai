# P3 — Full UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **REQUIRED BEFORE ANY PAGE WORK:** Run `teach-impeccable` skill to create `.impeccable.md`, then use `frontend-design` skill per page. The design system (Task 1) must be complete before any page is touched.

**Goal:** Redesign all 8 platform surfaces to pass the "AI slop test" — no gradient cards, no purple-on-dark, no rounded icon + heading + text template. Precision tool aesthetic.

**Architecture:** Design system first (globals.css + fonts + tokens), then 8 pages in order. Light theme for marketplace/auth. Dark theme for viewer and all dashboards. No page-level layout changes in other tasks — each page is self-contained.

**Tech Stack:** Next.js 15 App Router, Tailwind CSS, `next/font/google` (Instrument Serif + DM Sans + JetBrains Mono), OKLCH color tokens, shadcn/ui components.

---

### Task 1: Design system — fonts, OKLCH tokens, spacing

**Files:**
- Modify: `platform/app/globals.css`
- Modify: `platform/app/layout.tsx`

**IMPORTANT:** Before this task, run the `teach-impeccable` skill to record design context in `.impeccable.md`.

- [ ] **Step 1: Run teach-impeccable**

```
/teach-impeccable
```

Record: precision tool aesthetic, light marketplace, dark dashboards/viewer, developer audience, Instrument Serif + DM Sans + JetBrains Mono.

- [ ] **Step 2: Update layout.tsx with new fonts**

```typescript
// platform/app/layout.tsx
import type { Metadata } from 'next'
import { Instrument_Serif, DM_Sans, JetBrains_Mono } from 'next/font/google'
import { Toaster } from '@/components/ui/toaster'
import { TooltipProvider } from '@/components/ui/tooltip'
import './globals.css'

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://terminalai.app'
export const metadata: Metadata = {
  title: { default: 'Terminal AI', template: '%s — Terminal AI' },
  description: 'AI-powered apps, built by creators.',
  metadataBase: new URL(APP_URL),
  openGraph: {
    siteName: 'Terminal AI',
    images: [{ url: '/og', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${instrumentSerif.variable} ${dmSans.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <TooltipProvider>
          {children}
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Rewrite globals.css with OKLCH tokens and dark mode**

```css
/* platform/app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Light surfaces (marketplace, auth) */
    --background: oklch(0.99 0.002 250);
    --foreground: oklch(0.14 0.02 250);
    --primary: oklch(0.40 0.14 250);
    --primary-hover: oklch(0.35 0.14 250);
    --accent: oklch(0.65 0.14 140);
    --muted: oklch(0.96 0.005 250);
    --muted-foreground: oklch(0.46 0.02 250);
    --border: oklch(0.88 0.006 250);
    --card: oklch(1.00 0 0);
    --card-foreground: oklch(0.14 0.02 250);
    --destructive: oklch(0.52 0.20 15);
    --destructive-foreground: oklch(0.99 0 0);
    --popover: oklch(1.00 0 0);
    --popover-foreground: oklch(0.14 0.02 250);
    --secondary: oklch(0.96 0.005 250);
    --secondary-foreground: oklch(0.14 0.02 250);
    --input: oklch(0.88 0.006 250);
    --ring: oklch(0.40 0.14 250);
    --radius: 0.375rem;

    /* Spacing scale */
    --space-xs: clamp(4px, 0.5vw, 6px);
    --space-sm: clamp(8px, 1vw, 12px);
    --space-md: clamp(12px, 1.5vw, 20px);
    --space-lg: clamp(20px, 2.5vw, 32px);
    --space-xl: clamp(32px, 4vw, 56px);
    --space-2xl: clamp(56px, 7vw, 96px);

    /* Radius scale */
    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 12px;
  }

  .dark {
    /* Dark surfaces (viewer, dashboards) */
    --background: oklch(0.11 0.010 250);
    --foreground: oklch(0.92 0.005 250);
    --primary: oklch(0.65 0.14 250);
    --primary-hover: oklch(0.70 0.14 250);
    --accent: oklch(0.72 0.12 140);
    --muted: oklch(0.17 0.010 250);
    --muted-foreground: oklch(0.58 0.01 250);
    --border: oklch(0.22 0.010 250);
    --card: oklch(0.14 0.010 250);
    --card-foreground: oklch(0.92 0.005 250);
    --destructive: oklch(0.62 0.20 15);
    --destructive-foreground: oklch(0.99 0 0);
    --popover: oklch(0.14 0.010 250);
    --popover-foreground: oklch(0.92 0.005 250);
    --secondary: oklch(0.17 0.010 250);
    --secondary-foreground: oklch(0.92 0.005 250);
    --input: oklch(0.22 0.010 250);
    --ring: oklch(0.65 0.14 250);
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground antialiased;
  }

  /* Typography utility classes */
  .font-display {
    font-family: var(--font-display), serif;
  }

  .font-mono {
    font-family: var(--font-mono), monospace;
  }
}
```

- [ ] **Step 4: Update tailwind.config to map font variables**

In `platform/tailwind.config.ts`, ensure `fontFamily` maps the CSS variables:

```typescript
// In theme.extend.fontFamily:
fontFamily: {
  sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
  display: ['var(--font-display)', 'serif'],
  mono: ['var(--font-mono)', 'monospace'],
},
```

- [ ] **Step 5: Verify fonts load**

```bash
cd platform && npm run dev
```

Open http://localhost:3000. Open browser devtools → Network → filter by font. Verify `instrument_serif`, `dm_sans`, `jetbrains_mono` fonts are loaded.

- [ ] **Step 6: Commit**

```bash
git add platform/app/globals.css platform/app/layout.tsx platform/tailwind.config.ts
git commit -m "feat(design-system): OKLCH tokens, Instrument Serif + DM Sans + JetBrains Mono (P3)"
```

---

### Task 2: Marketplace page redesign

**Files:**
- Modify: `platform/app/(marketplace)/page.tsx`
- Create: `platform/components/marketplace/app-card.tsx`
- Create: `platform/components/marketplace/sidebar-filters.tsx`

**Run `frontend-design` skill before implementing.** Target: `platform/app/(marketplace)/page.tsx`. Light theme. No gradient cards. No hero section. Two-column layout.

- [ ] **Step 1: Create minimal AppCard component**

```typescript
// platform/components/marketplace/app-card.tsx
import Link from 'next/link'

interface AppCardProps {
  slug: string
  channelSlug: string
  name: string
  channelName: string
  description: string
  modelTier: string
  creditsPerSession: number
  sessionCount: number
  isFree: boolean
}

const TIER_LABELS: Record<string, string> = {
  standard: 'Standard',
  advanced: 'Advanced',
  premium: 'Premium',
  'image-fast': 'Image',
  'image-pro': 'Image Pro',
}

export function AppCard({
  slug,
  channelSlug,
  name,
  channelName,
  description,
  modelTier,
  creditsPerSession,
  sessionCount,
  isFree,
}: AppCardProps) {
  return (
    <Link
      href={`/c/${channelSlug}/${slug}`}
      className="block border border-border rounded-[var(--radius-md)] p-4 hover:border-primary/50 transition-colors duration-150 bg-card"
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <h3 className="text-[16px] font-semibold leading-tight">{name}</h3>
      </div>
      <p className="text-[12px] text-muted-foreground mb-2">{channelName}</p>
      <p className="text-[14px] text-foreground/80 line-clamp-2 leading-relaxed">{description}</p>
      <div className="mt-3 flex items-center gap-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>{TIER_LABELS[modelTier] ?? modelTier}</span>
        <span>·</span>
        <span>{isFree ? 'Free' : `${creditsPerSession} cr`}</span>
        <span>·</span>
        <span>{sessionCount.toLocaleString()} uses</span>
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Create sidebar filters**

```typescript
// platform/components/marketplace/sidebar-filters.tsx
'use client'
import { useRouter, useSearchParams } from 'next/navigation'

const TIERS = [
  { value: '', label: 'All tiers' },
  { value: 'standard', label: 'Standard' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'premium', label: 'Premium' },
]

export function SidebarFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentTier = searchParams.get('tier') ?? ''
  const freeOnly = searchParams.get('free') === '1'

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`/?${params.toString()}`)
  }

  return (
    <aside className="w-48 flex-shrink-0 hidden md:block">
      <div className="space-y-6">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
            Model Tier
          </p>
          <div className="space-y-1">
            {TIERS.map((tier) => (
              <button
                key={tier.value}
                onClick={() => update('tier', tier.value)}
                className={`w-full text-left text-sm px-2 py-1 rounded transition-colors ${
                  currentTier === tier.value
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-foreground/70 hover:text-foreground hover:bg-muted'
                }`}
              >
                {tier.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={freeOnly}
              onChange={(e) => update('free', e.target.checked ? '1' : '')}
              className="h-3.5 w-3.5 rounded border-border"
            />
            <span className="text-sm">Free apps only</span>
          </label>
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Rewrite marketplace page**

Read the existing `platform/app/(marketplace)/page.tsx` first, then replace with:

```typescript
// platform/app/(marketplace)/page.tsx
import { db } from '@/lib/db'
import { AppCard } from '@/components/marketplace/app-card'
import { SidebarFilters } from '@/components/marketplace/sidebar-filters'
import { Suspense } from 'react'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

const MODEL_TIER_CREDITS: Record<string, number> = {
  standard: 1, advanced: 4, premium: 6, 'image-fast': 3, 'image-pro': 93,
}

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const session = await auth.api.getSession({ headers: await headers() })
  const tier = sp['tier'] ?? ''
  const freeOnly = sp['free'] === '1'
  const q = sp['q'] ?? ''

  const conditions: string[] = ['a.status = \'live\'', 'a.deleted_at IS NULL']
  const values: (string | boolean)[] = []
  let i = 1

  if (tier) { conditions.push(`a.model_tier = $${i++}`); values.push(tier) }
  if (freeOnly) { conditions.push(`a.is_free = TRUE`) }
  if (q) { conditions.push(`(a.name ILIKE $${i++} OR a.description ILIKE $${i-1})`); values.push(`%${q}%`) }

  const where = conditions.join(' AND ')

  const { rows: apps } = await db.query(
    `SELECT a.id, a.slug, a.name, a.description, a.model_tier, a.is_free, a.session_count,
            c.slug as channel_slug, c.name as channel_name
     FROM marketplace.apps a
     JOIN marketplace.channels c ON c.id = a.channel_id
     WHERE ${where}
     ORDER BY a.session_count DESC
     LIMIT 48`,
    values
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <Link href="/" className="font-display text-xl font-normal text-foreground">
            Terminal AI
          </Link>
          <form action="/" className="flex-1 max-w-sm">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search apps…"
              className="w-full text-sm px-3 py-1.5 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </form>
          <nav className="flex items-center gap-4 text-sm">
            {session?.user ? (
              <Link href="/dashboard" className="text-foreground/70 hover:text-foreground transition-colors">
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/sign-in" className="text-foreground/70 hover:text-foreground transition-colors">
                  Sign in
                </Link>
                <Link
                  href="/sign-up"
                  className="px-3 py-1.5 rounded bg-primary text-white text-sm hover:bg-[var(--primary-hover)] transition-colors"
                >
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex gap-10">
          <Suspense>
            <SidebarFilters />
          </Suspense>

          <main className="flex-1 min-w-0">
            {apps.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground text-sm">
                No apps found. Try clearing your filters.
              </div>
            ) : (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {(apps as Array<Record<string, unknown>>).map((app) => (
                  <AppCard
                    key={app['id'] as string}
                    slug={app['slug'] as string}
                    channelSlug={app['channel_slug'] as string}
                    name={app['name'] as string}
                    channelName={app['channel_name'] as string}
                    description={(app['description'] as string) ?? ''}
                    modelTier={(app['model_tier'] as string) ?? 'standard'}
                    creditsPerSession={MODEL_TIER_CREDITS[(app['model_tier'] as string)] ?? 1}
                    sessionCount={(app['session_count'] as number) ?? 0}
                    isFree={Boolean(app['is_free'])}
                  />
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify visually**

```bash
cd platform && npm run dev
```

Open http://localhost:3000. Verify: no gradient cards, no hero section, two-column layout with sidebar filters, DM Sans font, minimal cards.

- [ ] **Step 5: Commit**

```bash
git add platform/app/(marketplace)/page.tsx platform/components/marketplace/
git commit -m "feat(P3): marketplace page redesign — minimal cards, sidebar filters"
```

---

### Task 3: Auth pages redesign

**Files:**
- Modify: `platform/app/(auth)/login/page.tsx`
- Modify: `platform/app/(auth)/signup/page.tsx`

**Run `frontend-design` skill before implementing.** Target: auth pages. Light theme. Two-column layout. No gradient blobs.

- [ ] **Step 1: Read existing auth pages**

Read `platform/app/(auth)/login/page.tsx` and `platform/app/(auth)/signup/page.tsx` to understand current implementation.

- [ ] **Step 2: Create auth layout wrapper**

Create `platform/app/(auth)/auth-layout.tsx`:

```typescript
// platform/app/(auth)/auth-layout.tsx
import Link from 'next/link'

export function AuthLayout({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode
  title: string
  subtitle: string
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 border-r border-border bg-muted/30">
        <Link href="/" className="font-display text-2xl">
          Terminal AI
        </Link>
        <div>
          <p className="text-4xl font-display leading-tight text-foreground">
            {title}
          </p>
          <p className="mt-3 text-muted-foreground">{subtitle}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Terminal AI
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8">
            <Link href="/" className="font-display text-2xl">
              Terminal AI
            </Link>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Rewrite login page**

Replace content of `platform/app/(auth)/login/page.tsx`, preserving all existing auth logic (form submission, error handling). Only update the visual markup:

- Wrap in `<AuthLayout title="Build AI apps for everyone." subtitle="The platform for creating and distributing AI applications.">`
- Replace any gradient backgrounds, colored blobs with the clean two-column layout
- Inputs: `border border-input rounded-[var(--radius-sm)] px-3 py-2 text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary`
- Primary button: `w-full bg-primary text-white rounded-[var(--radius-sm)] py-2 text-sm font-medium hover:bg-[var(--primary-hover)] transition-colors`
- Errors: red border on input + inline `<p className="text-xs text-destructive mt-1">` (no toasts)

- [ ] **Step 4: Rewrite signup page**

Same pattern as login. After email submission, show the verification screen:

```typescript
// Email verification sent state (render when submitState === 'sent')
<div className="text-center">
  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary/30">
    <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  </div>
  <h2 className="text-xl font-display">Check your inbox</h2>
  <p className="mt-2 text-sm text-muted-foreground">
    We sent a verification link to <strong>{submittedEmail}</strong>.
    Verify to receive 20 free credits.
  </p>
  <button
    onClick={handleResend}
    className="mt-4 text-sm text-primary hover:underline"
    disabled={resendCooldown > 0}
  >
    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend email'}
  </button>
</div>
```

- [ ] **Step 5: Verify visually**

```bash
cd platform && npm run dev
```

Open http://localhost:3000/sign-in and http://localhost:3000/sign-up. Verify: two-column layout, no gradient blobs, inline error states, email verification screen visible after signup.

- [ ] **Step 6: Commit**

```bash
git add platform/app/(auth)/
git commit -m "feat(P3): auth pages redesign — two-column, no gradient blobs, email verify screen"
```

---

### Task 4: Viewer redesign

**Files:**
- Modify: `platform/app/viewer/[channelSlug]/[appSlug]/viewer-shell.tsx`

**Run `frontend-design` skill before implementing.** Target: viewer. Dark theme. Terminal focus mode. Top bar 40px.

- [ ] **Step 1: Add dark class to viewer page**

In `platform/app/viewer/[channelSlug]/[appSlug]/page.tsx`, ensure the HTML wrapper has `className="dark"` or wrap the viewer shell in a dark container. Find how the page root element is structured and add `dark` class.

If the page has no explicit HTML wrapper, wrap the `<ViewerShell>` in:
```typescript
<div className="dark bg-background text-foreground h-screen">
  <ViewerShell ... />
</div>
```

- [ ] **Step 2: Redesign viewer-shell.tsx top bar**

Replace the top bar `<div>` (the `h-12` header) with:

```typescript
<div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-border bg-background px-4">
  <div className="flex items-center gap-3">
    <a
      href={`/c/${channelSlug}`}
      className="text-muted-foreground hover:text-foreground transition-colors"
      aria-label="Close app"
    >
      <X className="h-4 w-4" />
    </a>
    <span className="font-mono text-sm text-foreground">{appName}</span>
  </div>
  <div className="flex items-center gap-4">
    {(viewState === 'deploying' || viewState === 'loading') && (
      <span className="text-xs text-muted-foreground animate-pulse">
        {viewState === 'deploying' ? 'deploying' : 'connecting'}
      </span>
    )}
    <span className="font-mono text-xs text-muted-foreground">
      {credits} <span className="text-muted-foreground/50">cr</span>
    </span>
    <a
      href="/account"
      className="flex h-6 w-6 items-center justify-center rounded-sm bg-primary/20 text-xs font-medium text-primary hover:bg-primary/30 transition-colors font-mono"
      title={userName}
    >
      {initials}
    </a>
  </div>
</div>
```

- [ ] **Step 3: Redesign the deploy_failed and error states**

Replace the centered state cards:

```typescript
{(viewState === 'deploy_failed' || viewState === 'error') && (
  <div className="flex h-full items-center justify-center">
    <div className="max-w-xs text-center">
      <p className="text-sm font-medium text-foreground">
        {viewState === 'deploy_failed' ? 'Deployment failed' : 'Unable to load app'}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {viewState === 'deploy_failed'
          ? 'This app failed to deploy. The creator has been notified.'
          : errorMsg}
      </p>
      {viewState === 'error' && (
        <button
          onClick={() => setViewState('loading')}
          className="mt-4 text-sm text-primary hover:underline"
        >
          Try again
        </button>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify visually**

Open any app in the viewer. Verify: dark background, 40px top bar, JetBrains Mono for app name, no colorful avatar background.

- [ ] **Step 5: Commit**

```bash
git add platform/app/viewer/
git commit -m "feat(P3): viewer redesign — dark theme, 40px top bar, terminal aesthetic"
```

---

### Task 5: User dashboard redesign

**Files:**
- Modify: `platform/app/dashboard/page.tsx`
- Create: `platform/app/dashboard/layout.tsx` (if not present)

**Run `frontend-design` skill before implementing.** Target: user dashboard. Dark theme. Data-first. Stats inline with separators (no cards).

- [ ] **Step 1: Read existing dashboard page**

Read `platform/app/dashboard/page.tsx` to understand current structure and data fetching.

- [ ] **Step 2: Create dark layout**

Create `platform/app/dashboard/layout.tsx`:

```typescript
// platform/app/dashboard/layout.tsx
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')

  const user = session.user

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-56 flex-shrink-0 border-r border-border min-h-screen flex flex-col">
          <div className="p-5 border-b border-border">
            <Link href="/" className="font-display text-lg">Terminal AI</Link>
          </div>
          <div className="p-4 border-b border-border">
            <p className="text-sm font-medium truncate">{user.name ?? user.email}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
          <nav className="flex-1 p-3">
            <div className="space-y-0.5">
              {[
                { href: '/dashboard', label: 'Dashboard' },
                { href: '/dashboard/sessions', label: 'Sessions' },
                { href: '/dashboard/settings', label: 'Settings' },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block px-3 py-2 text-sm rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
          <div className="p-3 border-t border-border">
            <Link
              href="/pricing"
              className="block px-3 py-2 text-sm text-primary hover:underline"
            >
              Upgrade plan →
            </Link>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Rewrite dashboard page**

Read and rewrite `platform/app/dashboard/page.tsx`. Keep all existing DB queries, replace markup:

```typescript
// Structure — preserve all data fetching from existing page, replace JSX:
<div className="p-8">
  <h1 className="text-xl font-semibold mb-6">Dashboard</h1>

  {/* Stats row — no cards, inline with separators */}
  <div className="flex items-center gap-6 border-b border-border pb-6 mb-6">
    <div>
      <p className="font-mono text-2xl font-medium">{balance}</p>
      <p className="text-xs text-muted-foreground mt-0.5">credits</p>
    </div>
    <div className="h-8 w-px bg-border" />
    <div>
      <p className="text-sm">{planName ?? 'No active plan'}</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {renewalDate ? `Renews ${renewalDate}` : 'One-time credits only'}
      </p>
    </div>
    <div className="h-8 w-px bg-border" />
    <div>
      <p className="font-mono text-2xl font-medium">{sessionsThisMonth}</p>
      <p className="text-xs text-muted-foreground mt-0.5">sessions this month</p>
    </div>
  </div>

  {/* Sessions table */}
  <div>
    <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
      Recent Sessions
    </h2>
    <table className="w-full text-sm border border-border rounded overflow-hidden">
      <thead className="bg-muted/50 border-b border-border">
        <tr>
          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">App</th>
          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Channel</th>
          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
          <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Credits</th>
          <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Status</th>
        </tr>
      </thead>
      <tbody>
        {sessions.map((s) => (
          <tr key={s.id} className="border-b border-border/50 last:border-0">
            <td className="px-4 py-2.5">{s.app_name}</td>
            <td className="px-4 py-2.5 text-muted-foreground">{s.channel_name}</td>
            <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{s.date}</td>
            <td className="px-4 py-2.5 text-right font-mono text-xs">{s.credits_used}</td>
            <td className="px-4 py-2.5 text-right capitalize text-muted-foreground">{s.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add platform/app/dashboard/
git commit -m "feat(P3): user dashboard redesign — dark theme, inline stats, no cards"
```

---

### Task 6: Creator dashboard redesign

**Files:**
- Modify: `platform/app/creator/page.tsx`
- Create/modify: `platform/app/creator/layout.tsx`

**Run `frontend-design` skill before implementing.** Target: creator dashboard. Dark theme. High-density analytics. Table not cards.

- [ ] **Step 1: Create/update creator layout**

Same sidebar structure as dashboard layout but with creator-specific navigation:

```typescript
// Sidebar nav items for creator:
{ href: '/creator', label: 'Overview' },
{ href: '/creator/apps', label: 'My Apps' },
{ href: '/creator/analytics', label: 'Analytics' },
{ href: '/creator/settings', label: 'Settings' },
```

- [ ] **Step 2: Rewrite creator page**

Read existing `platform/app/creator/page.tsx`, preserve DB queries, replace markup:

```typescript
// Metrics bar — horizontal, not cards
<div className="flex items-center gap-6 border-b border-border pb-6 mb-6">
  <div>
    <p className="font-mono text-2xl">{sessionsThisMonth}</p>
    <p className="text-xs text-muted-foreground">sessions this month</p>
  </div>
  <div className="h-8 w-px bg-border" />
  <div>
    <p className="font-mono text-2xl">{creditsEarned}</p>
    <p className="text-xs text-muted-foreground">credits earned</p>
  </div>
  <div className="h-8 w-px bg-border" />
  <div>
    <p className="font-mono text-2xl">₹{(creditsEarned * 0.30).toFixed(0)}</p>
    <p className="text-xs text-muted-foreground">estimated earnings</p>
  </div>
  <div className="h-8 w-px bg-border" />
  <div>
    <p className="font-mono text-2xl">{activeApps}</p>
    <p className="text-xs text-muted-foreground">active apps</p>
  </div>
</div>

// Apps table (not grid of cards)
<table className="w-full text-sm border border-border rounded overflow-hidden">
  <thead className="bg-muted/50 border-b border-border">
    <tr>
      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">App</th>
      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Sessions (30d)</th>
      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Credits earned</th>
      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Tier</th>
    </tr>
  </thead>
  <tbody>
    {apps.map((app) => (
      <tr key={app.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
        <td className="px-4 py-2.5">
          <a href={`/creator/apps/${app.id}`} className="hover:text-primary transition-colors">
            {app.name}
          </a>
        </td>
        <td className="px-4 py-2.5">
          <span className={`text-xs font-mono ${app.status === 'live' ? 'text-green-500' : 'text-muted-foreground'}`}>
            {app.status}
          </span>
        </td>
        <td className="px-4 py-2.5 text-right font-mono text-xs">{app.sessions_30d}</td>
        <td className="px-4 py-2.5 text-right font-mono text-xs">{app.credits_earned}</td>
        <td className="px-4 py-2.5 text-right text-muted-foreground capitalize text-xs">{app.model_tier}</td>
      </tr>
    ))}
  </tbody>
</table>

// Revenue section
<div className="mt-6 pt-6 border-t border-border">
  <p className="text-xs text-muted-foreground">
    Payout system coming soon. Credits → INR at ₹0.30 per credit.
  </p>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add platform/app/creator/
git commit -m "feat(P3): creator dashboard redesign — dark, metrics bar, table layout"
```

---

### Task 7: Creator app settings redesign

**Files:**
- Modify: `platform/app/creator/apps/[appId]/page.tsx`

**Run `frontend-design` skill before implementing.** Target: app settings. Dark theme. Inline editing, not modal. Danger zone at bottom.

- [ ] **Step 1: Read existing app settings page**

Read `platform/app/creator/apps/[appId]/page.tsx`.

- [ ] **Step 2: Rewrite with settings layout**

Preserve all form submission logic. Replace markup:

```typescript
// Structure:
// - App name + description: editable inline (standard form inputs, not modal)
// - Status toggle: live / draft
// - Model tier selector: <select> with credit cost shown next to each option
// - Free app toggle: checkbox with warning text
// - Tabs: Overview | Deployments | Settings | Analytics
// - Danger zone: at bottom of Settings tab, requires typing app name

// Model tier <select> options format:
<option value="standard">Standard — 1 credit/session</option>
<option value="advanced">Advanced — 4 credits/session</option>
<option value="premium">Premium — 6 credits/session</option>
<option value="image-fast">Image (fast) — 3 credits/session</option>
<option value="image-pro">Image Pro — 93 credits/session</option>

// Danger zone:
<div className="mt-10 border border-destructive/30 rounded p-4">
  <h3 className="text-sm font-medium text-destructive">Danger Zone</h3>
  <p className="text-sm text-muted-foreground mt-1">
    Permanently delete this app. This action cannot be undone.
  </p>
  <DeleteAppForm appId={appId} appName={appName} />
</div>
```

Create `DeleteAppForm` as a small client component that requires typing the app name before enabling the delete button.

- [ ] **Step 3: Commit**

```bash
git add platform/app/creator/apps/
git commit -m "feat(P3): creator app settings redesign — inline editing, danger zone"
```

---

### Task 8: Pricing page

**Files:**
- Create: `platform/app/(marketplace)/pricing/page.tsx`

**Run `frontend-design` skill before implementing.** Target: pricing page. Light theme. Conversion-focused. No comparison table.

- [ ] **Step 1: Create pricing page**

```typescript
// platform/app/(marketplace)/pricing/page.tsx
import Link from 'next/link'

const PLANS = [
  {
    name: 'Starter',
    price: '₹149',
    period: '/month',
    credits: 250,
    features: ['250 credits/month', 'Access to all apps', 'Standard support', 'Session history'],
    cta: 'Get Starter',
    href: '/sign-up?plan=starter',
    highlight: false,
  },
  {
    name: 'Creator',
    price: '₹299',
    period: '/month',
    credits: 650,
    features: ['650 credits/month', 'Publish unlimited apps', 'Priority support', 'Analytics dashboard', 'Revenue sharing'],
    cta: 'Get Creator',
    href: '/sign-up?plan=creator',
    highlight: true,
  },
  {
    name: 'Pro',
    price: '₹599',
    period: '/month',
    credits: 1400,
    features: ['1,400 credits/month', 'Everything in Creator', 'API access', 'Custom branding', 'Dedicated support'],
    cta: 'Get Pro',
    href: '/sign-up?plan=pro',
    highlight: false,
  },
]

const CREDIT_PACKS = [
  { name: 'Small Pack', credits: 100, price: '₹89', perCredit: '₹0.89', badge: null },
  { name: 'Medium Pack', credits: 500, price: '₹399', perCredit: '₹0.80', badge: 'Best value' },
  { name: 'Large Pack', credits: 2000, price: '₹1,499', perCredit: '₹0.75', badge: null },
]

const FAQ = [
  { q: 'What is a credit?', a: 'One credit unlocks one AI session. Session pricing varies by model tier: Standard apps cost 1 credit, Advanced cost 4, Premium cost 6.' },
  { q: 'Do unused credits roll over?', a: 'Credits from subscriptions expire at the end of each billing cycle. Credits purchased as packs never expire.' },
  { q: 'Can I cancel anytime?', a: 'Yes. Subscriptions are billed monthly and can be cancelled at any time. You keep your credits until the billing period ends.' },
  { q: 'How does revenue sharing work?', a: 'Creators earn 50% of credits spent on their apps, calculated at ₹0.30 per credit. Payouts ship soon.' },
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="font-display text-xl">Terminal AI</Link>
          <Link href="/sign-in" className="text-sm text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="font-display text-5xl">Simple pricing</h1>
          <p className="mt-3 text-muted-foreground">Subscribe for monthly credits or buy packs as you go.</p>
        </div>

        {/* Plan cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-[var(--radius-lg)] border p-6 ${
                plan.highlight
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card'
              }`}
            >
              <h2 className="font-display text-2xl">{plan.name}</h2>
              <div className="mt-3 mb-4">
                <span className="text-3xl font-semibold">{plan.price}</span>
                <span className="text-muted-foreground text-sm">{plan.period}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                {plan.credits.toLocaleString()} credits/month
              </p>
              <ul className="space-y-2 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="text-sm flex items-center gap-2">
                    <span className="text-primary">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={`block text-center py-2 text-sm font-medium rounded transition-colors ${
                  plan.highlight
                    ? 'bg-primary text-white hover:bg-[var(--primary-hover)]'
                    : 'border border-border hover:border-primary/50'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* Credit packs */}
        <div className="mb-16">
          <h2 className="text-lg font-semibold mb-4">Credit Packs</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {CREDIT_PACKS.map((pack) => (
              <div key={pack.name} className="relative border border-border rounded-[var(--radius-md)] p-4">
                {pack.badge && (
                  <span className="absolute -top-2.5 left-4 bg-primary text-white text-[11px] font-medium px-2 py-0.5 rounded">
                    {pack.badge}
                  </span>
                )}
                <p className="font-medium">{pack.name}</p>
                <p className="font-mono text-2xl mt-1">{pack.credits.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">credits</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-medium">{pack.price}</span>
                  <span className="text-xs text-muted-foreground">{pack.perCredit}/cr</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div>
          <h2 className="text-lg font-semibold mb-4">FAQ</h2>
          <div className="space-y-0 border border-border rounded-[var(--radius-md)] overflow-hidden">
            {FAQ.map((item, i) => (
              <details
                key={i}
                className="group border-b border-border last:border-0"
              >
                <summary className="px-4 py-3 text-sm font-medium cursor-pointer hover:bg-muted/50 transition-colors list-none flex items-center justify-between">
                  {item.q}
                  <span className="text-muted-foreground group-open:rotate-180 transition-transform">↓</span>
                </summary>
                <div className="px-4 pb-3 text-sm text-muted-foreground">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add platform/app/(marketplace)/pricing/
git commit -m "feat(P3): pricing page — 3 subscription plans, credit packs, FAQ"
```

---

### Task 9: No console.log audit + mobile verification

**Files:**
- All modified files in `platform/app/`

- [ ] **Step 1: Audit for console.log**

```bash
grep -r "console\.log" platform/app/ --include="*.tsx" --include="*.ts"
```

Expected: no results. If any found, replace with `logger.info(...)` or remove.

- [ ] **Step 2: Mobile viewport test**

```bash
cd platform && npm run dev
```

Open http://localhost:3000 in Chrome DevTools → toggle device toolbar → set to 375px width. Verify:
- Marketplace: sidebar hidden, single-column grid, search visible
- Auth pages: single column (left brand panel hidden), form centered
- Viewer: iframe fills screen, top bar sticks, credits visible

- [ ] **Step 3: Run all platform tests**

```bash
cd platform && npx vitest run
```

Expected: PASS.

- [ ] **Step 4: Final commit**

```bash
git add -p
git commit -m "chore(P3): no console.log, mobile viewport verified — UI redesign complete"
```
