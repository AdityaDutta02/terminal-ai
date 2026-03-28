-- Migration 002: Credit ledger + webhook events idempotency table
-- Safe to run multiple times (IF NOT EXISTS on all DDL)

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
