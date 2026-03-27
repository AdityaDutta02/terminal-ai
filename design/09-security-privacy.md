# Terminal AI — Security & Privacy Architecture

**Version:** 1.0
**Date:** 2026-03-27

---

## 1. Threat Model

| Threat | Surface | Mitigation |
|--------|---------|-----------|
| Cross-tenant data access | PostgreSQL | Row-Level Security on all tenant tables |
| Iframe cross-origin access | Browser | Same-origin policy + strict CSP headers |
| Embed token sharing | API gateway | Token bound to IP hash + UA hash, 15min TTL |
| Secret leakage in creator code | GitHub repo | Gitleaks pre-deploy scan |
| Malware upload | File upload endpoint | ClamAV scan before storage |
| Prompt injection via files | API gateway | Pattern detection + `<untrusted-user-content>` wrapping |
| Subdomain takeover on deletion | DNS | DNS removed before container deletion |
| Creator app SSRF | VPS 2 network | App containers isolated from VPS 1 private network |
| DDoS | All public endpoints | Cloudflare free tier (automatic DDoS mitigation) |
| Brute force login | Auth endpoints | Rate limiting (5 failures → 15min lockout) |
| Credential stuffing | Auth | Better Auth built-in anomaly detection |
| Admin privilege escalation | Admin panel | 2FA required, IP allowlist, 2h session TTL |
| Card testing / payment fraud | Checkout | Razorpay fraud detection + 3 failures/hr limit |
| API key siphoning by creator apps | Gateway | Apps cannot call providers directly (enforced by gateway + MCP rules) |
| Razorpay webhook replay | Webhook processor | Idempotency check on every event ID |
| PII in optimizer logs | Langfuse | All identifiers hashed, prompt/response content not stored |

---

## 2. Authentication & Session Security

### Better Auth Configuration
```
Session storage: Redis (httpOnly cookie → server-side session)
Session TTL: 7 days (sliding window on activity)
Admin session TTL: 2 hours (non-sliding)
TOTP: required for admin accounts, optional for users/creators

Password policy:
  Minimum 10 characters
  bcrypt rounds: 12
  Common password list rejection (HaveIBeenPwned API check on signup)

Account lockout:
  5 failed login attempts → 15min lockout
  10 attempts → 1hr lockout, admin notified
  Counter resets on successful login

Email verification:
  Required before accessing any app
  Token expires: 24h
  Resend allowed: after 60s cooldown
```

### Admin Panel Security
```
URL: admin.terminalai.app
Traefik middleware: IP allowlist (admin's home/office IPs only)
Auth: email + password → TOTP (6-digit, 30s window)
Session: 2h TTL, re-auth required for:
  - Suspending a user or creator
  - Adjusting credits manually
  - Overriding subscription status
  - Accessing audit log export

All admin actions → audit.log:
  { actor_id, actor_role, action, target_type, target_id, metadata, ip_address, timestamp }
  Append-only — DB policy prevents DELETE on audit.log
```

---

## 3. Data Isolation

### Database (PostgreSQL RLS)
Every table with tenant scope has Row-Level Security enabled. Services set the current identity on their DB connection via `SET LOCAL app.current_user_id`.

```sql
-- Pattern applied to all tenant tables:
ALTER TABLE {schema}.{table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {schema}.{table} FORCE ROW LEVEL SECURITY;

-- Users: see only their own data
CREATE POLICY user_isolation ON {schema}.{table}
  FOR ALL USING (user_id = current_setting('app.current_user_id')::uuid);

-- Admin: full access (bypasses RLS via superuser role in admin queries only)
-- Creator: sees aggregated data for their own apps only (not per-user details)
```

### Browser (Same-Origin Policy + CSP)
```
Platform shell: terminalai.app
Creator app A:  app-a.apps.terminalai.app  (separate origin)
Creator app B:  app-b.apps.terminalai.app  (separate origin)

Browser enforces: app-a cannot read cookies, localStorage, DOM of app-b or platform.

CSP headers injected by Coolify on every creator app response:
  Content-Security-Policy:
    default-src 'self';
    frame-ancestors https://terminalai.app;
    connect-src 'self' https://api.terminalai.app;
    script-src 'self' 'unsafe-inline';
    img-src 'self' data: https:;

  X-Frame-Options: ALLOW-FROM https://terminalai.app
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```

### Network Isolation (VPS 2)
```
Hetzner private network:
  VPS 1 ↔ VPS 2 communication: only via deploy-manager API (port 3002)
  Creator app containers on VPS 2: cannot reach VPS 1 private IPs
  Creator app containers: no inbound connections from each other
  Outbound from creator apps: internet only, no 10.x.x.x routes
```

### MinIO Path Isolation
```
Uploads bucket structure:
  uploads/{app_id}/{session_hash}/{uuid}/{filename}
  ← session_hash is SHA256(user_id + app_id + date), not raw user_id

MinIO bucket policy: private (no public access)
Signed URLs: scoped to exact object path, not path prefix
URL TTL: 1h for uploads, 24h for artifacts, 1yr for public assets (thumbnails)

Cross-user access prevention:
  Signed URL = tied to exact MinIO key
  session_hash ≠ between users (cannot enumerate other users' uploads)
  Even if uploadId is guessed, signed URL requires valid HMAC → access denied
```

---

## 4. Secrets Management

```
Platform secrets (provider API keys):
  Stored in: Redis (encrypted at application layer)
  Loaded at: service startup
  Rotation: admin dashboard → Redis update → no restart needed
  Never in: PostgreSQL, log files, environment files committed to git

Creator app secrets (env vars):
  Stored in: deployments.env_secrets_enc (AES-256-GCM)
  Encryption key: VPS env var SECRETS_KEY (never in DB)
  Decrypted: only by deploy-manager at deploy time
  Passed to Coolify: encrypted in transit via Hetzner private network
  Never: logged, returned to frontend, stored decrypted

GitHub OAuth tokens:
  Stored in: deployments.github_connections.access_token_enc (AES-256-GCM)
  Separate encryption key: GITHUB_TOKEN_KEY

TOTP secrets:
  Stored in: auth.totp_credentials.secret_enc (AES-256-GCM)
  Separate encryption key: TOTP_KEY

Key rotation procedure:
  1. Generate new key
  2. Re-encrypt all affected DB rows with new key
  3. Update VPS env var
  4. Restart affected service
  5. Verify: test decryption on sample rows
```

---

## 5. File Upload Security

```
Validation layers (in order):
  1. File type: magic bytes check (not extension — extensions are trivially spoofed)
  2. Whitelist check: allowed types per app configuration
  3. Size limit: per type, video hard-capped at 50MB
  4. ClamAV scan: malware detection
  5. Metadata strip: EXIF, document properties (prevent metadata exfiltration)
  6. Compression: reduces storage and potential zip-bomb risk

ClamAV configuration:
  Signature database: auto-updated daily (freshclam)
  Memory cap: 512MB (Docker resource limit)
  Scan timeout: 30s (files not scanned in time → rejected)

Malware detection response:
  File immediately deleted from memory
  DB row marked: scan_result = 'infected'
  User notified: "Your file was blocked by our security scanner."
  Admin alerted via Telegram: user ID (hashed), app ID, filename, virus name
  No file content is logged or stored
```

---

## 6. Creator App Code Security

### Gitleaks Pre-Deploy Scan
```
Runs before every Coolify build trigger (blocking)
Detects: API keys, tokens, private keys, connection strings (200+ patterns)
On detection:
  Deployment blocked
  Creator notified with file:line reference
  Suggested: rotate key immediately + remove from code
  Key rotation is creator's responsibility (platform cannot rotate external keys)
```

### Subdomain Takeover Prevention
```
On app deletion:
  Step 1: Remove DNS record via Cloudflare API  ← MUST happen first
  Step 2: Stop Coolify container
  Step 3: Remove SSL certificate
  Step 4: Mark deployment.status = 'deleted'

Ordering is critical: DNS removed before container stops.
If DNS removed after: brief window where subdomain points to stopped container,
  another party could claim it. Removing DNS first eliminates this window.
```

### Content Security Policy on Creator Apps
Coolify is configured to inject a CSP header response middleware for all managed containers. Creators cannot override `frame-ancestors` (enforced by platform Traefik layer as a fallback).

---

## 7. Payment Security

```
Razorpay integration:
  Webhook signature verification: HMAC-SHA256 on every webhook payload
  Idempotency: razorpay_event_id stored, duplicate events discarded
  Payment failure lockout: 3 failures/hour → Redis counter → account flagged
  Admin alert on flagged account
  PCI compliance: handled entirely by Razorpay (we never touch card data)

Checkout page security:
  Cloudflare bot protection on /checkout/* routes
  CSRF protection: Next.js built-in CSRF tokens on form submissions
  Rate limiting: 10 checkout initiations/hour per user (Traefik)
```

---

## 8. GDPR Compliance

### Data Residency
All data stored in EU (Hetzner Nuremberg, Germany).
No data transferred outside EU without explicit user consent.
Third parties with data access: Razorpay (payment data, GDPR-compliant), Resend (email, GDPR-compliant).

### Consent Management
```
Analytics (Umami): respects Do Not Track header, no cookies, no PII
Optimizer logging: explicit double opt-in (creator enables + user must not have opted out)
Marketing emails: explicit opt-in during signup, one-click unsubscribe in every email
Cookie consent: Klaro (open source) — functional cookies only, no tracking cookies
```

### User Rights Implementation

| Right | Implementation |
|-------|---------------|
| Access | GET /api/me → full profile data |
| Portability | GET /api/me/export → JSON of all data |
| Erasure | POST /api/me/delete → cascade deletion pipeline |
| Rectification | PUT /api/me → update profile fields |
| Restriction | POST /api/me/restrict → freeze processing, flag for manual review |
| Object | Optimizer opt-out in settings (immediate effect) |

### Data Retention
```
User data:       Retained until account deletion or erasure request
Session data:    Redis TTL (7 days for users, 2h for admins)
API call logs:   90 days (then anonymised: user_id → null)
Upload files:    24h (MinIO lifecycle auto-delete)
Artifact files:  24h (MinIO lifecycle auto-delete)
Optimizer logs:  90 days (Langfuse retention config)
Audit logs:      7 years (legal/accounting requirement)
Invoices:        7 years (tax requirement)
Payment records: Retained by Razorpay per their policy
```

### DPA (Data Processing Agreement)
Each creator channel page displays a notice: "Apps on this channel may process your files and inputs. [Creator Name] is the data processor for your content submitted to their apps. Terminal AI is the data controller for your account data."

Creator ToS requires creators to maintain their own privacy policy.
