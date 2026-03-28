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
