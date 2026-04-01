-- Extend audit.events with request tracing columns
ALTER TABLE audit.events
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS request_id TEXT;
