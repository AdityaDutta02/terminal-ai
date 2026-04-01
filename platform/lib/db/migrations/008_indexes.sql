-- Speed up credit balance queries (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_recent
  ON subscriptions.credit_ledger(user_id, created_at DESC);

-- Speed up embed token lookups (hot path: every gateway request)
CREATE INDEX IF NOT EXISTS idx_embed_tokens_hash_active
  ON gateway.embed_tokens(token_hash)
  WHERE expires_at > NOW();

-- Speed up marketplace listing (partial index, live+undeleted only)
CREATE INDEX IF NOT EXISTS idx_apps_active
  ON marketplace.apps(id)
  WHERE deleted_at IS NULL AND status = 'live';

-- Speed up session history queries
CREATE INDEX IF NOT EXISTS idx_api_calls_user_app
  ON gateway.api_calls(user_id, app_id, created_at DESC);
