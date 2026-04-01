-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Schemas
CREATE SCHEMA IF NOT EXISTS marketplace;
CREATE SCHEMA IF NOT EXISTS gateway;

-- Better Auth tables (public schema)
CREATE TABLE IF NOT EXISTS "user" (
  "id"            TEXT PRIMARY KEY,
  "name"          TEXT NOT NULL,
  "email"         TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "image"         TEXT,
  "credits"       INTEGER NOT NULL DEFAULT 200,
  "role"          TEXT NOT NULL DEFAULT 'user' CHECK ("role" IN ('user', 'creator', 'admin')),
  "createdAt"     TIMESTAMP NOT NULL,
  "updatedAt"     TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  "id"        TEXT PRIMARY KEY,
  "expiresAt" TIMESTAMP NOT NULL,
  "token"     TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId"    TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id"                     TEXT PRIMARY KEY,
  "accountId"              TEXT NOT NULL,
  "providerId"             TEXT NOT NULL,
  "userId"                 TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken"            TEXT,
  "refreshToken"           TEXT,
  "idToken"                TEXT,
  "accessTokenExpiresAt"   TIMESTAMP,
  "refreshTokenExpiresAt"  TIMESTAMP,
  "scope"                  TEXT,
  "password"               TEXT,
  "createdAt"              TIMESTAMP NOT NULL,
  "updatedAt"              TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id"         TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value"      TEXT NOT NULL,
  "expiresAt"  TIMESTAMP NOT NULL,
  "createdAt"  TIMESTAMP,
  "updatedAt"  TIMESTAMP
);

CREATE TABLE marketplace.channels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  banner_url  TEXT,
  avatar_url  TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE marketplace.apps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id          UUID NOT NULL REFERENCES marketplace.channels(id),
  slug                TEXT NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  thumbnail_url       TEXT,
  iframe_url          TEXT NOT NULL,
  credits_per_session INTEGER NOT NULL DEFAULT 1 CHECK (credits_per_session >= 1),
  status              TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('pending', 'live', 'suspended', 'draft', 'archived')),
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(channel_id, slug)
);

CREATE TABLE gateway.embed_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  app_id      UUID NOT NULL REFERENCES marketplace.apps(id),
  session_id  TEXT NOT NULL,
  token_hash  TEXT UNIQUE NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE gateway.api_calls (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT NOT NULL,
  app_id            UUID NOT NULL REFERENCES marketplace.apps(id),
  session_id        TEXT NOT NULL,
  provider          TEXT NOT NULL,
  model             TEXT NOT NULL,
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  cost_usd          NUMERIC(10, 6),
  credits_charged   INTEGER NOT NULL,
  latency_ms        INTEGER,
  status            TEXT DEFAULT 'success' CHECK (status IN ('success', 'error', 'rate_limited')),
  created_at        TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX ON gateway.embed_tokens(token_hash);
CREATE INDEX ON gateway.embed_tokens(user_id, expires_at);
CREATE INDEX ON gateway.api_calls(user_id, created_at DESC);
CREATE INDEX ON gateway.api_calls(app_id, created_at DESC);
CREATE INDEX ON marketplace.apps(channel_id) WHERE deleted_at IS NULL;

-- ============================================================
-- Migration 002: credit_ledger + webhook_events
-- ============================================================
CREATE SCHEMA IF NOT EXISTS subscriptions;

CREATE TABLE IF NOT EXISTS subscriptions.credit_ledger (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  delta         INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason        TEXT NOT NULL CHECK (reason IN (
    'subscription_grant', 'api_call', 'topup', 'demo', 'welcome', 'refund'
  )),
  app_id        UUID,
  api_call_id   UUID,
  created_at    TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS credit_ledger_user_id_idx
  ON subscriptions.credit_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS subscriptions.webhook_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source     TEXT NOT NULL,
  event_id   TEXT NOT NULL,
  payload    JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(source, event_id)
);

-- Seed existing balances from user.credits (skip users already migrated)
INSERT INTO subscriptions.credit_ledger (user_id, delta, balance_after, reason)
SELECT id, credits, credits, 'welcome'
FROM "user"
WHERE credits > 0
  AND id NOT IN (SELECT DISTINCT user_id FROM subscriptions.credit_ledger);

-- ============================================================
-- Migration 003: creator_ownership
-- ============================================================
-- Add creator ownership to channels
ALTER TABLE marketplace.channels
  ADD COLUMN IF NOT EXISTS creator_id TEXT REFERENCES "user"("id") ON DELETE SET NULL;
-- Index for fast per-creator lookups
CREATE INDEX IF NOT EXISTS channels_creator_id_idx ON marketplace.channels(creator_id) WHERE deleted_at IS NULL;
-- Add user role column so we can mark creators/admins
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'creator', 'admin'));

-- ============================================================
-- Migration 004: audit_log
-- ============================================================
CREATE SCHEMA IF NOT EXISTS audit;
CREATE TABLE IF NOT EXISTS audit.events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    TEXT,
  action      TEXT NOT NULL,
  resource    TEXT,
  resource_id TEXT,
  ip          TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit.events(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit.events(action, created_at DESC);

-- ============================================================
-- Migration 005: deployments
-- ============================================================
ALTER TABLE marketplace.apps ADD COLUMN IF NOT EXISTS github_repo TEXT;
ALTER TABLE marketplace.apps ADD COLUMN IF NOT EXISTS github_branch TEXT NOT NULL DEFAULT 'main';
CREATE SCHEMA IF NOT EXISTS deployments;
CREATE TABLE IF NOT EXISTS deployments.deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES marketplace.apps(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'building', 'live', 'failed', 'suspended')),
  subdomain TEXT NOT NULL UNIQUE,
  github_repo TEXT NOT NULL,
  github_branch TEXT NOT NULL DEFAULT 'main',
  coolify_app_id TEXT,
  dns_record_id TEXT,
  error_message TEXT,
  url TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deployments_app_id_idx ON deployments.deployments(app_id);
CREATE INDEX IF NOT EXISTS deployments_status_idx ON deployments.deployments(status);

-- ============================================================
-- Migration 006: optimizer + mcp
-- ============================================================
CREATE SCHEMA IF NOT EXISTS optimizer;
CREATE TABLE IF NOT EXISTS optimizer.behavioral_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  app_id UUID NOT NULL,
  session_id TEXT NOT NULL,
  api_call_id TEXT NOT NULL,
  response_time_ms INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  user_signal TEXT NOT NULL DEFAULT 'none'
    CHECK (user_signal IN ('thumbs_up', 'thumbs_down', 'inline_correction', 'none')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS signals_app_id_idx ON optimizer.behavioral_signals(app_id);
CREATE INDEX IF NOT EXISTS signals_created_at_idx ON optimizer.behavioral_signals(created_at DESC);
CREATE SCHEMA IF NOT EXISTS mcp;
CREATE TABLE IF NOT EXISTS mcp.api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id   TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  name         TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  prefix       TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_keys_creator_id_idx ON mcp.api_keys(creator_id) WHERE revoked_at IS NULL;

-- ============================================================
-- Migration 007: pricing, free tier, subscriptions, session billing
-- ============================================================

-- Fix default credits: new users start at 0, receive 20 after email verification
ALTER TABLE "user" ALTER COLUMN credits SET DEFAULT 0;

-- Session-based billing columns on apps
ALTER TABLE marketplace.apps
  ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS model_tier VARCHAR(20) NOT NULL DEFAULT 'standard';
-- model_tier values: standard, advanced, premium, image-fast, image-pro

-- Creator balance and superadmin flag on channels
ALTER TABLE marketplace.channels
  ADD COLUMN IF NOT EXISTS creator_balance INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_superadmin_channel BOOLEAN NOT NULL DEFAULT false;

-- Anonymous usage tracking (1 free use per app per IP+cookie)
CREATE TABLE IF NOT EXISTS gateway.anonymous_usage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      UUID NOT NULL REFERENCES marketplace.apps(id),
  ip_address  INET NOT NULL,
  cookie_id   TEXT NOT NULL,
  used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS anon_usage_app_ip_cookie
  ON gateway.anonymous_usage(app_id, ip_address, cookie_id);

-- Embed token: add session billing columns
ALTER TABLE gateway.embed_tokens
  ADD COLUMN IF NOT EXISTS credits_deducted INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deducted_at TIMESTAMPTZ;

-- Allow NULL user_id for anonymous tokens
ALTER TABLE gateway.embed_tokens ALTER COLUMN user_id DROP NOT NULL;

-- Widen credit_ledger reason constraint to support new reason types
ALTER TABLE subscriptions.credit_ledger DROP CONSTRAINT IF EXISTS credit_ledger_reason_check;
ALTER TABLE subscriptions.credit_ledger ADD CONSTRAINT credit_ledger_reason_check
  CHECK (reason IN (
    'subscription_grant', 'api_call', 'topup', 'demo', 'welcome', 'refund',
    'welcome_bonus', 'session_start', 'session_start_rollback',
    'credit_pack_pack_100', 'credit_pack_pack_500', 'credit_pack_pack_2000',
    'subscription_activation_starter', 'subscription_activation_creator', 'subscription_activation_pro',
    'subscription_renewal_starter', 'subscription_renewal_creator', 'subscription_renewal_pro'
  ));

-- Subscription plans (source of truth for plan config)
CREATE TABLE IF NOT EXISTS subscriptions.plans (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  price_inr         INTEGER NOT NULL,
  credits_per_month INTEGER NOT NULL,
  razorpay_plan_id  TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default plans
INSERT INTO subscriptions.plans (id, name, price_inr, credits_per_month)
VALUES
  ('starter', 'Starter', 14900, 250),
  ('creator', 'Creator', 29900, 650),
  ('pro', 'Pro', 59900, 1400)
ON CONFLICT (id) DO NOTHING;

-- User subscriptions
CREATE TABLE IF NOT EXISTS subscriptions.user_subscriptions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   TEXT NOT NULL REFERENCES "user"(id),
  plan_id                   TEXT NOT NULL REFERENCES subscriptions.plans(id),
  razorpay_subscription_id  TEXT UNIQUE,
  status                    TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'paused', 'cancelled', 'expired')),
  current_period_start      TIMESTAMPTZ,
  current_period_end        TIMESTAMPTZ,
  credits_granted_at        TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_subs_user_id ON subscriptions.user_subscriptions(user_id);

-- Credit pack one-time purchases
CREATE TABLE IF NOT EXISTS subscriptions.credit_pack_purchases (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT NOT NULL REFERENCES "user"(id),
  pack_id             TEXT NOT NULL,
  credits             INTEGER NOT NULL,
  price_inr           INTEGER NOT NULL,
  razorpay_order_id   TEXT UNIQUE,
  razorpay_payment_id TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Platform schema for cron and system tables
CREATE SCHEMA IF NOT EXISTS platform;

-- Cron job run log
CREATE TABLE IF NOT EXISTS platform.cron_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name      TEXT NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'running',
  rows_affected INTEGER,
  error         TEXT
);
