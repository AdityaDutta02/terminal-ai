-- Add creator ownership to channels
ALTER TABLE marketplace.channels
  ADD COLUMN IF NOT EXISTS creator_id TEXT REFERENCES "user"("id") ON DELETE SET NULL;
-- Index for fast per-creator lookups
CREATE INDEX IF NOT EXISTS channels_creator_id_idx ON marketplace.channels(creator_id) WHERE deleted_at IS NULL;
-- Add user role column so we can mark creators/admins
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'creator', 'admin'));
