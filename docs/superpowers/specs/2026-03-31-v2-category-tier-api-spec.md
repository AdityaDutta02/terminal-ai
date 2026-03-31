# v2 — Category/Tier API Abstraction Spec
**Date:** 2026-03-31
**Target:** Post-beta. Simplified app creation and unified AI generation endpoint.

---

## Overview

v2 replaces the direct model-string configuration with a structured category + tier system. App creators select a category and tier instead of configuring models directly. The platform routes to the best model for that combination.

This ships **after beta** — the current `model_tier` system (P0.1) is the beta implementation.

---

## Categories

| Category | ID | Description |
|----------|-----|-------------|
| Simple Chat | `chat` | Conversational AI, Q&A, general purpose |
| Coding | `coding` | Code generation, review, debugging |
| Image Generation | `image` | Generate images from prompts |
| Video Generation | `video` | Generate video clips (long-term) |
| Web Search | `web_search` | Real-time web lookup + synthesis |
| Web Scrape | `web_scrape` | Extract structured data from URLs |

---

## Tiers Per Category

| Tier | Speed | Quality | Cost relative |
|------|-------|---------|---------------|
| `fast` | <1s typical | Good | 1x |
| `good` | 2–5s typical | Better | 4x |
| `quality` | 5–15s typical | Best | 10x |

Not all tiers available for all categories (e.g., `video` is `quality` only).

---

## Model Routing

Platform maintains a routing table mapping `(category, tier)` → model string(s):

```typescript
// platform/lib/model-routing.ts
export const MODEL_ROUTES: Record<string, Record<string, string[]>> = {
  chat: {
    fast:    ['openai/gpt-4o-mini'],
    good:    ['anthropic/claude-haiku-4-5'],
    quality: ['anthropic/claude-sonnet-4-6'],
  },
  coding: {
    fast:    ['openai/gpt-4o-mini'],
    good:    ['anthropic/claude-sonnet-4-6'],
    quality: ['anthropic/claude-opus-4-6'],
  },
  image: {
    fast:    ['google/gemini-flash-image'],
    good:    ['google/gemini-pro-image'],
    quality: ['openai/gpt-image-1'],
  },
  web_search: {
    fast:    ['perplexity/sonar'],
    good:    ['perplexity/sonar-pro'],
    quality: ['perplexity/sonar-reasoning'],
  },
  web_scrape: {
    fast:    ['openai/gpt-4o-mini'],  // with tool use for scraping
    good:    ['anthropic/claude-haiku-4-5'],
    quality: ['anthropic/claude-sonnet-4-6'],
  },
}
```

Platform updates routing table as new/better models become available. App creators don't need to update their apps — routing is transparent.

---

## New API Endpoint: `/v1/generate`

### Request

```typescript
POST /v1/generate
Authorization: Bearer {embed_token}

{
  "category": "chat",
  "tier": "good",
  "messages": [
    { "role": "user", "content": "Explain quantum entanglement" }
  ],
  "system"?: "You are a physics tutor.",
  "stream"?: true,
  "options"?: {
    "max_tokens"?: number,
    "temperature"?: number
  }
}
```

### Response (non-streaming)

```json
{
  "id": "gen_01abc...",
  "category": "chat",
  "tier": "good",
  "model_used": "anthropic/claude-haiku-4-5",
  "content": "Quantum entanglement is...",
  "usage": { "input_tokens": 45, "output_tokens": 312 },
  "credits_charged": 4,
  "latency_ms": 1843
}
```

### Response (streaming)

SSE stream with `data:` lines. Final line includes usage stats.

---

## Schema Additions

```sql
-- migration for v2 (future)

-- Add category/tier to apps
ALTER TABLE marketplace.apps
  ADD COLUMN IF NOT EXISTS api_category TEXT,  -- 'chat', 'coding', 'image', etc.
  ADD COLUMN IF NOT EXISTS api_tier TEXT;       -- 'fast', 'good', 'quality'

-- Drop model_tier column (after v2 ships and data migrated)
-- ALTER TABLE marketplace.apps DROP COLUMN model_tier;

-- Model routing config (admin-managed)
CREATE TABLE IF NOT EXISTS platform.model_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  tier TEXT NOT NULL,
  model_string TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,  -- higher = prefer this model
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(category, tier, model_string)
);
```

---

## Scaffold Template v2

Generated `terminal-ai.config.json`:

```json
{
  "category": "chat",
  "tier": "good",
  "gateway_url": "${TERMINAL_AI_GATEWAY_URL}",
  "app_id": "${TERMINAL_AI_APP_ID}"
}
```

Generated gateway call in scaffolded app:

```typescript
const res = await fetch(`${config.gateway_url}/v1/generate`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    category: config.category,
    tier: config.tier,
    messages,
  }),
})
```

---

## Creator UX Changes

### App Creation Form

New app creation replaces "model tier" dropdown with:

**Step 1: Choose category**
- Large icon cards for each category
- Description of what it's good for

**Step 2: Choose tier**
- Comparison: Fast (speed + cost) / Good (balanced) / Quality (best output)
- Credit cost shown per session for each tier

**Step 3: Review**
- Confirm category + tier + estimated monthly cost

---

## Credit Costs (v2 mapping)

| Category | fast | good | quality |
|----------|------|------|---------|
| chat | 1 | 4 | 6 |
| coding | 1 | 4 | 8 |
| image | 3 | 10 | 93 |
| video | — | — | 250 |
| web_search | 2 | 5 | 10 |
| web_scrape | 2 | 4 | 8 |

Credits per session charged at session start (same billing model as beta).

---

## Migration Path from v1

1. Add `api_category` + `api_tier` columns to apps (alongside `model_tier`)
2. Run migration: map existing `model_tier` values to `(category, tier)`:
   - `standard` → `chat/fast`
   - `advanced` → `chat/good`
   - `premium` → `chat/quality`
   - `image-fast` → `image/fast`
   - `image-pro` → `image/quality`
3. Gateway: route `/v1/chat/completions` + `/v1/generate` both work
4. Scaffold tool: new scaffolds use v2 format; old apps continue on v1
5. After N months: deprecate `/v1/chat/completions`, migrate old apps

---

## Acceptance Criteria

- [ ] POST /v1/generate routes to correct model based on (category, tier)
- [ ] Model routing table is admin-editable without code deploy
- [ ] Scaffolded v2 apps use category/tier, not model strings
- [ ] v1 /v1/chat/completions still works for existing apps
- [ ] Creator dashboard shows category + tier, not raw model string
- [ ] Credit costs match the table above
- [ ] Video generation: tier selector shows "Quality only" with clear explanation
