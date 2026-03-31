# P3 — Full UI/UX Redesign Spec
**Date:** 2026-03-31
**Target:** Production-quality UI that passes the "AI slop test" across all 8 surfaces

---

## Design Philosophy

**Precision Tool aesthetic** — the platform is a developer tool for building and distributing AI applications. The design should feel like a well-engineered instrument: structured, confident, and purposeful. No candy gradients, no rounded AI cards, no purple-on-dark tech startup clichés.

**Surfaces:**
- Marketplace + Auth: **light theme** — accessible, trustworthy, fast
- Viewer: **dark theme** — focus mode, terminal aesthetic
- Creator/Admin dashboards: **dark theme** — data-dense, professional

**Before implementing any page**, run `teach-impeccable` to create `.impeccable.md` with full design context. Then invoke `frontend-design` skill per page.

---

## Design System (establish first, before any page work)

### Typography

**Display / Headlines**: [Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif) — editorial weight, distinctive
**UI / Body**: [DM Sans](https://fonts.google.com/specimen/DM+Sans) — clean, geometric, not Inter
**Mono**: [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) — code, IDs, metrics

Load via `next/font/google` with display: 'swap'.

### Color Palette

```css
/* Light surfaces (marketplace, auth) */
:root {
  --background: oklch(0.99 0.002 250);
  --foreground: oklch(0.14 0.02 250);
  --primary: oklch(0.40 0.14 250);          /* deep indigo — not violet */
  --primary-hover: oklch(0.35 0.14 250);
  --accent: oklch(0.65 0.14 140);           /* sage green accent */
  --muted: oklch(0.96 0.005 250);
  --muted-foreground: oklch(0.46 0.02 250);
  --border: oklch(0.88 0.006 250);
  --card: oklch(1.00 0 0);
  --card-foreground: oklch(0.14 0.02 250);
  --destructive: oklch(0.52 0.20 15);
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
}

/* Dark surfaces (viewer, dashboards) */
.dark {
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
}
```

### Spacing Scale

Use fluid spacing with `clamp()`:
- `--space-xs: clamp(4px, 0.5vw, 6px)`
- `--space-sm: clamp(8px, 1vw, 12px)`
- `--space-md: clamp(12px, 1.5vw, 20px)`
- `--space-lg: clamp(20px, 2.5vw, 32px)`
- `--space-xl: clamp(32px, 4vw, 56px)`
- `--space-2xl: clamp(56px, 7vw, 96px)`

---

## Pages

### Page 1: Marketplace (`platform/app/(marketplace)/page.tsx`)

**Light theme. Precision tool.**

#### Layout
- Full-width header: logo (left) + search (center) + auth CTAs (right)
- No hero banner — start with content immediately
- Two-column layout: left sidebar (filters) + main grid (apps)

#### App Cards
- Minimal: app name (large, DM Sans semibold) + channel name (small, muted) + short description (2 lines max)
- No card icons. No gradient backgrounds.
- Bottom row: model tier badge (standard/advanced/premium) + credit cost + usage count
- Hover: subtle border color shift, no shadow jump

#### Sidebar Filters
- Category pills (not dropdown)
- Model tier filter
- "Free apps" toggle
- Collapse on mobile

#### Typography Hierarchy
- App name: 16px DM Sans 600
- Channel: 12px DM Sans 400 muted
- Description: 14px DM Sans 400
- Meta (tier, credits): 11px DM Sans 500 uppercase tracking-wide

#### What to avoid
- No gradient card backgrounds
- No icon + heading + text repeated card template
- No "Featured" section with bigger cards
- No rainbow category icons

---

### Page 2: Viewer (`platform/app/viewer/[channelSlug]/[appSlug]/`)

**Dark theme. Terminal focus mode.**

#### Layout
- Near-fullscreen iframe with minimal chrome
- Top bar (40px): app name (left) + credits remaining (right) + close/back icon
- No sidebar. No navigation.

#### States
- **Loading**: skeleton pulse (2 horizontal bars, simulating content)
- **Deploying**: progress bar with step text ("Building your app…" → "Almost ready…")
- **Error**: centered card with clear message and action
- **Active**: iframe, 100% height minus top bar

#### Top Bar
- App name: 14px JetBrains Mono (monospace for terminal aesthetic)
- Credits: `{n} cr` in muted text, updates after session starts
- Token expiry warning: toasts at 2 min remaining

#### Mobile
- Same layout, iframe scrollable
- Top bar sticks

---

### Page 3: Auth — Sign In (`platform/app/(auth)/sign-in/page.tsx`)

**Light theme. Minimal, trustworthy.**

#### Layout
- Two columns: left (brand) + right (form)
- Left: platform name (Instrument Serif, large) + one-line tagline
- Right: email/password form, social buttons, "Sign up" link
- No background images, no gradient blobs

#### Form
- Clean inputs, DM Sans
- Error states: red border + inline message (no toasts for form errors)
- "Continue with Google" as primary social option

---

### Page 4: Auth — Sign Up

Same layout as sign-in. Post-submit shows email verification screen:
- Large checkmark icon (not emoji)
- "Check your inbox" heading
- "We sent a verification link to {email}. Verify to receive 20 free credits."
- Resend link (rate-limited)

---

### Page 5: User Dashboard (`platform/app/dashboard/page.tsx`)

**Dark theme. Data-first.**

#### Layout
- Left sidebar: nav (Dashboard, Sessions, Settings)
- Main: top stats row + content

#### Top Stats Row (3 items, no cards, inline with separators)
- Balance: `{n} credits` (large number, JetBrains Mono) + INR equivalent in muted
- Subscription: plan name + renewal date (or "No active plan")
- Usage: sessions this month

#### Sessions Table
- Recent 10 sessions
- Columns: App | Channel | Date | Credits used | Status
- No decorative icons

#### Sidebar
- Avatar + name (top)
- Nav items: Dashboard | Sessions | Settings
- Bottom: "Upgrade plan" CTA (if on free tier)

---

### Page 6: Creator Dashboard (`platform/app/creator/page.tsx`)

**Dark theme. High-density analytics.**

#### Layout
- Left sidebar: nav
- Main: metrics + app list

#### Metrics Bar (horizontal, not cards)
- Sessions this month | Credits earned | Estimated INR | Active apps

#### App List
- Table: App name | Status | Sessions (30d) | Credits earned | Model tier | Actions
- Inline status toggle (live/draft)
- No card grid — table is the right component for this data

#### Revenue Section
- Monthly earnings chart: bar chart, last 6 months
- Credits → INR at ₹0.30 per credit
- "Payout system coming soon" placeholder

---

### Page 7: Creator App Settings (`platform/app/creator/apps/[appId]/page.tsx`)

**Dark theme. Settings-first.**

#### Layout
- Left sidebar (app-specific): Overview | Deployments | Settings | Analytics
- Main: settings form

#### Settings
- Name + description (editable inline, not in modal)
- Status toggle: live / draft
- Model tier selector: dropdown with credit cost per session shown
- Free app toggle: with warning "Credits charged to your balance"
- Danger zone: Delete app (requires typing app name)

#### Analytics Tab
- Daily sessions chart
- Top referrers (if trackable)
- Unique users

---

### Page 8: Pricing Page (`platform/app/(marketplace)/pricing/page.tsx`)

**Light theme. Conversion-focused.**

#### Layout
- Single column, centered
- No comparison table (three plans is the comparison)

#### Plan Cards (3)
- Plan name (Instrument Serif)
- Price (large, DM Sans)
- Credits per month
- Feature list (5 items max, no inflated bullet points)
- CTA button

#### Credit Packs Section (below plans)
- Three pack options in a row
- Name | Credits | Price | ₹/credit value
- "Best value" badge on middle pack

#### FAQ (below packs)
- 4-5 questions max
- Accordion style

---

## Responsive Design

All pages must work on:
- Desktop (1280px+): full layout
- Tablet (768–1279px): sidebar collapses or hidden
- Mobile (<768px): single column, stacked navigation

Use `@container` queries for component-level responsiveness.

---

## Motion

Apply `frontend-design` skill motion guidelines:
- Page transitions: 200ms ease-out opacity
- Data reveals: staggered 60ms per row (table rows)
- State changes: 150ms ease-out
- No bounce, no elastic
- `prefers-reduced-motion`: disable all transitions

---

## Implementation Order

1. Design system (`globals.css`, typography setup, color tokens) — unlocks all pages
2. Marketplace — highest traffic, first impression
3. Auth pages — required for conversion
4. Viewer — critical path for user value
5. User Dashboard
6. Creator Dashboard
7. Creator App Settings
8. Pricing page

---

## Acceptance Criteria

- [ ] All 8 pages pass "AI slop test" — no gradient cards, no purple-on-dark, no rounded icon + heading template
- [ ] Marketplace: app cards are minimal and information-dense, no decorative backgrounds
- [ ] Viewer: dark, focused, no distracting chrome
- [ ] Auth: email verification screen exists with "20 free credits" copy
- [ ] Dashboard: consistent dark theme, balance prominently shown
- [ ] Creator dashboard: earnings in both credits and INR
- [ ] Pricing: 3 subscription plans + 3 credit packs visible
- [ ] Mobile: all pages usable on 375px viewport
- [ ] Typography: Instrument Serif for display, DM Sans for UI, JetBrains Mono for code/data
- [ ] No `console.log` in any component
- [ ] All interactive states (hover, focus, active, disabled) implemented
