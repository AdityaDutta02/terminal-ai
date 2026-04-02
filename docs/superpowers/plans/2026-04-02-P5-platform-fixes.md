# P5 — Platform Fixes & Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 404 routing issues, add social OAuth, build compliance pages, enhance search, add "coming soon" app status, improve admin stats, handle payment failures, and wire up transactional emails.

**Architecture:** Bug fixes first (route 404s), then features in dependency order. Social auth via better-auth socialProviders plugin. Email via Resend (transactional). Payment failure handling via Razorpay webhook expansion. Admin stats via new SQL aggregations.

**Tech Stack:** better-auth v1.2 (socialProviders), Resend SDK, Razorpay webhooks, Next.js App Router, PostgreSQL

---

### Task 1: Fix route 404s — redirects for legacy URLs + missing channel management

**Context:** Users hit `/auth/signup` (404, correct path is `/signup`), `/channels/invest-os/app-slug` (404, correct path is `/c/invest-os/app-slug`). Also the creator channel management page at `/creator/channels/[slug]` redirects to login but has no real management UI — it needs a proper channel detail page.

**Files:**
- Create: `platform/middleware.ts`

- [ ] **Step 1: Create Next.js middleware for legacy URL redirects**

```typescript
// platform/middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // /auth/* → strip /auth prefix (signup, login, etc. live under /(auth)/)
  if (pathname.startsWith('/auth/')) {
    const target = pathname.replace('/auth/', '/')
    return NextResponse.redirect(new URL(target, request.url), 301)
  }

  // /channels/slug/app → /c/slug/app
  if (pathname.startsWith('/channels/')) {
    const target = pathname.replace('/channels/', '/c/')
    return NextResponse.redirect(new URL(target, request.url), 301)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/auth/:path*', '/channels/:path*'],
}
```

- [ ] **Step 2: Commit**

```bash
git add platform/middleware.ts
git commit -m "fix(routing): redirect /auth/* and /channels/* to correct paths (P5)"
```

---

### Task 2: "Coming Soon" app status

**Context:** Creators want to publish an app listing before the app is deployed, to build hype. A new `coming_soon` status shows the app card with a "Coming Soon" badge. When the creator sets status to `live`, the badge disappears.

**Files:**
- Modify: `platform/app/api/creator/apps/[appId]/route.ts` — add `coming_soon` to status enum
- Modify: `platform/components/app-card.tsx` — render "Coming Soon" badge
- Modify: `platform/app/(marketplace)/page.tsx` — include `coming_soon` apps in marketplace listing
- Modify: `platform/app/(marketplace)/c/[channelSlug]/[appSlug]/page.tsx` — show coming soon state in app detail

- [ ] **Step 1: Update Zod schema in app PATCH route**

In `platform/app/api/creator/apps/[appId]/route.ts`, find the Zod schema for status and add `coming_soon`:

```typescript
// Change this:
status: z.enum(['live', 'draft']).optional(),
// To this:
status: z.enum(['live', 'draft', 'coming_soon']).optional(),
```

- [ ] **Step 2: Update admin app PATCH route**

In `platform/app/api/admin/apps/[appId]/route.ts`, update the status enum:

```typescript
// Change:
status: z.enum(['live', 'draft', 'suspended'])
// To:
status: z.enum(['live', 'draft', 'suspended', 'coming_soon'])
```

- [ ] **Step 3: Add "Coming Soon" badge to app card**

In `platform/components/app-card.tsx`, find the status badge rendering and add:

```typescript
{app.status === 'coming_soon' && (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 text-[11px] font-medium text-violet-600">
    Coming Soon
  </span>
)}
```

- [ ] **Step 4: Include coming_soon apps in marketplace query**

In `platform/app/(marketplace)/page.tsx`, find the SQL query that fetches apps and change:

```sql
-- Change: WHERE status = 'live'
-- To:     WHERE status IN ('live', 'coming_soon')
```

- [ ] **Step 5: Update app detail page for coming soon state**

In `platform/app/(marketplace)/c/[channelSlug]/[appSlug]/page.tsx`, change the SQL WHERE clause:

```sql
-- Change: AND a.status = 'live'
-- To:     AND a.status IN ('live', 'coming_soon')
```

And add a banner when the app is coming_soon:

```typescript
{app.status === 'coming_soon' && (
  <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 mb-6">
    <p className="text-sm font-medium text-violet-700">
      This app is coming soon. Stay tuned!
    </p>
  </div>
)}
```

- [ ] **Step 6: Update creator app settings form**

In `platform/app/creator/apps/[appId]/app-settings-form.tsx`, add `coming_soon` to the status options:

```typescript
// In the status toggle section, add a third button for "Coming Soon"
<button
  type="button"
  onClick={() => setStatus('coming_soon')}
  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
    status === 'coming_soon'
      ? 'bg-violet-100 text-violet-700 border border-violet-300'
      : 'text-slate-400 hover:text-slate-600'
  }`}
>
  Coming Soon
</button>
```

- [ ] **Step 7: Commit**

```bash
git add platform/app/api/creator/apps/[appId]/route.ts \
        platform/app/api/admin/apps/[appId]/route.ts \
        platform/components/app-card.tsx \
        platform/app/\(marketplace\)/page.tsx \
        platform/app/\(marketplace\)/c/[channelSlug]/[appSlug]/page.tsx \
        platform/app/creator/apps/[appId]/app-settings-form.tsx
git commit -m "feat(marketplace): coming_soon app status with badge (P5)"
```

---

### Task 3: Enhanced search — apps, channels, and settings

**Context:** The homepage search currently filters apps only. It should also search channels. The search input exists in `homepage-client.tsx` and filters via `useMemo`.

**Files:**
- Modify: `platform/app/(marketplace)/homepage-client.tsx`

- [ ] **Step 1: Add channel filtering to search**

In `platform/app/(marketplace)/homepage-client.tsx`, find the `filteredApps` useMemo and below it add:

```typescript
const filteredChannels = useMemo(() => {
  if (!searchQuery.trim()) return channels
  const q = searchQuery.toLowerCase()
  return channels.filter(
    (ch) =>
      ch.name.toLowerCase().includes(q) ||
      ch.slug.toLowerCase().includes(q),
  )
}, [channels, searchQuery])
```

Then replace `channels` references in the JSX with `filteredChannels` where the channel cards are rendered.

- [ ] **Step 2: Show "no results" for channels too**

After the channels section, add:

```typescript
{searchQuery.trim() && filteredChannels.length === 0 && filteredApps.length === 0 && (
  <div className="text-center py-12">
    <p className="text-slate-400 text-sm">No apps or channels matching &ldquo;{searchQuery}&rdquo;</p>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add platform/app/\(marketplace\)/homepage-client.tsx
git commit -m "feat(search): filter both apps and channels from search (P5)"
```

---

### Task 4: Terms of Service & Privacy Policy pages

**Context:** Required for Razorpay compliance and GDPR. Company is Studio Ionique (check studioionique.com for details). These are static legal pages.

**Files:**
- Create: `platform/app/(marketplace)/terms/page.tsx`
- Create: `platform/app/(marketplace)/privacy/page.tsx`
- Modify: `platform/components/footer.tsx` — add links

- [ ] **Step 1: Create Terms of Service page**

```typescript
// platform/app/(marketplace)/terms/page.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Terms of Service — Terminal AI' }

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold text-foreground mb-8">Terms of Service</h1>
      <p className="text-sm text-muted-foreground mb-4">Last updated: April 2, 2026</p>

      <div className="prose prose-slate max-w-none space-y-6 text-sm text-slate-600 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">1. Introduction</h2>
          <p>These Terms of Service (&ldquo;Terms&rdquo;) govern your use of Terminal AI (&ldquo;the Platform&rdquo;), operated by Studio Ionique (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;), a company registered in India. By accessing or using the Platform, you agree to be bound by these Terms.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">2. Account Registration</h2>
          <p>You must provide accurate information when creating an account. You are responsible for maintaining the security of your credentials. You must be at least 18 years old to use the Platform.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">3. Credits & Payments</h2>
          <p>Terminal AI uses a credit-based system. Credits are purchased via Razorpay payment gateway. All prices are listed in Indian Rupees (INR) and include applicable taxes.</p>
          <p>Credits are non-transferable between accounts. Unused credits do not expire unless your account is terminated.</p>
          <p>Subscriptions auto-renew monthly. You may cancel at any time — access continues until the end of the billing period. No partial refunds for unused subscription periods.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">4. Refund Policy</h2>
          <p>Credit pack purchases are non-refundable once credits have been used. For unused credit packs purchased within the last 7 days, you may request a refund by contacting <a href="mailto:support@studioionique.com" className="text-orange-600 hover:underline">support@studioionique.com</a>.</p>
          <p>Subscription refunds are handled on a case-by-case basis. Contact support for assistance.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">5. Acceptable Use</h2>
          <p>You agree not to: (a) use the Platform for illegal activities; (b) attempt to access other users&apos; accounts; (c) reverse-engineer or scrape the Platform; (d) upload malicious code or content; (e) abuse the AI services to generate harmful or illegal content.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">6. Creator Terms</h2>
          <p>If you publish apps on Terminal AI as a creator, you are responsible for the content and functionality of your apps. We reserve the right to suspend or remove apps that violate these Terms. Creator revenue share is subject to our current revenue share policy (currently 50%).</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">7. Intellectual Property</h2>
          <p>You retain ownership of content you create using the Platform. We retain ownership of the Terminal AI brand, interface, and technology. Apps published by creators remain the intellectual property of their respective creators.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">8. Limitation of Liability</h2>
          <p>Terminal AI is provided &ldquo;as is&rdquo; without warranties. We are not liable for any indirect, incidental, or consequential damages. Our total liability is limited to the amount paid by you in the 12 months preceding the claim.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">9. Termination</h2>
          <p>We may suspend or terminate your account for violation of these Terms. You may delete your account at any time. Upon termination, unused credits are forfeited.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">10. Governing Law</h2>
          <p>These Terms are governed by the laws of India. Any disputes shall be resolved in the courts of India.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">11. Contact</h2>
          <p>For questions about these Terms, contact us at <a href="mailto:support@studioionique.com" className="text-orange-600 hover:underline">support@studioionique.com</a>.</p>
          <p className="mt-2">Studio Ionique<br />India</p>
        </section>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create Privacy Policy page**

```typescript
// platform/app/(marketplace)/privacy/page.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Privacy Policy — Terminal AI' }

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold text-foreground mb-8">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-4">Last updated: April 2, 2026</p>

      <div className="prose prose-slate max-w-none space-y-6 text-sm text-slate-600 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">1. Data Controller</h2>
          <p>Terminal AI is operated by Studio Ionique (&ldquo;we&rdquo;, &ldquo;us&rdquo;). We are the data controller responsible for your personal data.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">2. Data We Collect</h2>
          <p><strong>Account data:</strong> Name, email address, hashed password (for email/password accounts), or profile information from social login providers (Google, GitHub, Apple).</p>
          <p><strong>Usage data:</strong> App sessions, credit transactions, API calls, timestamps, IP addresses.</p>
          <p><strong>Payment data:</strong> Payment method details are processed by Razorpay and never stored on our servers. We store transaction IDs and amounts for record-keeping.</p>
          <p><strong>Technical data:</strong> Browser type, operating system, device information collected via standard web technologies.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">3. How We Use Your Data</h2>
          <p>We use your data to: (a) provide and improve the Platform; (b) process payments and manage credits; (c) send transactional emails (verification, payment receipts); (d) prevent fraud and enforce our Terms; (e) analyze usage patterns to improve our services.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">4. Legal Basis (GDPR)</h2>
          <p>We process your data based on: (a) contract performance (providing the service you signed up for); (b) legitimate interests (security, fraud prevention, service improvement); (c) consent (where explicitly given, e.g., marketing emails).</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">5. Data Sharing</h2>
          <p>We share data only with: (a) Razorpay — for payment processing; (b) AI model providers (via OpenRouter) — conversation data is sent for processing but not stored by providers beyond their stated retention policies; (c) infrastructure providers — for hosting and email delivery.</p>
          <p>We do not sell your personal data to third parties.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">6. Data Retention</h2>
          <p>Account data is retained while your account is active. Usage logs are retained for 12 months. Payment records are retained for 7 years (legal requirement). You may request deletion of your account and associated data at any time.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">7. Your Rights</h2>
          <p>Under GDPR, you have the right to: (a) access your data; (b) rectify inaccurate data; (c) erase your data (&ldquo;right to be forgotten&rdquo;); (d) restrict processing; (e) data portability; (f) object to processing.</p>
          <p>To exercise any of these rights, contact <a href="mailto:support@studioionique.com" className="text-orange-600 hover:underline">support@studioionique.com</a>.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">8. Cookies</h2>
          <p>We use essential cookies for authentication and session management. No third-party tracking cookies are used.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">9. Security</h2>
          <p>We implement industry-standard security measures including encryption in transit (TLS), hashed passwords, rate limiting, and regular security audits. No system is 100% secure — we will notify affected users promptly in the event of a data breach.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">10. International Transfers</h2>
          <p>Your data may be processed on servers located outside your country of residence. We ensure appropriate safeguards are in place for any international data transfers.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-3">11. Contact</h2>
          <p>For privacy inquiries, contact our Data Protection contact at <a href="mailto:support@studioionique.com" className="text-orange-600 hover:underline">support@studioionique.com</a>.</p>
          <p className="mt-2">Studio Ionique<br />India</p>
        </section>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add terms/privacy links to footer**

In `platform/components/footer.tsx`, add to the footer links:

```typescript
<a href="/terms" className="text-sm text-slate-400 hover:text-slate-300 transition-colors">Terms of Service</a>
<a href="/privacy" className="text-sm text-slate-400 hover:text-slate-300 transition-colors">Privacy Policy</a>
```

- [ ] **Step 4: Add terms checkbox to signup page**

In `platform/app/(auth)/signup/page.tsx`, add before the submit button:

```typescript
<label className="flex items-start gap-2 text-[13px] text-slate-500">
  <input type="checkbox" required className="mt-0.5 accent-orange-500" />
  <span>I agree to the <a href="/terms" className="text-orange-600 hover:underline" target="_blank">Terms of Service</a> and <a href="/privacy" className="text-orange-600 hover:underline" target="_blank">Privacy Policy</a></span>
</label>
```

- [ ] **Step 5: Commit**

```bash
git add platform/app/\(marketplace\)/terms/page.tsx \
        platform/app/\(marketplace\)/privacy/page.tsx \
        platform/components/footer.tsx \
        platform/app/\(auth\)/signup/page.tsx
git commit -m "feat(compliance): terms of service + privacy policy pages (P5)"
```

---

### Task 5: Social OAuth — Google, GitHub, Apple

**Context:** better-auth v1.2 supports socialProviders config. Need to add Google, GitHub, and Apple login. The auth client also needs updating to expose social sign-in methods.

**Files:**
- Modify: `platform/lib/auth.ts` — add socialProviders config
- Modify: `platform/lib/auth-client.ts` — no change needed (better-auth client auto-detects)
- Modify: `platform/app/(auth)/login/page.tsx` — add social login buttons
- Modify: `platform/app/(auth)/signup/page.tsx` — add social login buttons

- [ ] **Step 1: Add social providers to auth config**

In `platform/lib/auth.ts`, add after the `emailAndPassword` config:

```typescript
import { betterAuth } from 'better-auth'

export const auth = betterAuth({
  // ... existing config ...
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    apple: {
      clientId: process.env.APPLE_CLIENT_ID!,
      clientSecret: process.env.APPLE_CLIENT_SECRET!,
    },
  },
  // ... rest of config ...
})
```

- [ ] **Step 2: Create shared social buttons component**

Create `platform/components/social-auth-buttons.tsx`:

```typescript
'use client'

import { authClient } from '@/lib/auth-client'

export function SocialAuthButtons() {
  const handleSocial = (provider: 'google' | 'github' | 'apple') => {
    authClient.signIn.social({ provider, callbackURL: '/' })
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => handleSocial('google')}
        className="w-full h-[44px] flex items-center justify-center gap-3 rounded-xl border border-slate-200 text-[14px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
        Continue with Google
      </button>
      <button
        type="button"
        onClick={() => handleSocial('github')}
        className="w-full h-[44px] flex items-center justify-center gap-3 rounded-xl border border-slate-200 text-[14px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>
        Continue with GitHub
      </button>
      <button
        type="button"
        onClick={() => handleSocial('apple')}
        className="w-full h-[44px] flex items-center justify-center gap-3 rounded-xl border border-slate-200 text-[14px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
        Continue with Apple
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Add social buttons to login page**

In `platform/app/(auth)/login/page.tsx`, add after the form:

```typescript
import { SocialAuthButtons } from '@/components/social-auth-buttons'

// In the JSX, after the form and before any footer links:
<div className="relative my-6">
  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
  <div className="relative flex justify-center text-sm"><span className="bg-white px-4 text-slate-400">or</span></div>
</div>
<SocialAuthButtons />
```

- [ ] **Step 4: Add social buttons to signup page**

Same pattern in `platform/app/(auth)/signup/page.tsx`.

- [ ] **Step 5: Commit**

```bash
git add platform/lib/auth.ts \
        platform/components/social-auth-buttons.tsx \
        platform/app/\(auth\)/login/page.tsx \
        platform/app/\(auth\)/signup/page.tsx
git commit -m "feat(auth): Google, GitHub, Apple social login (P5)"
```

**Note for deploy:** The following env vars must be set before social login works:
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — from Google Cloud Console
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` — from GitHub OAuth App settings
- `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET` — from Apple Developer account

---

### Task 6: Email system — Resend for transactional emails

**Context:** better-auth needs an email sending function for OTP/verification. Currently no email provider is configured — verification emails silently fail. Also need payment confirmation emails.

**Files:**
- Create: `platform/lib/email.ts`
- Modify: `platform/lib/auth.ts` — wire sendVerificationEmail
- Modify: `platform/app/api/webhooks/razorpay/route.ts` — send payment confirmation email

- [ ] **Step 1: Install Resend**

```bash
cd platform && npm install resend
```

- [ ] **Step 2: Create email helper**

```typescript
// platform/lib/email.ts
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'Terminal AI <noreply@terminalai.app>'

export async function sendVerificationEmail(email: string, url: string): Promise<void> {
  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'Verify your Terminal AI account',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0F172A;">Verify your email</h2>
        <p style="color: #64748B;">Click the button below to verify your Terminal AI account.</p>
        <a href="${url}" style="display: inline-block; background: #FF6B00; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">Verify Email</a>
        <p style="color: #94A3B8; font-size: 13px;">If you didn't create an account, ignore this email.</p>
      </div>
    `,
  })
}

export async function sendPasswordResetEmail(email: string, url: string): Promise<void> {
  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'Reset your Terminal AI password',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0F172A;">Reset your password</h2>
        <p style="color: #64748B;">Click the button below to reset your password.</p>
        <a href="${url}" style="display: inline-block; background: #FF6B00; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">Reset Password</a>
        <p style="color: #94A3B8; font-size: 13px;">If you didn't request this, ignore this email.</p>
      </div>
    `,
  })
}

export async function sendPaymentConfirmationEmail(
  email: string,
  amount: string,
  credits: number,
  type: 'credit_pack' | 'subscription',
): Promise<void> {
  const subject = type === 'subscription'
    ? 'Subscription activated — Terminal AI'
    : 'Payment confirmed — Terminal AI'

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0F172A;">Payment Confirmed</h2>
        <p style="color: #64748B;">Your payment of ₹${amount} has been processed successfully.</p>
        <p style="color: #64748B;"><strong>${credits} credits</strong> have been added to your account.</p>
        <a href="https://terminalai.app/account" style="display: inline-block; background: #FF6B00; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">View Account</a>
        <p style="color: #94A3B8; font-size: 13px;">Terminal AI by Studio Ionique</p>
      </div>
    `,
  })
}

export async function sendPaymentFailedEmail(email: string): Promise<void> {
  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'Payment failed — Terminal AI',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0F172A;">Payment Failed</h2>
        <p style="color: #64748B;">Your recent payment could not be processed. Please update your payment method or try again.</p>
        <a href="https://terminalai.app/pricing" style="display: inline-block; background: #FF6B00; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">Update Payment</a>
        <p style="color: #94A3B8; font-size: 13px;">If you need assistance, contact <a href="mailto:support@studioionique.com">support@studioionique.com</a></p>
      </div>
    `,
  })
}
```

- [ ] **Step 3: Wire email into better-auth**

In `platform/lib/auth.ts`, add the email sending functions:

```typescript
import { sendVerificationEmail, sendPasswordResetEmail } from './email'

export const auth = betterAuth({
  // ... existing config ...
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user.email, url)
    },
    afterEmailVerification: async (user) => {
      // ... existing welcome credits logic ...
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, url)
    },
  },
  // ... rest ...
})
```

- [ ] **Step 4: Add payment.failed webhook handler**

In `platform/app/api/webhooks/razorpay/route.ts`, add to the switch statement:

```typescript
case 'payment.failed': {
  await handlePaymentFailed(event.payload)
  break
}
```

And add the handler:

```typescript
async function handlePaymentFailed(payload: any): Promise<void> {
  const payment = payload.payment?.entity
  if (!payment) return

  // Try to find the user from the order
  const result = await db.query<{ user_id: string; email: string }>(
    `SELECT cpp.user_id, u.email
     FROM subscriptions.credit_pack_purchases cpp
     JOIN "user" u ON u.id = cpp.user_id
     WHERE cpp.razorpay_order_id = $1`,
    [payment.order_id],
  )

  if (result.rows[0]) {
    const { sendPaymentFailedEmail } = await import('@/lib/email')
    await sendPaymentFailedEmail(result.rows[0].email)
  }

  logger.warn({ msg: 'payment_failed', orderId: payment.order_id, reason: payment.error_description })
}
```

- [ ] **Step 5: Add payment confirmation email to successful payment handler**

In `handlePaymentCaptured`, after crediting, send confirmation email:

```typescript
// After grantCredits, fetch user email and send confirmation
const userResult = await client.query<{ email: string }>(
  `SELECT email FROM "user" WHERE id = $1`, [user_id]
)
if (userResult.rows[0]) {
  const { sendPaymentConfirmationEmail } = await import('@/lib/email')
  const pack = CREDIT_PACKS[pack_id as CreditPackId]
  await sendPaymentConfirmationEmail(
    userResult.rows[0].email,
    (pack.priceInr).toString(),
    credits,
    'credit_pack',
  ).catch((err) => logger.error({ msg: 'payment_email_failed', err: String(err) }))
}
```

- [ ] **Step 6: Commit**

```bash
git add platform/lib/email.ts \
        platform/lib/auth.ts \
        platform/app/api/webhooks/razorpay/route.ts \
        platform/package.json platform/package-lock.json
git commit -m "feat(email): Resend transactional emails — verification, payment, failure (P5)"
```

**Note for deploy:** Set `RESEND_API_KEY` and `FROM_EMAIL` env vars. Domain must be verified in Resend dashboard for `terminalai.app`.

---

### Task 7: Enhanced admin stats — paying users, tier breakdown, revenue, API costs, per-app usage

**Context:** Current admin dashboard shows basic counts. The admin wants: total paying users, subscription tier breakdown, total revenue, API costs, per-app usage breakdown.

**Files:**
- Modify: `platform/app/admin/page.tsx`
- Modify: `platform/app/api/admin/stats/route.ts` (if exists, otherwise the admin page queries directly)

- [ ] **Step 1: Enhance admin stats SQL**

In `platform/app/admin/page.tsx`, replace the `getStats` function:

```typescript
type Stats = {
  [key: string]: unknown
  total_users: string
  total_channels: string
  total_apps: string
  total_sessions: string
  total_credits_granted: string
  sessions_today: string
  paying_users: string
  total_revenue_inr: string
}

type TierBreakdown = {
  [key: string]: unknown
  plan_id: string
  count: string
}

type AppUsage = {
  [key: string]: unknown
  app_name: string
  channel_name: string
  sessions_30d: string
  credits_used_30d: string
}

async function getStats(): Promise<Stats> {
  const result = await db.query<Stats>(
    `SELECT
       (SELECT COUNT(*) FROM "user") AS total_users,
       (SELECT COUNT(*) FROM marketplace.channels WHERE deleted_at IS NULL) AS total_channels,
       (SELECT COUNT(*) FROM marketplace.apps WHERE deleted_at IS NULL) AS total_apps,
       (SELECT COUNT(*) FROM gateway.api_calls) AS total_sessions,
       (SELECT COALESCE(SUM(delta), 0) FROM subscriptions.credit_ledger WHERE delta > 0) AS total_credits_granted,
       (SELECT COUNT(*) FROM gateway.api_calls WHERE created_at >= CURRENT_DATE) AS sessions_today,
       (SELECT COUNT(DISTINCT user_id) FROM subscriptions.user_subscriptions WHERE status = 'active') AS paying_users,
       (SELECT COALESCE(SUM(amount_paise), 0) / 100 FROM subscriptions.credit_pack_purchases WHERE status = 'completed') AS total_revenue_inr`,
  )
  return result.rows[0]
}

async function getTierBreakdown(): Promise<TierBreakdown[]> {
  const result = await db.query<TierBreakdown>(
    `SELECT plan_id, COUNT(*) AS count
     FROM subscriptions.user_subscriptions
     WHERE status = 'active'
     GROUP BY plan_id
     ORDER BY count DESC`,
  )
  return result.rows
}

async function getTopApps(): Promise<AppUsage[]> {
  const result = await db.query<AppUsage>(
    `SELECT a.name AS app_name, c.name AS channel_name,
            COUNT(ac.id) AS sessions_30d,
            COALESCE(SUM(ac.credits_charged), 0) AS credits_used_30d
     FROM marketplace.apps a
     JOIN marketplace.channels c ON c.id = a.channel_id
     LEFT JOIN gateway.api_calls ac ON ac.app_id = a.id AND ac.created_at >= NOW() - INTERVAL '30 days'
     WHERE a.deleted_at IS NULL
     GROUP BY a.id, a.name, c.name
     ORDER BY sessions_30d DESC
     LIMIT 20`,
  )
  return result.rows
}
```

- [ ] **Step 2: Add paying users, revenue, tier breakdown, and per-app table to admin UI**

Update the admin page JSX to show:
- Paying Users stat card
- Total Revenue (INR) stat card
- Subscription Tier Breakdown table
- Top Apps by Usage table (30d sessions + credits)

```typescript
// New stat cards to add alongside existing ones:
{ label: 'Paying Users', value: stats.paying_users, icon: TrendingUp, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
{ label: 'Revenue (INR)', value: '₹' + Number(stats.total_revenue_inr).toLocaleString(), icon: Sparkles, iconBg: 'bg-amber-50', iconColor: 'text-amber-600' },

// Tier breakdown section:
<h2>Subscription Breakdown</h2>
<table>
  <thead><tr><th>Plan</th><th>Active Subscribers</th></tr></thead>
  <tbody>
    {tiers.map(t => <tr key={t.plan_id}><td>{t.plan_id}</td><td>{t.count}</td></tr>)}
  </tbody>
</table>

// Per-app usage section:
<h2>Top Apps (30 days)</h2>
<table>
  <thead><tr><th>App</th><th>Channel</th><th>Sessions</th><th>Credits Used</th></tr></thead>
  <tbody>
    {topApps.map(a => <tr key={a.app_name}><td>{a.app_name}</td><td>{a.channel_name}</td><td>{a.sessions_30d}</td><td>{a.credits_used_30d}</td></tr>)}
  </tbody>
</table>
```

- [ ] **Step 3: Commit**

```bash
git add platform/app/admin/page.tsx
git commit -m "feat(admin): paying users, revenue, tier breakdown, per-app usage stats (P5)"
```

---

### Task 8: Deploy & verify

- [ ] **Step 1: Push all changes**

```bash
git push origin main
```

- [ ] **Step 2: SSH to VPS and deploy**

```bash
ssh root@178.104.124.224
cd /root/terminal-ai && git pull origin main
docker compose build --no-cache platform
docker compose up -d --no-deps platform
```

- [ ] **Step 3: Set new env vars on VPS**

```bash
# Add to platform container env:
RESEND_API_KEY=re_xxxx
FROM_EMAIL=Terminal AI <noreply@terminalai.app>
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
APPLE_CLIENT_ID=xxx
APPLE_CLIENT_SECRET=xxx
```

- [ ] **Step 4: Verify routes**

```bash
curl -s -o /dev/null -w '%{http_code}' https://terminalai.app/auth/signup  # Should 301 → /signup
curl -s -o /dev/null -w '%{http_code}' https://terminalai.app/channels/invest-os  # Should 301 → /c/invest-os
curl -s -o /dev/null -w '%{http_code}' https://terminalai.app/terms  # Should 200
curl -s -o /dev/null -w '%{http_code}' https://terminalai.app/privacy  # Should 200
curl -s -o /dev/null -w '%{http_code}' https://terminalai.app/status  # Should 200
```
