BEGIN;

CREATE TABLE IF NOT EXISTS platform.user_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public."user"(id),
  reason TEXT NOT NULL,
  banned_by TEXT NOT NULL REFERENCES public."user"(id),
  banned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS platform.channel_suspensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES marketplace.channels(id),
  reason TEXT NOT NULL,
  suspended_by TEXT NOT NULL REFERENCES public."user"(id),
  suspended_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lifted_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS user_bans_user_active
  ON platform.user_bans(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS channel_suspensions_channel_active
  ON platform.channel_suspensions(channel_id) WHERE is_active = true;

COMMIT;
