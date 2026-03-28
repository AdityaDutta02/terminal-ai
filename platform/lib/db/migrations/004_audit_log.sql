-- Audit log for sensitive actions
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
CREATE INDEX ON audit.events(actor_id, created_at DESC);
CREATE INDEX ON audit.events(action, created_at DESC);
