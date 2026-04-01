-- 014_deployments_v2.sql — P2 deployment pipeline hardening

-- Extend deployments.deployments with new tracking columns
ALTER TABLE deployments.deployments
  ADD COLUMN IF NOT EXISTS log_lines JSONB[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS resource_class TEXT NOT NULL DEFAULT 'micro';

-- Deployment events timeline
CREATE TABLE IF NOT EXISTS deployments.deployment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID NOT NULL REFERENCES deployments.deployments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  -- queued, preflight_start, preflight_ok, preflight_failed,
  -- build_start, build_ok, build_failed,
  -- health_check_start, health_check_ok, health_check_failed,
  -- deployed, failed, retrying, cancelled
  message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS deployment_events_deployment_id_idx
  ON deployments.deployment_events(deployment_id, created_at);
