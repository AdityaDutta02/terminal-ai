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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deployments_app_id_idx ON deployments.deployments(app_id);
CREATE INDEX IF NOT EXISTS deployments_status_idx ON deployments.deployments(status);
