-- 021_compat_shim.sql
-- Adds per-app flag that gates the /compat/supabase/* gateway namespace.
-- Default false: shim routes return 404 until explicitly enabled.

ALTER TABLE marketplace.apps
  ADD COLUMN IF NOT EXISTS compat_shim_enabled BOOLEAN NOT NULL DEFAULT false;
