-- infra/postgres/migrations/007_pricing.sql
-- Run: docker cp infra/postgres/migrations/007_pricing.sql <postgres-container>:/tmp/
-- Then: docker exec -it <postgres-container> psql -U postgres -d terminalai -f /tmp/007_pricing.sql

BEGIN;

-- Fix default credits (new users should start at 0, get 20 after verification)
ALTER TABLE public."user" ALTER COLUMN credits SET DEFAULT 0;

-- NOTE: min_credits_per_session column did not exist, skipping data migration
-- UPDATE marketplace.apps SET credits_per_session = COALESCE(min_credits_per_session, 0) WHERE min_credits_per_session IS NOT NULL;

-- Session-based billing + free app + model tier on apps
ALTER TABLE marketplace.apps
  ADD COLUMN IF NOT EXISTS credits_per_session INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS model_tier VARCHAR(20) NOT NULL DEFAULT 'standard';

-- Creator balance + superadmin flag on channels
ALTER TABLE marketplace.channels
  ADD COLUMN IF NOT EXISTS creator_balance INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_superadmin_channel BOOLEAN NOT NULL DEFAULT false;

-- Anonymous usage tracking (1 free use per app per IP+cookie)
CREATE TABLE IF NOT EXISTS gateway.anonymous_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES marketplace.apps(id),
  ip_address INET NOT NULL,
  cookie_id TEXT NOT NULL,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS anon_usage_app_ip_cookie
  ON gateway.anonymous_usage(app_id, ip_address, cookie_id);

-- Embed token: track credits deducted at session start
ALTER TABLE gateway.embed_tokens
  ADD COLUMN IF NOT EXISTS credits_deducted INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deducted_at TIMESTAMPTZ;

CREATE SCHEMA IF NOT EXISTS subscriptions;

-- Subscription plans (source of truth for plan config)
CREATE TABLE IF NOT EXISTS subscriptions.plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_inr INTEGER NOT NULL,
  credits_per_month INTEGER NOT NULL,
  razorpay_plan_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO subscriptions.plans (id, name, price_inr, credits_per_month) VALUES
  ('starter', 'Starter', 14900, 250),
  ('creator', 'Creator', 29900, 650),
  ('pro',     'Pro',     59900, 1400)
ON CONFLICT (id) DO UPDATE SET
  price_inr = EXCLUDED.price_inr,
  credits_per_month = EXCLUDED.credits_per_month;

-- User subscriptions
CREATE TABLE IF NOT EXISTS subscriptions.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public."user"(id),
  plan_id TEXT NOT NULL REFERENCES subscriptions.plans(id),
  razorpay_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'halted', 'cancelled', 'expired', 'completed')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  credits_granted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_subs_user_id ON subscriptions.user_subscriptions(user_id);

-- One-time credit pack purchases
CREATE TABLE IF NOT EXISTS subscriptions.credit_pack_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public."user"(id),
  pack_id TEXT NOT NULL,
  credits INTEGER NOT NULL,
  price_inr INTEGER NOT NULL,
  razorpay_order_id TEXT UNIQUE,
  razorpay_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS credit_pack_purchases_user_id ON subscriptions.credit_pack_purchases(user_id);

-- Cron job run log
CREATE SCHEMA IF NOT EXISTS platform;
CREATE TABLE IF NOT EXISTS platform.cron_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  rows_affected INTEGER,
  error TEXT
);
CREATE INDEX IF NOT EXISTS cron_runs_job_name_started ON platform.cron_runs(job_name, started_at DESC);

COMMIT;
