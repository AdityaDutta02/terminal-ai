-- platform/lib/db/migrations/015_v2_api.sql

-- Add category/tier columns to apps (alongside existing model_tier)
ALTER TABLE marketplace.apps
  ADD COLUMN IF NOT EXISTS api_category TEXT,
  ADD COLUMN IF NOT EXISTS api_tier TEXT;

-- Admin-managed model routing table
CREATE TABLE IF NOT EXISTS platform.model_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  tier TEXT NOT NULL,
  model_string TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(category, tier, model_string)
);

CREATE INDEX IF NOT EXISTS idx_model_routes_category_tier
  ON platform.model_routes(category, tier)
  WHERE is_active = true;

-- Seed default routes
INSERT INTO platform.model_routes (category, tier, model_string, priority) VALUES
  ('chat',       'fast',    'openai/gpt-4o-mini',              1),
  ('chat',       'good',    'anthropic/claude-haiku-4-5',      1),
  ('chat',       'quality', 'anthropic/claude-sonnet-4-6',     1),
  ('coding',     'fast',    'openai/gpt-4o-mini',              1),
  ('coding',     'good',    'anthropic/claude-sonnet-4-6',     1),
  ('coding',     'quality', 'anthropic/claude-opus-4-6',       1),
  ('image',      'fast',    'google/gemini-flash-image',        1),
  ('image',      'good',    'google/gemini-pro-image',          1),
  ('image',      'quality', 'openai/gpt-image-1',              1),
  ('web_search', 'fast',    'perplexity/sonar',                1),
  ('web_search', 'good',    'perplexity/sonar-pro',            1),
  ('web_search', 'quality', 'perplexity/sonar-reasoning',      1),
  ('web_scrape', 'fast',    'openai/gpt-4o-mini',              1),
  ('web_scrape', 'good',    'anthropic/claude-haiku-4-5',      1),
  ('web_scrape', 'quality', 'anthropic/claude-sonnet-4-6',     1)
ON CONFLICT (category, tier, model_string) DO NOTHING;

-- Migrate existing apps: map model_tier → api_category + api_tier
UPDATE marketplace.apps SET
  api_category = 'chat',
  api_tier = CASE model_tier
    WHEN 'standard'   THEN 'fast'
    WHEN 'advanced'   THEN 'good'
    WHEN 'premium'    THEN 'quality'
    ELSE 'fast'
  END
WHERE api_category IS NULL AND model_tier IN ('standard', 'advanced', 'premium');

UPDATE marketplace.apps SET
  api_category = 'image',
  api_tier = CASE model_tier
    WHEN 'image-fast' THEN 'fast'
    WHEN 'image-pro'  THEN 'quality'
    ELSE 'fast'
  END
WHERE api_category IS NULL AND model_tier IN ('image-fast', 'image-pro');
