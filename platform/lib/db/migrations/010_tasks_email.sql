-- 010_tasks_email.sql
-- Scheduled tasks and email audit tables for gateway

-- Scheduled task definitions
CREATE TABLE gateway.scheduled_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          UUID NOT NULL,
  user_id         TEXT NOT NULL,
  name            TEXT NOT NULL,
  schedule        TEXT NOT NULL,
  callback_path   TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  timezone        TEXT NOT NULL DEFAULT 'UTC',
  enabled         BOOLEAN NOT NULL DEFAULT true,
  next_run_at     TIMESTAMPTZ,
  last_run_at     TIMESTAMPTZ,
  last_run_status TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(app_id, name)
);

-- Index for the task runner's polling query
CREATE INDEX idx_scheduled_tasks_due
  ON gateway.scheduled_tasks (next_run_at)
  WHERE enabled = true;

-- Task execution log
CREATE TABLE gateway.task_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL REFERENCES gateway.scheduled_tasks(id) ON DELETE CASCADE,
  fired_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT NOT NULL,
  response_code   INTEGER,
  latency_ms      INTEGER,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT
);

CREATE INDEX idx_task_executions_task
  ON gateway.task_executions (task_id, fired_at DESC);

-- Email audit log
CREATE TABLE gateway.email_sends (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          UUID NOT NULL,
  user_id         TEXT NOT NULL,
  recipient       TEXT NOT NULL,
  subject         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'sent',
  message_id      TEXT,
  credits_charged INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_sends_app
  ON gateway.email_sends (app_id, created_at DESC);
