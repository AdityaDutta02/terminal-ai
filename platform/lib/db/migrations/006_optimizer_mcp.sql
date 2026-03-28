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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  key_hash BYTEA NOT NULL UNIQUE,
  label TEXT,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
