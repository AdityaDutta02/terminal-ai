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
