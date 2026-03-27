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
