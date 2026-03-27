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
  credits_per_session INTEGER NOT NULL DEFAULT 50 CHECK (credits_per_session >= 1),
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
