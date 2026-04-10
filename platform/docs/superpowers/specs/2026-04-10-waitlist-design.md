# Waitlist System — Design Spec

> **For agentic workers:** After reading this spec, invoke `superpowers:writing-plans` to generate the implementation plan.

**Goal:** Gate all of Terminal AI behind a waitlist page until superadmin launches the platform, with a secret bypass link for internal testers.

**Architecture:** Next.js middleware checks a DB config flag and redirects all traffic to `/waitlist` unless the platform is live or the request carries a beta bypass cookie. When the superadmin launches, a single API call flips the flag, emails all waitlisted addresses, and grants credits to existing accounts.

**Tech Stack:** Next.js 15 App Router, PostgreSQL (`platform` schema), Resend (email), better-auth, Tailwind CSS, shadcn/ui, Instrument Serif + DM Sans fonts.

---

## 1. Routing & Middleware

**File:** `platform/middleware.ts` (new)

Decision tree for every incoming request:

1. Path is `/waitlist`, `/api/waitlist/*`, `/_next/*`, `/favicon.png` → pass through always
2. Cookie `beta_access=1` is present → pass through
3. Query param `?access=beta` is present → set cookie `beta_access=1` (httpOnly, sameSite=lax, secure, max-age=7d), redirect to same path without the query param
4. `platform.config` row `waitlist_mode = 'false'` → pass through
5. Otherwise → redirect to `/waitlist`

**Cache:** Module-level variable caches the `waitlist_mode` DB read with a 30-second TTL. Zero DB overhead on 99% of requests; at most 30s lag after the admin flips the switch.

**Matcher:** All routes except `_next/static`, `_next/image`, `favicon.png`.

---

## 2. Database Schema

Migrations run against the existing `platform` schema.

```sql
-- Platform-wide config flag
CREATE TABLE IF NOT EXISTS platform.config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO platform.config (key, value)
  VALUES ('waitlist_mode', 'true')
  ON CONFLICT DO NOTHING;

-- Waitlist email store
CREATE TABLE IF NOT EXISTS platform.waitlist (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        UNIQUE NOT NULL,
  name        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_at TIMESTAMPTZ            -- set when launch email is sent
);
CREATE INDEX IF NOT EXISTS waitlist_email_idx ON platform.waitlist (email);
CREATE INDEX IF NOT EXISTS waitlist_unnotified_idx
  ON platform.waitlist (notified_at) WHERE notified_at IS NULL;
```

---

## 3. Waitlist Page (`/waitlist`)

**File:** `platform/app/waitlist/page.tsx` (new, client component for form interaction)

### 3a. Hero Section

Fullscreen looping video background — no overlay, video provides all visual depth.

```
Video: https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4
position: absolute inset-0 w-full h-full object-cover z-0
autoPlay loop muted playsInline
```

**Liquid glass CSS** (added to `globals.css`):

```css
.liquid-glass {
  background: rgba(255, 255, 255, 0.01);
  background-blend-mode: luminosity;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border: none;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1);
  position: relative;
  overflow: hidden;
}
.liquid-glass::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1.4px;
  background: linear-gradient(180deg,
    rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.15) 20%,
    rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%,
    rgba(255,255,255,0.15) 80%, rgba(255,255,255,0.45) 100%);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}
```

**Fade-rise animations** (added to `globals.css`):

```css
@keyframes fade-rise {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-fade-rise         { animation: fade-rise 0.8s ease-out both; }
.animate-fade-rise-delay   { animation: fade-rise 0.8s ease-out 0.2s both; }
.animate-fade-rise-delay-2 { animation: fade-rise 0.8s ease-out 0.4s both; }
```

**Nav** (liquid-glass, z-10, max-w-7xl mx-auto px-8 py-6 flex justify-between):
- Logo: "Terminal AI" — Instrument Serif text-3xl tracking-tight text-white
- Links (md:flex hidden): Apps, Creators, About — text-sm text-white/60 hover:text-white transition-colors
- CTA: "Sign in →" — liquid-glass rounded-full px-6 py-2.5 text-sm text-white hover:scale-[1.03]

**Hero body** (relative z-10, flex col centered, text-center, px-6 pt-32 pb-40):
- Eyebrow: `PRIVATE BETA` — `text-[#FF6B00] text-sm tracking-widest uppercase mb-6`
- H1 (Instrument Serif, text-5xl sm:text-7xl md:text-8xl, leading-[0.95], tracking-[-2.46px], text-white, animate-fade-rise):
  ```
  "AI-powered apps,
   built for <em class="not-italic text-white/50">everyone.</em>"
  ```
- Subtext (DM Sans, text-white/60, text-base sm:text-lg, max-w-2xl, mt-8, leading-relaxed, animate-fade-rise-delay):
  `"Creator-built AI apps that actually work. Join the waitlist and be first in."`
- Email capture form (animate-fade-rise-delay-2, mt-12, flex gap-3 justify-center, flex-wrap on mobile):
  - Input: liquid-glass rounded-full px-6 py-3.5 text-white placeholder-white/40 text-sm w-72 outline-none
  - Button: `bg-[#FF6B00] text-white rounded-full px-8 py-3.5 font-semibold text-sm hover:scale-[1.03] hover:bg-orange-500 transition-all`
- Social proof: `"237 people already waiting"` — text-white/40 text-sm mt-4

### 3b. Features Section

Background: white. Max-w-5xl mx-auto px-6 py-24.

Header (centered):
```
"Claude-level AI.
 Without the Claude price."
```
Instrument Serif, text-4xl, #0F172A, mb-16.

3-column grid (gap-6, sm:grid-cols-3):

| Card | Title | Body |
|------|-------|------|
| 1 | Built by Creators | Apps made for real workflows, not demos. |
| 2 | For Every Use Case | Finance, productivity, dev tools, and more. If you need it, it's here. |
| 3 | Just Works | Open. Ask. Done. No setup. No prompt engineering needed. |

Card style: `bg-white border border-[#F1F5F9] rounded-2xl p-6 shadow-sm`
Icon: `bg-orange-50 text-[#FF6B00] rounded-xl p-3 w-fit mb-4` (Lucide icons: Sparkles, Layers, Zap)

### 3c. Pricing Section

Background: `#0F172A`. Max-w-5xl mx-auto px-6 py-24, text-center.

Header:
- `"Simple pricing."` — Instrument Serif text-4xl text-white
- `"Start with ₹99 per month."` — DM Sans text-lg text-white/60 mt-3

Single pricing card (max-w-sm mx-auto mt-12):
```
bg-white/5 border border-white/10 rounded-2xl p-8 text-left
```
- Badge: `STARTER` — orange text-xs tracking-widest uppercase
- Price: `₹99` — Instrument Serif text-5xl text-white + `/month` text-white/50 text-lg
- Feature list (mt-6 space-y-3):
  - ✓ 350 AI credits/month
  - ✓ Access to all creator apps
  - ✓ Email support
- CTA: `[Join the waitlist]` — full-width bg-[#FF6B00] text-white rounded-xl py-3 font-semibold mt-8 hover:bg-orange-500

Footer: `"Terminal AI by Studio Ionique"` — text-white/30 text-sm mt-16 text-center pb-12

---

## 4. Waitlist API

### `POST /api/waitlist/join`

**File:** `platform/app/api/waitlist/join/route.ts` (new)

Request body: `{ email: string, name?: string }`

Logic:
1. Validate email format with Zod
2. `INSERT INTO platform.waitlist (email, name) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING`
3. If new row inserted → call `sendWaitlistConfirmationEmail(email)`
4. Return `{ joined: true }` (whether new or duplicate — no enumeration)

Rate limit: 5 requests per IP per hour. Implement with a module-level `Map<string, { count: number; resetAt: number }>` keyed on IP. If `count >= 5` and `Date.now() < resetAt`, return 429. Reset on first request after `resetAt`.

### `GET /api/waitlist/count` (public)

Returns `{ count: number }` — used for the social proof line on the hero.

---

## 5. Admin Panel Extensions

### 5a. Platform Status Card on `/admin`

**File:** `platform/app/admin/page.tsx` (modify)

New card at the top of the overview, above existing stats:

```
[Platform Status]
  Status badge: "WAITLIST MODE" (amber) | "LIVE" (green)
  Waitlist count: "412 signups"
  [Launch Platform →] button — visible only when waitlist_mode = true
```

Clicking "Launch Platform →" opens a confirmation dialog (shadcn AlertDialog):
```
"This will:
 • Email all 412 waitlisted addresses
 • Grant 10 credits to users already signed up
 • Take the platform live immediately

 This cannot be undone."

[Cancel]  [Yes, Launch Now]
```

### 5b. Waitlist Admin Tab

New route `/admin/waitlist` — table of all signups:
- Columns: Email, Name, Joined, Has Account, Notified
- Sort by joined date desc
- No delete/edit actions needed

### 5c. Launch API

**File:** `platform/app/api/admin/launch/route.ts` (new)

`POST /api/admin/launch` — superadmin only (check `user.role = 'admin'`).

Steps (in order, wrapped in try/catch with structured logging):
1. `UPDATE platform.config SET value = 'false' WHERE key = 'waitlist_mode'`
2. Query all `platform.waitlist` emails joined against `public."user"` to find matched accounts
3. For each matched account: `grantCredits(userId, 10, 'waitlist_launch')`
4. Fetch all waitlist emails → send `sendWaitlistLaunchEmail(email, hasAccount)` in batches of 50
5. `UPDATE platform.waitlist SET notified_at = NOW() WHERE notified_at IS NULL`
6. Return `{ launched: true, emailsSent: number, creditsGranted: number }`

---

## 6. Email Functions

**File:** `platform/lib/email.ts` (extend existing)

### `sendWaitlistConfirmationEmail(email: string)`

Subject: `"You're on the list — Terminal AI"`

HTML (Terminal AI style — white bg, orange CTA, Instrument Serif heading):
```
"You're in the queue."
"We'll let you know the moment Terminal AI launches.
 In the meantime, tell a friend."
[terminalai.studioionique.com] — orange button (disabled until live)
"Terminal AI by Studio Ionique"
```

### `sendWaitlistLaunchEmail(email: string, hasAccount: boolean)`

Subject: `"Terminal AI is live — you're in"`

HTML:
```
"The wait is over."
"Terminal AI is live. Here's what happens next:"

[hasAccount]:
  "10 credits have been added to your account. Start exploring."
  CTA: [Open Terminal AI →]

[!hasAccount]:
  "Sign up now to claim your 10 free credits."
  CTA: [Create Your Account →]

"Terminal AI by Studio Ionique"
```

---

## 7. Credit Grant on Signup (existing `auth.ts` extension)

In `afterEmailVerification` hook, after `maybeGrantWelcomeCredits`:

```typescript
// Grant waitlist launch credits if this email was notified
const waitlistRow = await db.query(
  `SELECT 1 FROM platform.waitlist
   WHERE email = $1 AND notified_at IS NOT NULL LIMIT 1`,
  [user.email],
)
if (waitlistRow.rows.length > 0) {
  const alreadyGranted = await db.query(
    `SELECT 1 FROM subscriptions.credit_ledger
     WHERE user_id = $1 AND reason = 'waitlist_launch' LIMIT 1`,
    [user.id],
  )
  if (alreadyGranted.rows.length === 0) {
    await grantCredits(user.id, 10, 'waitlist_launch')
  }
}
```

---

## 8. Files Created / Modified

| Action | Path |
|--------|------|
| Create | `platform/middleware.ts` |
| Create | `platform/app/waitlist/page.tsx` |
| Create | `platform/app/api/waitlist/join/route.ts` |
| Create | `platform/app/api/waitlist/count/route.ts` |
| Create | `platform/app/api/admin/launch/route.ts` |
| Create | `platform/app/admin/waitlist/page.tsx` |
| Modify | `platform/app/admin/page.tsx` |
| Modify | `platform/lib/email.ts` |
| Modify | `platform/lib/auth.ts` |
| Modify | `platform/app/globals.css` |
| Modify | `infra/postgres/seed.sql` (add migration) |
