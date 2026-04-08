-- platform/lib/db/migrations/009_app_storage.sql
CREATE TABLE IF NOT EXISTS deployments.app_db_provisions (
  app_id      UUID PRIMARY KEY REFERENCES marketplace.apps(id) ON DELETE CASCADE,
  schema_name TEXT NOT NULL,
  role_name   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
