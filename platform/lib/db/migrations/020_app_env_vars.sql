-- platform/lib/db/migrations/020_app_env_vars.sql
-- Stores encrypted per-app environment variables set by creators.
-- Values are encrypted with AES-256-GCM before insertion (handled in application layer).

CREATE TABLE IF NOT EXISTS deployments.app_env_vars (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      UUID NOT NULL REFERENCES marketplace.apps(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  value_enc   TEXT NOT NULL,
  iv          TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT app_env_vars_app_id_key_unique UNIQUE (app_id, key)
);

CREATE INDEX IF NOT EXISTS app_env_vars_app_id_idx ON deployments.app_env_vars(app_id);
