-- platform/lib/db/migrations/017_model_pricing.sql

CREATE TABLE IF NOT EXISTS gateway.model_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL UNIQUE,                          -- OpenRouter model ID e.g. "anthropic/claude-sonnet-4-6"
  name TEXT NOT NULL,                                     -- Human-readable name
  provider TEXT NOT NULL,                                 -- e.g. "anthropic", "openai", "google"
  prompt_cost_per_million NUMERIC NOT NULL DEFAULT 0,     -- $/1M input tokens
  completion_cost_per_million NUMERIC NOT NULL DEFAULT 0, -- $/1M output tokens
  context_length INTEGER,                                 -- max context window
  max_completion_tokens INTEGER,                          -- max output tokens
  credit_cost INTEGER NOT NULL DEFAULT 1,                 -- precomputed: ceil(max_real_cost / 0.40)
  is_available BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_pricing_available
  ON gateway.model_pricing (model_id)
  WHERE is_available = true;
