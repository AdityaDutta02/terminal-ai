# Terminal AI — User Flows

**Version:** 1.0
**Date:** 2026-03-27

---

## 1. User — First Visit & Signup

```
[Landing Page]
  Sections: hero, featured channels, trending apps, categories, how it works
  CTA: Browse Apps (no login required) | Sign Up
        │
        ├──▶ [Browse — Unauthenticated]
        │      Visible: channel pages, app listings, descriptions, pricing
        │      Blocked: opening apps, seeing usage stats
        │      Clicking any app/subscribe CTA → redirects to signup
        │
        └──▶ [Sign Up]
               ○ Email + Password
               ○ Google OAuth
                      │
                      ▼
             [Email Verification]
               Resend sends verification link (expires 24h)
               Can resend after 60s
               Unverified users: read-only access only
                      │
                      ▼
             [Onboarding — Step 1: Profile]
               Name (required), avatar (optional, upload or initial)
                      │
                      ▼
             [Onboarding — Step 2: Privacy Preferences]
               ☑ Allow anonymous usage data to improve apps I use
               ☑ Email me about new apps from channels I subscribe to
               Both pre-checked; unchecking sets respective flags in DB
                      │
                      ▼
             [Onboarding — Step 3: Welcome]
               "You have 50 free credits — valid for 7 days"
               [Browse Apps →]
                      │
                      ▼
             [Home — Discovery Feed]
```

---

## 2. User — Discovery & Subscription

```
[Home / Discovery Feed]
  Tabs: For You | Trending | New | Categories
  App/channel cards: thumbnail, name, creator avatar, price, credit estimate
        │
        ├──▶ [Search Bar]
        │      Full-text (Meilisearch): app names, descriptions, categories
        │      Filters: price range, category, credit cost
        │      Results: apps + channels mixed, sorted by relevance
        │
        ├──▶ [Category Page]
        │      Grid of apps in category, sortable by trending / new / price
        │
        └──▶ [Channel Page]
               Creator profile, banner, bio, social links
               App grid (all apps in channel)
               Channel stats: subscriber count, app count
               Subscription CTA: "Subscribe to [Channel] — ₹299/mo"
               Individual app prices listed below
                      │
                      ├──▶ [App Detail Page]
                      │      Full description, screenshots/video preview
                      │      Credit cost estimate per use
                      │      File upload support notice (if enabled)
                      │      Optimizer notice (if enabled): "This app improves over time
                      │        using anonymous usage data"
                      │      Subscription options:
                      │        A) Part of [Channel] — ₹299/mo (includes all apps)
                      │        B) This app only — ₹99/mo (200 credits/mo)
                      │      [Try Demo] → if creator enabled (5 free credits, no account needed)
                      │      [Subscribe] → CHECKOUT FLOW (see Section 4)
                      │      [Share ↗] → share dropdown
                      │
                      └──▶ [CHECKOUT FLOW]
```

---

## 3. User — App Session

```
[My Apps] (sidebar / home tab for logged-in users)
  Cards: all accessible apps (channel + individual subs)
  Shows: last opened, credits remaining, new updates badge
        │
        ▼
[App Detail Page] → [Open App]
        │
        ▼
[Access Check]
  ├── Subscription active? No → Paywall overlay with subscribe CTA
  ├── Email verified? No → "Please verify your email to access apps"
  └── Credits > 0? No → Top-up modal

        │ (all checks pass)
        ▼
[Embed Token Issued]
  POST /api/embed-token { app_id }
  → JWT (15min TTL): user_id, app_id, session_id, credit_balance, ip_hash, ua_hash
  → Stored in Redis for validation

        │
        ▼
[Platform Shell + iframe Mount]

  ┌──────────────────────────────────────────────────────┐
  │  ← Back   [App Name]   Credits: 87/200   [Share ↗]  │
  │           [Creator Name]              [⋮ More]       │
  │  ──────────────────────────────────────────────────  │
  │                                                      │
  │                 CREATOR APP (iframe)                 │
  │          app-slug.apps.terminalai.app                │
  │                                                      │
  │  ──────────────────────────────────────────────────  │
  │  [📎 Files attached: 2]    [⬇ Download: report.pdf] │
  └──────────────────────────────────────────────────────┘

  Token handoff (on iframe load event):
    iframe.contentWindow.postMessage({ type: 'INIT', token, sessionId }, 'https://app-slug.apps.terminalai.app')

  Auto-refresh: platform re-issues token every 10min while app is open

  Credit bar states:
    > 20% remaining  → green, no interruption
    ≤ 20% remaining  → yellow bar + "Running low" indicator
    ≤ 5% remaining   → amber toast: "Almost out of credits"
    0 remaining      → API gateway returns CREDIT_EXHAUSTED
                     → platform intercepts via SSE notification
                     → top-up modal slides over iframe (non-breaking)
                     → user tops up → embed token refreshed → continues

  Session expiry:
    30min inactivity → platform detects (no API calls in window)
                    → postMessage { type: 'SESSION_EXPIRING', countdown: 60 }
                    → iframe shows "Session pausing in 60s" (creator implements)
                    → user clicks Resume → new embed token issued, session resumes
                    → or: session ends → credits preserved → can reopen app

  Cold start (container starting):
    iframe load timeout > 3s → platform shows overlay:
    "App is warming up... (usually ~10s)"
    Spinner animation, auto-dismisses when iframe responds
```

---

## 4. Checkout Flows

### 4a. Channel or App Subscription

```
[Subscribe CTA clicked]
        │
        ▼
[Checkout Page — /checkout/subscribe]
  Order summary:
    Plan name, price, billing interval
    Credits included per month
    Next renewal date

  [Proceed to Payment]
        │
        ▼
  POST /api/checkout/initiate
    → Lago: create subscription draft
    → Razorpay: create subscription (plan_id)
    → Return: razorpay_subscription_id, key_id
        │
        ▼
  [Razorpay checkout.js modal opens]
    Accepts: UPI, credit/debit card, netbanking, wallets, EMI
    PCI-compliant (hosted by Razorpay, not our server)
        │
        ├── Payment success
        │     Razorpay fires webhook → POST /webhooks/razorpay
        │     webhook-processor:
        │       1. Verify Razorpay signature
        │       2. Idempotency check (razorpay_event_id already processed?)
        │       3. Lago: activate subscription
        │       4. credit_ledger: grant monthly credits
        │       5. notification: "Subscription active — 500 credits granted"
        │     Redirect: [Channel/App Page] with "Subscribed ✓" state
        │
        └── Payment failed
              Razorpay shows failure message (user-facing, Razorpay-hosted)
              On 3rd failure in 1 hour → Redis counter → account flagged
              User can retry after cooldown

  Subscription renewal (auto-monthly):
    Razorpay auto-charges → webhook → same pipeline
    On payment failure: Lago grace period 3 days
    Day 1–3: "Payment failed — please update payment method" notification
    Day 4: subscription paused, access revoked, credits frozen
    User updates card → Razorpay retries → subscription reactivated
```

### 4b. Credit Top-Up (One-Time)

```
[Top-Up Modal]
  Triggered by: credit exhaustion OR manual (Credits bar → "Top up")

  Credit packages:
    ○ 100 credits  — ₹49
    ● 500 credits  — ₹199  (Most popular badge)
    ○ 1000 credits — ₹349
    ○ Custom: [___] credits — calculated price

  [Pay ₹199]
        │
        ▼
  POST /api/checkout/topup { package_id }
    → Razorpay: create Order (one-time)
    → Razorpay checkout.js modal opens
        │
        ├── Payment success
        │     Webhook → webhook-processor
        │     credit_ledger: +500 credits, reason: 'topup'
        │     Modal closes, credit bar updates instantly
        │     If mid-session: session resumes automatically
        │
        └── Payment failed
              Error message in modal, retry allowed immediately
```

### 4c. Subscription Management

```
[Settings → Billing → My Subscriptions]
  List: channel name / app name, price, renewal date, credits remaining

  Per subscription:
  [Pause]   → access paused until user resumes
              credits frozen (not reset)
              billing paused (Razorpay subscription paused)
              Confirmation dialog: "Access will be paused immediately"
  [Resume]  → billing resumes, access restored, same credit balance
  [Cancel]  → access until end of current billing period
              no refund for remaining period
              Confirmation dialog: "You'll have access until [date]"
  [Change Plan] → Upgrade/downgrade (pro-rated credit adjustment via Lago)

  Credit history tab:
    Ledger view: date, reason, delta, balance
    Filter by: type (grant/spend/topup), date range

  Invoice tab:
    PDF invoices per billing cycle (generated by Lago)
    Download as PDF
```

---

## 5. File Upload (Within App Session)

```
User action in creator app (iframe):
  Selects file via <input type="file"> or drag-and-drop
        │
        ▼
  Creator app sends: POST api.terminalai.app/upload
    Headers: Authorization: Bearer {embed_token}
    Body: multipart/form-data
        │
        ▼
  API Gateway upload handler:
    1. Validate embed token (session valid, subscription active)
    2. Magic bytes check (not extension): is this actually a PDF/image/etc?
    3. File type in app's allowed list?
    4. Size within plan limit?
    5. For video: hard cap 50MB (pre-compression)
    6. ClamAV scan:
       < 5MB → synchronous (inline, ~1-2s)
       > 5MB → async (BullMQ job, app polls status endpoint)
    7. Metadata strip (EXIF / document properties)
    8. Compression (compression-svc based on app config level)
    9. Store in MinIO: uploads/{app_id}/{session_hash}/{uuid}/{safe_filename}
    10. DB row in gateway.uploads
    11. Return: { uploadId, signedUrl (1h TTL), expiresAt, status: 'clean' }
        │
        ▼
  Creator app receives signedUrl
  → passes to AI pipeline (e.g., PDF extraction, image analysis)
  → user sees result in iframe

  Platform chrome shows: [📎 filename.pdf · 2.4MB]

  Large file async path (> 5MB):
    POST /upload/presign → MinIO presigned PUT URL (5min TTL)
    Client uploads directly to MinIO
    MinIO event → BullMQ → ClamAV
    App polls GET /upload/{uploadId}/status until scan_result = 'clean'
```

---

## 6. Artifact Download

```
Creator app generates a file (e.g., PPT, PDF, CSV):
  App calls: POST api.terminalai.app/artifacts
    { filename, mimeType, content: base64 | buffer }
    Headers: Authorization: Bearer {embed_token}
        │
        ▼
  API Gateway:
    Validates embed token
    Stores file in MinIO: artifacts/{app_id}/{session_id}/{uuid}/{filename}
    DB row in gateway.artifacts (expires_at = now + 24h)
    Returns: { artifactId, downloadUrl (signed, 24h TTL) }
        │
        ▼
  Platform shell receives artifactId via SSE notification
  → Shows download button in platform chrome (outside iframe):
    [⬇ Download: presentation.pptx · 1.8MB]

  User clicks download → browser downloads file directly from MinIO signed URL
  Platform logs downloaded_at timestamp

  After 24h: MinIO lifecycle rule auto-deletes file
  User tries to download after expiry → "This download has expired.
  Open the app to regenerate it."
```

---

## 7. Creator — Onboarding

```
[Invitation Email]
  "You've been invited to publish on Terminal AI"
  [Accept Invitation →] (link with invite token, expires 7 days)
        │
        ▼
[Creator Signup / Link Account]
  New: Email + Password or Google (role auto-set to 'creator')
  Existing user: link invite to existing account → role upgraded
        │
        ▼
[Creator Onboarding — Step 1: Profile]
  Display name, bio (max 300 chars), avatar, website, social links
        │
        ▼
[Creator Onboarding — Step 2: Channel Setup]
  Channel name, slug (auto-suggested from name, editable)
  Description (max 500 chars), banner image upload (MinIO)
  Category tags (multi-select from platform categories)
  Channel subscription price: ₹_/mo  OR  Free
        │
        ▼
[Creator Onboarding — Step 3: Payout (v1 placeholder)]
  "Payouts are currently processed manually. We'll contact you monthly."
  Bank account details form (stored encrypted, used for manual transfer)
  Note: Razorpay Route splits coming in v2
        │
        ▼
[Creator Onboarding — Step 4: Platform Agreement]
  Terms of Service scroll + accept
  Prohibited Content Policy accept (explicit checkbox)
  Data Processing Agreement accept (GDPR)
  [Submit Channel for Review]
        │
        ▼
[Channel: Pending Review]
  "We'll review your channel within 24 hours"
  Admin email + in-app notification of new pending channel
  On approval → creator notified → channel visible (no apps yet = not searchable)
  On rejection → creator notified with reason → can edit and resubmit
```

---

## 8. Creator — App Deployment

```
[Creator Dashboard] → [+ New App]
        │
        ▼
[Step 1: App Info]
  App name, slug, description, category tags
  Thumbnail upload (MinIO, shown in marketplace)
  Pricing:
    ○ Included in channel subscription
    ○ Standalone: ₹_/mo · ___ credits/month
    ○ Free (no subscription required)
        │
        ▼
[Step 2: GitHub Connection]
  [Connect GitHub] → OAuth flow → repo + branch selector
  Framework auto-detected from repo contents:
    package.json with "next" → Next.js
    requirements.txt with "streamlit" → Streamlit
    requirements.txt (no streamlit) → Python/FastAPI
    index.html (no package.json) → Static HTML
    Other → manual selection

  Coolify project stub created via deploy-manager API
        │
        ▼
[Step 3: Environment & Secrets]
  Key-value editor
  Values stored encrypted (AES-256-GCM)
  System-injected vars (shown greyed out, not editable):
    TERMINAL_AI_GATEWAY_URL=https://api.terminalai.app
    TERMINAL_AI_APP_ID={app_id}
    TERMINAL_AI_TOKEN={rotated_service_token}
  Creator-managed vars (any other env vars their app needs)
  [+ Add variable]  [⟳ Rotate secret] per row
        │
        ▼
[Step 4: App Configuration]

  Credits & Session Limits
  ─────────────────────────
  Credits per API call: [auto-estimate] or [override ___]
  Max credits per session: [___] (MCP suggested based on framework/category)
  Daily soft cap: ☐ Enable   Limit: ___% of monthly allowance
  Concurrent sessions per user: 1 (fixed, prevents sharing)

  File Uploads
  ─────────────
  Accept file uploads: ☐
  If checked:
    Allowed types: ☐pdf ☐jpg ☐png ☐gif ☐mp4 ☐webm ☐docx ☐xlsx ☐csv ☐txt ☐json ☐md
    Video max: 50MB (fixed, not editable)
    Compression: ○ High Fidelity  ● Balanced  ○ Aggressive
    (MCP auto-suggestion shown next to options)

  Usage Optimiser
  ─────────────────
  ☐ Enable usage optimisation for this app
  If checked: "Users will see a notice that this app uses anonymous
  interaction data to improve itself. Users may opt out in their settings."

  K-Model Strategy
  ─────────────────
  ○ Single model (standard, cheapest)
  ○ Vote (K=3 models, majority wins — for factual queries)
  ○ Judge (K=3 models, LLM judge selects best — for generative tasks)
  If vote or judge:
    Select up to 3 provider/model pairs
    Judge model (judge mode only): [selector, default: cheapest capable model]

  Mobile Support
  ──────────────
  ☐ My app is optimised for mobile
        │
        ▼
[Step 5: Review & Pre-Deploy Checks]

  Automated checks (run on [Review] click):
    ✓/✗  GitHub repo accessible
    ✓/✗  Framework detected: Next.js
    ✓/✗  Gitleaks: no secrets in code
    ✓/✗  Terminal AI gateway pattern present
    ⚠    OPENAI_API_KEY in .env.example (warning, not blocking)
    ✓/✗  Health check endpoint exists (for non-static apps)

  [Deploy App]  ← disabled if any ✗ checks
        │
        ▼
[Deployment Progress — live log stream via SSE]
  [✓] Repo cloned
  [✓] Gitleaks scan passed
  [✓] Secrets injected
  [→] Coolify build in progress...
  [✓] Container started
  [✓] Health check passed
  [✓] DNS configured: app-slug.apps.terminalai.app
  [✓] SSL certificate issued

  [Submit for Admin Review]
        │
        ▼
[App: Pending Review]
  Admin reviews within 24h
  Approved → app live → creator + existing channel subscribers notified
  Rejected → creator notified with specific reason → fix and resubmit
```

---

## 9. Creator — Ongoing Management

```
[Creator Dashboard — Overview]
  Revenue this month: ₹_____
  Active subscribers: __ (channel) + __ (app-only)
  Credits consumed today: _____
  Pending optimizer suggestions: __
  System alerts: app health, failed deploys

[Apps Tab]
  Per app: status badge, subscriber count, health indicator, last deploy time
  Actions: [Open Analytics] [Configure] [Deploy Update] [Rollback] [Pause App]

[Analytics Tab] (per channel or per app)
  ○ Subscribers over time (line chart)
  ○ Credit usage by day (bar chart)
  ○ Sessions: count, avg duration, avg credits used
  ○ Error rate (from Langfuse traces)
  ○ Follow-up intent distribution (from optimizer logs)
  ○ Top users by usage (anonymised: "User #4829 — 847 credits this month")

[Optimiser Tab]
  Suggestions inbox (from weekly analysis runs):
  ┌──────────────────────────────────────────────────────────┐
  │ 📊 Based on 68 sessions (34% regeneration rate)         │
  │ Suggested: Update system prompt                          │
  │                                                          │
  │ BEFORE: "You are a helpful assistant..."                 │
  │ AFTER:  "You are a concise document analyst. When asked  │
  │          to summarise, always use bullet points..."      │
  │                                                          │
  │ A/B test running: Variant A vs B (68 sessions each)     │
  │ Current winner: Variant B (+23% positive signals)       │
  │                                                          │
  │ [Apply Suggestion] [Run A/B Test] [Dismiss]             │
  └──────────────────────────────────────────────────────────┘

[Deployments Tab]
  Deploy history with commit SHA, timestamp, status
  [Rollback to version X] — restores previous Coolify container
  [View Build Logs] — streaming log viewer (Dozzle link)
  Blue-green status: "Live: v1.4 | Staged: v1.5 — [Switch Traffic]"
```

---

## 10. Admin Flows

```
[Admin Login] — admin.terminalai.app (IP allowlisted)
  Email + Password → TOTP 2FA → session (2h, re-auth on sensitive actions)
        │
        ▼
[Admin Dashboard]
  Service health: UptimeRobot embed (all endpoints)
  Today's stats: signups, subscriptions, revenue, API calls, errors
  Review queue counts: channels __, apps __, reports __

[User Management]
  Search: email, user ID, name
  Per user: role, subscription status, credit balance, join date, last active
  Actions (all audit-logged):
    [Suspend Account] → access revoked, subscriptions paused
    [Adjust Credits] → manual credit grant/deduct with reason
    [Reset Password] → sends reset email
    [View Activity] → api_calls, uploads, sessions history

[Creator Management]
  Pending invites (send new invite form)
  Active creators: channel name, app count, subscriber count, revenue
  Actions: [Suspend Creator] [View Revenue] [Manage Apps]

[App Review Queue]
  Per pending app:
    Creator details, GitHub repo link
    Live preview in sandboxed iframe (admin sees it before users)
    Checklist:
      ☐ Content appropriate (no prohibited material)
      ☐ Uses Terminal AI gateway (Gitleaks passed, no direct API keys)
      ☐ Loads in iframe without errors
      ☐ Description accurate and complete
    [Approve] → app goes live, creator + channel subscribers notified
    [Reject] → modal: enter rejection reason → creator notified via email + in-app

[Content Reports Queue]
  Reported apps with user description
  Admin actions:
    [Dismiss] → no action, close report
    [Warn Creator] → in-app notification to creator
    [Suspend App] → app hidden from marketplace, creator notified
    [Suspend Creator] → all apps suspended, creator access revoked
  24h SLA tracked with created_at timestamp

[Billing Overview]
  Lago dashboard (embedded iframe or link)
  Razorpay dashboard link
  Failed webhooks: list with [Retry] button
  Revenue split tracking (manual payout records in v1)

[Platform Config]
  Welcome credits amount: [50]
  Welcome credits validity days: [7]
  Credit packages: edit prices and credit amounts
  Global rate limits: per-user API calls/min [100], per-app [1000]
  Max file sizes per type (table editor)
  Maintenance mode: ☐ Enable — [message text field]
  Feature flags: ☐ Optimizer globally enabled  ☐ K-model globally enabled

[Audit Log]
  Immutable, append-only
  Filter by: actor, action type, target type, date range
  Cannot delete entries (enforced by DB policy: no DELETE on audit.log)
```

---

## 11. Notification Flows

```
Delivery channels:
  In-app: SSE stream → real-time toast → notification inbox
  Email: Resend (transactional)
  Admin: Telegram bot

Notification triggers:

User notifications:
  ✉ Welcome email (signup)
  📱 Subscription activated (payment success)
  ⚠️ Credits running low (≤ 20% monthly balance)
  📱 Subscription renewal succeeded
  ⚠️ Subscription payment failed (grace period started)
  📱 New app from subscribed channel
  ⚠️ File scan failed (infected file detected)
  ✉ Data export ready (GDPR portability request)

Creator notifications:
  📱 Channel approved / rejected
  📱 App approved / rejected (with reason)
  ⚠️ App health check failing
  📱 New subscriber (channel or app)
  📱 New optimizer suggestion ready
  ⚠️ Deployment failed (with log excerpt)
  📱 Deployment succeeded

Admin notifications (Telegram):
  🔴 Any service downtime (UptimeRobot webhook)
  🔴 Failed webhook after 3 retries
  🟡 New channel/app pending review
  🟡 New content report filed
  🔴 ClamAV detected infected file (user ID, app ID)
```
