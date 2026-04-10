-- Run after first admin user has signed up.
-- Get their ID from: SELECT id FROM "user" WHERE email = 'your@email.com';
-- Replace the iframe_url with your actual Coolify deployment URL.

INSERT INTO marketplace.channels (id, slug, name, description) VALUES
  ('00000000-0000-0000-0000-000000000001',
   'first-channel',
   'First Channel',
   'Our first creator channel on Terminal AI.')
ON CONFLICT DO NOTHING;

INSERT INTO marketplace.apps (channel_id, slug, name, description, iframe_url, credits_per_session) VALUES
  ('00000000-0000-0000-0000-000000000001',
   'first-app',
   'First App',
   'The first app on Terminal AI.',
   'https://first-app.apps.terminalai.app',
   30)
ON CONFLICT DO NOTHING;

-- Waitlist system migration
-- Run: psql $DATABASE_URL -f infra/postgres/seed.sql

CREATE TABLE IF NOT EXISTS platform.config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO platform.config (key, value)
  VALUES ('waitlist_mode', 'true')
  ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS platform.waitlist (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        UNIQUE NOT NULL,
  name        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS waitlist_email_idx ON platform.waitlist (email);
CREATE INDEX IF NOT EXISTS waitlist_unnotified_idx
  ON platform.waitlist (notified_at) WHERE notified_at IS NULL;
