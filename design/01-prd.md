# Terminal AI — Product Requirements Document

**Version:** 1.0
**Date:** 2026-03-27
**Status:** Approved for implementation

---

## 1. Product Vision

Terminal AI is a subscription-based marketplace where creators publish AI-powered micro-apps and users access them through channel or per-app subscriptions. All AI API calls are routed through the platform's managed gateway, enabling credit tracking, cost control, and quality optimisation per app.

---

## 2. Target Personas

### User
Someone who wants access to specialised AI tools without building them. Pays a monthly subscription to a creator's channel or a specific app. Consumes credits with each use. Expects the experience to feel seamless — no tab switching, no API keys, no setup.

### Creator
A developer or vibe-coder building AI micro-apps. Connects a GitHub repo, configures secrets and settings, and deploys within minutes. Earns revenue from subscribers. Platform handles hosting, API routing, billing, and usage analytics.

### Platform Admin
The Terminal AI operator. Reviews and approves channels and apps before they go live. Manages users, monitors system health, handles reports, and configures platform-wide settings.

---

## 3. Core Features

### 3.1 Marketplace
- Landing page with featured channels, trending apps, category browsing
- Channel pages: creator profile, app grid, subscription CTA
- App detail pages: description, pricing, demo mode (optional), screenshots
- Full-text search powered by Meilisearch
- Social sharing with dynamic OG image previews

### 3.2 Authentication & Access Control
- Email/password and Google OAuth signup
- Three roles: user, creator (invite-only), admin
- Subscription-gated app access enforced at platform level
- Demo mode: 5 free credits for first visit, no account required

### 3.3 Subscriptions & Billing
- Channel subscription: monthly recurring, grants credit allowance
- Per-app subscription: monthly recurring, grants credit allowance
- Credit top-up: one-time purchase, multiple packages
- Powered by Razorpay (checkout.js) + Lago (billing engine)
- Platform takes a revenue split from creator subscriptions (% TBD)
- Creator payouts: manual in v1, Razorpay Route in v2

### 3.4 In-Platform App Viewer
- Creator apps run in `<iframe>` on their own subdomain
- Platform shell surrounds iframe: credit bar, back nav, share, download
- No new tab — users stay within Terminal AI
- Mobile: fullscreen iframe with floating back button
- Cold start overlay: "App is warming up..." for containers starting up

### 3.5 Credit System
- Credits consumed per API call through the gateway
- Monthly allowance granted on subscription renewal
- Per-session cap (creator-configured, MCP-suggested)
- Optional daily soft cap (creator-configured)
- Grace handling: warning toasts → top-up modal overlay (non-breaking)
- Session expiry: 30min inactivity, resumable

### 3.6 File Uploads
- Supported types: pdf, jpg, png, gif, webp, mp4, webm, docx, xlsx, pptx, csv, txt, json, md, mp3, wav
- Video hard cap: 50MB
- ClamAV malware scan on every upload
- EXIF/metadata stripping
- Open-source compression pipeline (Sharp, FFmpeg, Ghostscript, zstd)
- Compression level: creator-set per app, MCP auto-suggested
- User-scoped MinIO paths, signed URLs (1h TTL), 24h auto-delete

### 3.7 Artifact Downloads
- Apps can generate downloadable files (PPT, PDF, images, etc.)
- Stored in MinIO under user-scoped path
- Download button appears in platform chrome (not inside iframe)
- v2: in-platform artifact viewer (PDF, images, spreadsheets)

### 3.8 API Gateway
- All AI and scraping API calls from creator apps route through the platform gateway
- Connected providers: OpenRouter, Groq, RapidAPI, Tavily, Apify (and others)
- Credit deduction per call (configurable rate per provider/model)
- K-model ensemble: fan-out to K models simultaneously, select winner by vote or LLM judge
- Per-user, per-app, per-IP rate limiting
- Prompt injection detection on file content
- Embed token system: short-lived JWT (15min) issued to iframe, auto-refreshed

### 3.9 App Deployment Pipeline
- Creator connects GitHub repo via OAuth
- Framework auto-detected: Next.js, Python, Streamlit, static HTML
- Gitleaks secret scanning before every build
- Secrets managed encrypted in DB, injected at deploy time
- Coolify manages containerised builds and subdomains
- Blue-green deployments: staged → live switch, 24h rollback window
- Health checks every 60s, creator notified on failure
- Secret rotation without full redeploy

### 3.10 Optimiser (Opt-in)
- Creator enables per app; user can opt out at signup/settings
- Langfuse (self-hosted) captures LLM traces
- Behavioral signal collection: regeneration count, follow-up intent, session abandonment, artifact interaction
- Follow-up semantic classification by cheap LLM (gpt-4o-mini)
- Weekly BullMQ analysis job: sample bad interactions → LLM generates prompt suggestions
- Prompt A/B testing built into Langfuse
- Creator reviews diff-style suggestions in dashboard; applies with one click

### 3.11 MCP Server
- Exposes platform tools to vibe-coding agents (Cursor, Windsurf, etc.)
- Tools: scaffold app, configure gateway usage, set compression level, set session limits, set K-model strategy, check deployment status, rotate secrets
- Enforces scaffolding rules: all apps must route AI calls through Terminal AI gateway
- Auto-suggests configuration based on app type

### 3.12 Social Sharing
- Share buttons on channel pages, app detail pages, and inside platform chrome
- Dynamic OG images (1200×630) generated with Satori + resvg-js
- Channel OG: banner, creator info, app thumbnails grid, subscriber count
- App OG: thumbnail, name, category, price
- Cached in Redis (1h) + Cloudflare CDN
- Platforms: copy link, X (Twitter), LinkedIn, WhatsApp

### 3.13 Admin Panel
- Separate subdomain (admin.terminalai.app), IP-allowlisted
- 2FA required for all admin accounts
- Channel + app review queue (manual approval before go-live)
- User and creator management (suspend, adjust credits, manage invites)
- Content moderation queue (user reports, 24h SLA)
- Billing overview (Lago + Razorpay embeds)
- Platform config (credit packages, rate limits, feature flags)
- Immutable audit log

---

## 4. Deferred to Later Releases

| Feature | Release |
|---------|---------|
| In-platform artifact viewer (PDF, images) | v2 |
| Razorpay Route splits (creator payouts) | v2 |
| Security watcher (autonomous network monitoring) | v3 |
| Creator open sign-up (currently invite-only) | v2 |
| Self-improving framework per-model fine-tuning | v3 |

---

## 5. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Infrastructure cost | < €15/mo at launch |
| API gateway latency overhead | < 50ms added to provider latency |
| Uptime | 99.5% (monitored via UptimeRobot) |
| Cold start time | < 15s for creator app containers |
| OG image generation | < 200ms (cached after first render) |
| File upload scan time | < 5s for files under 5MB |
| GDPR data residency | EU (Hetzner Nuremberg) |
| Max concurrent users | 500 (CX22 headroom at 5000 users/month) |

---

## 6. Success Metrics (6-month targets)

- 5,000 registered users
- 3+ active creator channels
- 15+ live apps
- < 5% monthly churn on paid subscriptions
- Optimizer suggestion acceptance rate > 30%
- Zero data breach incidents
