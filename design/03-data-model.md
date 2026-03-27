# Terminal AI — Data Model & Privacy Architecture

**Version:** 1.1
**Date:** 2026-03-27

---

## Changelog (v1.0 → v1.1)

- Fixed GDPR violation: `audit.log.ip_address` → `ip_hash` (raw IP is PII)
- Fixed security flaw: `auth.invites.token` → `token_hash` (invite tokens now stored hashed)
- Added `UNIQUE(subdomain)` on `deployments.deployments`
- Added partial unique index preventing multiple live versions per app
- Fixed polymorphic FK: `subscriptions.plans.entity_id` replaced with `channel_id` + `app_id` with CHECK constraint
- Added CHECK on `credit_ledger.reason` enum values
- Added partial UNIQUE index on `topups.razorpay_payment_id` (double-credit prevention)
- Added 9 missing indexes for query performance
- Added `audit.log` partitioning by year (7-year retention)
- Added `auth.users.last_login_at`
- Added range CHECK on `daily_cap_percent` and minimum CHECK on `credits_per_session`
- Added `'archived'` to `marketplace.apps.status`
- Changed `subscriptions.plans.id` from TEXT to UUID + added `code TEXT UNIQUE` field
- Added `currency` field to `subscriptions.plans`
- Added `deleted_at` soft-delete to `channels` and `apps`
- Added CHECK constraints on optimizer enum fields
- Added `deployments.webhook_events` table for Razorpay/GitHub idempotency

---

## 1. PostgreSQL Schema

Single PostgreSQL instance with per-domain schemas. PgBouncer handles connection pooling in front of all services.

---

### schema: auth

```sql
CREATE TABLE auth.users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT UNIQUE NOT NULL,
  email_verified      BOOLEAN DEFAULT FALSE,
  name                TEXT,
  avatar_url          TEXT,
  role                TEXT NOT NULL CHECK (role IN ('user', 'creator', 'admin')),
  optimizer_opt_out   BOOLEAN DEFAULT FALSE,  -- global opt-out only (v1); per-app opt-out is a v2 concern
  onboarding_step     INTEGER DEFAULT 0,
  last_login_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE auth.sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  ip_hash     TEXT,
  ua_hash     TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE auth.oauth_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL,
  provider_id  TEXT NOT NULL,
  UNIQUE(provider, provider_id)
);

CREATE TABLE auth.invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'creator',
  invited_by   UUID REFERENCES auth.users(id),
  token_hash   TEXT UNIQUE NOT NULL,  -- SHA256 of raw token; raw token shown to inviter once only
  used_at      TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE auth.totp_credentials (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  secret_enc  TEXT NOT NULL,  -- AES-256-GCM encrypted; nonce prepended to ciphertext
  enabled     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

---

### schema: marketplace

```sql
CREATE TABLE marketplace.channels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id    UUID NOT NULL REFERENCES auth.users(id),
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  banner_url    TEXT,
  avatar_url    TEXT,
  category_tags TEXT[],  -- values must match marketplace.categories.slug; enforced at app layer
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'active', 'suspended')),
  deleted_at    TIMESTAMPTZ,  -- soft delete; filter WHERE deleted_at IS NULL in all queries
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE marketplace.apps (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id            UUID NOT NULL REFERENCES marketplace.channels(id),
  slug                  TEXT NOT NULL,
  name                  TEXT NOT NULL,
  description           TEXT,
  thumbnail_url         TEXT,
  category_tags         TEXT[],  -- values must match marketplace.categories.slug
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'live', 'suspended', 'draft', 'archived')),
  -- Viewer config
  iframe_enabled        BOOLEAN DEFAULT TRUE,
  mobile_support        BOOLEAN DEFAULT FALSE,
  -- File upload config
  uploads_enabled       BOOLEAN DEFAULT FALSE,
  upload_allowed_types  TEXT[],
  upload_compression    TEXT DEFAULT 'balanced'
                        CHECK (upload_compression IN ('high_fidelity', 'balanced', 'aggressive')),
  -- Credit config
  credits_per_session   INTEGER DEFAULT 50 CHECK (credits_per_session >= 1),
  daily_cap_percent     INTEGER CHECK (daily_cap_percent BETWEEN 1 AND 100),  -- null = disabled
  -- Optimizer config
  optimizer_enabled     BOOLEAN DEFAULT FALSE,
  -- K-model config
  kmodel_config         JSONB,
  -- Demo mode
  demo_enabled          BOOLEAN DEFAULT FALSE,
  demo_credits          INTEGER DEFAULT 5,
  -- Lifecycle
  deleted_at            TIMESTAMPTZ,  -- soft delete; filter WHERE deleted_at IS NULL in all queries
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE(channel_id, slug)
);

CREATE TABLE marketplace.app_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          UUID NOT NULL REFERENCES marketplace.apps(id),
  version         TEXT NOT NULL,
  commit_sha      TEXT,
  coolify_app_id  TEXT,
  deployed_at     TIMESTAMPTZ DEFAULT now(),
  is_live         BOOLEAN DEFAULT FALSE
);

-- Enforces only one live version per app at the DB level
CREATE UNIQUE INDEX app_versions_one_live_per_app
  ON marketplace.app_versions(app_id) WHERE is_live = TRUE;

CREATE TABLE marketplace.categories (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name  TEXT UNIQUE NOT NULL,
  slug  TEXT UNIQUE NOT NULL,
  icon  TEXT
);

CREATE TABLE marketplace.app_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      UUID NOT NULL REFERENCES marketplace.apps(id),
  reporter_id UUID REFERENCES auth.users(id),
  reason      TEXT NOT NULL,
  details     TEXT,
  status      TEXT DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'actioned')),
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

---

### schema: subscriptions

```sql
CREATE TABLE subscriptions.plans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT UNIQUE NOT NULL,  -- human slug, e.g. 'channel_slug_monthly'; stable across renames
  type              TEXT NOT NULL CHECK (type IN ('channel', 'app')),
  -- Exactly one of channel_id or app_id must be set (enforced by CHECK below)
  channel_id        UUID REFERENCES marketplace.channels(id),
  app_id            UUID REFERENCES marketplace.apps(id),
  price_inr         INTEGER NOT NULL CHECK (price_inr > 0),  -- in paise
  currency          TEXT NOT NULL DEFAULT 'INR',
  credits_included  INTEGER NOT NULL CHECK (credits_included > 0),
  interval          TEXT NOT NULL CHECK (interval IN ('monthly', 'yearly')),
  razorpay_plan_id  TEXT,
  lago_plan_code    TEXT,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT now(),
  -- FK integrity: type must match which FK column is populated
  CHECK (
    (type = 'channel' AND channel_id IS NOT NULL AND app_id IS NULL) OR
    (type = 'app'     AND app_id     IS NOT NULL AND channel_id IS NULL)
  )
);

CREATE TABLE subscriptions.subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES auth.users(id),
  plan_id                 UUID NOT NULL REFERENCES subscriptions.plans(id),
  status                  TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'paused', 'cancelled', 'past_due')),
  current_period_start    TIMESTAMPTZ NOT NULL,
  current_period_end      TIMESTAMPTZ NOT NULL,
  razorpay_sub_id         TEXT UNIQUE,
  lago_subscription_id    TEXT UNIQUE,
  cancelled_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT now()
);

-- Append-only credit ledger. Never update rows, only insert.
CREATE TABLE subscriptions.credit_ledger (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id),
  subscription_id   UUID REFERENCES subscriptions.subscriptions(id),
  delta             INTEGER NOT NULL,  -- positive = grant, negative = debit
  balance_after     INTEGER NOT NULL,
  reason            TEXT NOT NULL
                    CHECK (reason IN ('subscription_grant', 'api_call', 'topup', 'demo', 'welcome', 'refund')),
  app_id            UUID REFERENCES marketplace.apps(id),
  api_call_id       UUID,              -- no FK: api_calls rows may be anonymised; reference is informational
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE subscriptions.topups (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id),
  credits             INTEGER NOT NULL CHECK (credits > 0),
  amount_inr          INTEGER NOT NULL CHECK (amount_inr > 0),  -- in paise
  razorpay_order_id   TEXT UNIQUE,
  razorpay_payment_id TEXT,
  status              TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- Prevent double-crediting from Razorpay webhook retries
CREATE UNIQUE INDEX topups_unique_payment
  ON subscriptions.topups(razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

CREATE TABLE subscriptions.credit_packages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credits     INTEGER NOT NULL CHECK (credits > 0),
  price_inr   INTEGER NOT NULL CHECK (price_inr > 0),  -- in paise
  label       TEXT,              -- e.g., 'Most Popular'
  is_active   BOOLEAN DEFAULT TRUE
);
```

---

### schema: gateway

```sql
CREATE TABLE gateway.api_calls (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id),
  app_id            UUID NOT NULL REFERENCES marketplace.apps(id),
  session_id        TEXT NOT NULL,
  provider          TEXT NOT NULL,
  model             TEXT NOT NULL,
  strategy          TEXT DEFAULT 'single'
                    CHECK (strategy IN ('single', 'kmodel_vote', 'kmodel_judge')),
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  cost_usd          NUMERIC(10, 6),
  credits_charged   INTEGER NOT NULL,
  latency_ms        INTEGER,
  status            TEXT DEFAULT 'success' CHECK (status IN ('success', 'error', 'rate_limited')),
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE gateway.kmodel_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_call_id   UUID NOT NULL REFERENCES gateway.api_calls(id),
  model         TEXT NOT NULL,
  provider      TEXT NOT NULL,
  latency_ms    INTEGER,
  tokens_used   INTEGER,
  score         NUMERIC(4, 3),   -- judge score 0.000–1.000
  selected      BOOLEAN DEFAULT FALSE
);

CREATE TABLE gateway.uploads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id_hash    TEXT NOT NULL,   -- SHA256(user_id + app_id + date); not raw user_id (GDPR)
  app_id          UUID NOT NULL REFERENCES marketplace.apps(id),
  session_hash    TEXT NOT NULL,
  minio_key       TEXT NOT NULL,
  original_name   TEXT,
  mime_type       TEXT NOT NULL,
  size_bytes      BIGINT NOT NULL,
  scan_result     TEXT DEFAULT 'pending'
                  CHECK (scan_result IN ('pending', 'clean', 'infected')),
  uploaded_at     TIMESTAMPTZ DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE gateway.artifacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  app_id          UUID NOT NULL REFERENCES marketplace.apps(id),
  session_id      TEXT NOT NULL,
  filename        TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size_bytes      BIGINT NOT NULL,
  minio_key       TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  downloaded_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE gateway.embed_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  app_id      UUID NOT NULL REFERENCES marketplace.apps(id),
  session_id  TEXT NOT NULL,
  token_hash  TEXT UNIQUE NOT NULL,
  ip_hash     TEXT,
  ua_hash     TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

---

### schema: deployments

```sql
CREATE TABLE deployments.deployments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id           UUID NOT NULL REFERENCES marketplace.apps(id),
  creator_id       UUID NOT NULL REFERENCES auth.users(id),
  coolify_app_id   TEXT UNIQUE,
  github_repo      TEXT NOT NULL,
  github_branch    TEXT NOT NULL DEFAULT 'main',
  framework        TEXT,  -- 'nextjs' | 'python' | 'streamlit' | 'static'
  env_secrets_enc  TEXT,  -- AES-256-GCM; nonce prepended to ciphertext
  status           TEXT DEFAULT 'pending'
                   CHECK (status IN ('pending', 'building', 'live', 'failed', 'stopped')),
  health_status    TEXT DEFAULT 'unknown'
                   CHECK (health_status IN ('healthy', 'unhealthy', 'unknown')),
  subdomain        TEXT UNIQUE,  -- UNIQUE: one subdomain per deployment, prevents DNS confusion
  deployed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE deployments.deploy_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id  UUID NOT NULL REFERENCES deployments.deployments(id),
  level          TEXT CHECK (level IN ('info', 'warn', 'error')),
  message        TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE deployments.github_connections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id       UUID NOT NULL REFERENCES auth.users(id),
  github_user_id   TEXT NOT NULL,
  access_token_enc TEXT NOT NULL,  -- AES-256-GCM encrypted; nonce prepended to ciphertext
  scope            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(creator_id)
);

-- Webhook idempotency store for Razorpay and GitHub events
-- Prevents duplicate processing from webhook retries or replays
CREATE TABLE deployments.webhook_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source       TEXT NOT NULL CHECK (source IN ('razorpay', 'github')),
  event_id     TEXT NOT NULL,        -- Razorpay event ID or GitHub delivery ID
  payload_hash TEXT NOT NULL,        -- SHA256 of raw payload body
  processed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source, event_id)
);
```

---

### schema: optimizer

```sql
-- All fields hashed or anonymised. No PII stored.
CREATE TABLE optimizer.interaction_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id           UUID NOT NULL REFERENCES marketplace.apps(id),
  session_hash     TEXT NOT NULL,  -- SHA256(user_id + app_id + week_number); rotated weekly
  model            TEXT NOT NULL,
  strategy         TEXT,
  latency_ms       INTEGER,
  regenerate_count INTEGER DEFAULT 0,
  follow_up_intent TEXT
                   CHECK (follow_up_intent IN ('correction', 'building_on', 'topic_change', 'clarification', 'abandonment')),
  user_signal      TEXT
                   CHECK (user_signal IN ('thumbs_up', 'thumbs_down', 'inline_correction', 'none')),
  artifact_opened  BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE optimizer.analysis_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id       UUID NOT NULL REFERENCES marketplace.apps(id),
  ran_at       TIMESTAMPTZ DEFAULT now(),
  sample_size  INTEGER,
  findings     JSONB
);

CREATE TABLE optimizer.suggestions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id           UUID NOT NULL REFERENCES marketplace.apps(id),
  analysis_run_id  UUID REFERENCES optimizer.analysis_runs(id),
  type             TEXT CHECK (type IN ('prompt', 'model', 'temperature', 'system_instruction', 'kmodel_config')),
  diff             JSONB NOT NULL,
  status           TEXT DEFAULT 'pending'
                   CHECK (status IN ('pending', 'applied', 'dismissed')),
  created_at       TIMESTAMPTZ DEFAULT now()
);
```

---

### schema: notifications

```sql
CREATE TABLE notifications.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  data        JSONB,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

---

### schema: audit

```sql
-- Append-only. No updates or deletes ever. DB policy enforces this.
-- Partitioned by year for 7-year retention management.
CREATE TABLE audit.log (
  id          UUID NOT NULL DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES auth.users(id),
  actor_role  TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  metadata    JSONB,
  ip_hash     TEXT,  -- SHA256(ip_address + static_salt); raw IP is PII under GDPR, never stored
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (id, created_at)  -- partition key must be part of primary key
) PARTITION BY RANGE (created_at);

-- Annual partitions created at year start; old partitions archived after 7 years
CREATE TABLE audit.log_2026 PARTITION OF audit.log
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE audit.log_2027 PARTITION OF audit.log
  FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

-- Additional partitions created by ops script each January
```

---

## 2. Indexes

Performance-critical indexes not implied by PRIMARY KEY or UNIQUE constraints:

```sql
-- Marketplace browsing
CREATE INDEX ON marketplace.channels(creator_id);
CREATE INDEX ON marketplace.channels(status) WHERE deleted_at IS NULL;
CREATE INDEX ON marketplace.apps(channel_id);
CREATE INDEX ON marketplace.apps(status) WHERE deleted_at IS NULL;

-- Subscription checks (executed on every app load to verify access)
CREATE INDEX ON subscriptions.subscriptions(user_id, status);
CREATE INDEX ON subscriptions.subscriptions(plan_id);

-- Billing history (user account page)
CREATE INDEX ON gateway.api_calls(user_id, created_at DESC);

-- Creator analytics dashboard
CREATE INDEX ON gateway.api_calls(app_id, created_at DESC);

-- ClamAV scan worker queue (polls for pending scans)
CREATE INDEX ON gateway.uploads(scan_result) WHERE scan_result = 'pending';

-- Weekly optimizer analysis job
CREATE INDEX ON optimizer.interaction_logs(app_id, created_at DESC);

-- Unread notification badge (fetched on every page load)
CREATE INDEX ON notifications.notifications(user_id, read_at) WHERE read_at IS NULL;

-- Audit log queries by actor
CREATE INDEX ON audit.log(actor_id, created_at DESC);
```

---

## 3. Row-Level Security

RLS is enabled on every table containing user or creator data. Each service sets `app.current_user_id` on its DB connection before querying.

```sql
-- Example: users see only their own subscriptions
ALTER TABLE subscriptions.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_owns_subscription ON subscriptions.subscriptions
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid);

-- Creators see only subscriptions to their own plans
CREATE POLICY creator_sees_plan_subscriptions ON subscriptions.subscriptions
  FOR SELECT
  USING (plan_id IN (
    SELECT id FROM subscriptions.plans
    WHERE
      (type = 'channel' AND channel_id IN (
        SELECT id FROM marketplace.channels WHERE creator_id =
          current_setting('app.current_creator_id')::uuid
      )) OR
      (type = 'app' AND app_id IN (
        SELECT id FROM marketplace.apps WHERE channel_id IN (
          SELECT id FROM marketplace.channels WHERE creator_id =
            current_setting('app.current_creator_id')::uuid
        )
      ))
  ));
```

RLS policies applied to all tables in: `subscriptions`, `gateway`, `deployments`, `optimizer`, `marketplace`.

---

## 4. Encryption at Rest

| Data | Encryption | Where key lives | Nonce storage |
|------|-----------|----------------|---------------|
| `deployments.env_secrets_enc` | AES-256-GCM | VPS env var `SECRETS_KEY` | Prepended to ciphertext |
| `auth.totp_credentials.secret_enc` | AES-256-GCM | VPS env var `TOTP_KEY` | Prepended to ciphertext |
| `deployments.github_connections.access_token_enc` | AES-256-GCM | VPS env var `GITHUB_TOKEN_KEY` | Prepended to ciphertext |
| PostgreSQL data at rest | Hetzner encrypted volumes | Hetzner managed | N/A |

---

## 5. Data Retention & GDPR

### Right to Erasure (cascade pipeline)
```
DELETE auth.users WHERE id = :userId
  → sessions: deleted (cascade)
  → oauth_accounts: deleted (cascade)
  → subscriptions: cancelled + anonymised (user_id → null)
  → credit_ledger: user_id set to null, amounts preserved for accounting
  → api_calls: user_id set to null (accounting record kept)
  → uploads: MinIO objects deleted, DB row deleted
  → artifacts: MinIO objects deleted, DB row deleted
  → notifications: deleted (cascade)
  → optimizer logs: already hashed (nothing to delete)
  → audit log: actor_id set to null (audit trail preserved; ip_hash was never raw IP)
```

### Right to Portability
`GET /api/me/export` returns a JSON file containing:
- Profile data
- Subscription history (no payment details — those stay with Razorpay)
- Credit history (amounts and dates, no prompt content)
- Download history (filenames only)

### Data Minimisation
- Raw prompts and responses are never stored in PostgreSQL
- Optimizer logs use one-way hashes (weekly rotation prevents cross-week tracking)
- File content is never stored — only metadata
- User behaviour analytics use Umami (no cookies, no PII)
- IP addresses are never stored raw — always SHA256 hashed with a static salt

### Residency
All data stored on VPS 1 in Hetzner Nuremberg, Germany (EU).
Backups stored in Hetzner Object Storage (also EU).
