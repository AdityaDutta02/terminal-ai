# v2 — Category/Tier API Abstraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace direct model-string configuration with a structured category + tier system. App creators choose a category (chat, coding, image, etc.) and tier (fast/good/quality). Platform routes to the best model automatically.

**Architecture:** New `POST /v1/generate` gateway endpoint routes to correct model via an admin-editable routing table (`platform.model_routes`). The existing `POST /v1/chat/completions` continues working for existing apps. New scaffold templates use category/tier.

**Tech Stack:** Hono (gateway), PostgreSQL (`platform` schema), Next.js 15 App Router (admin UI), TypeScript.

---

### Task 1: Migration — api_category/api_tier on apps + model_routes table

**Files:**
- Create: `platform/lib/db/migrations/015_v2_api.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply migration**

```bash
psql $DATABASE_URL -f platform/lib/db/migrations/015_v2_api.sql
```

Expected: `ALTER TABLE`, `CREATE TABLE`, `CREATE INDEX`, rows inserted/updated.

- [ ] **Step 3: Verify seed data**

```bash
psql $DATABASE_URL -c "SELECT category, tier, model_string FROM platform.model_routes ORDER BY category, tier"
```

Expected: 15 rows covering all category/tier combinations.

- [ ] **Step 4: Commit**

```bash
git add platform/lib/db/migrations/015_v2_api.sql
git commit -m "feat(db): v2 api_category/api_tier columns + model_routes table with seed data"
```

---

### Task 2: Gateway — model routing library

**Files:**
- Create: `gateway/src/lib/model-routing.ts`

- [ ] **Step 1: Write the failing test**

Create `gateway/src/lib/model-routing.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db', () => ({
  db: {
    query: vi.fn().mockResolvedValue({
      rows: [{ model_string: 'anthropic/claude-haiku-4-5' }]
    })
  }
}))

import { resolveModel, CREDIT_COSTS_V2 } from './model-routing'

describe('resolveModel', () => {
  it('returns model string for valid category/tier', async () => {
    const model = await resolveModel('chat', 'good')
    expect(model).toBe('anthropic/claude-haiku-4-5')
  })

  it('throws for unknown category', async () => {
    const { db } = await import('../db')
    vi.mocked(db.query).mockResolvedValueOnce({ rows: [] })
    await expect(resolveModel('invalid', 'fast')).rejects.toThrow('No model route found')
  })
})

describe('CREDIT_COSTS_V2', () => {
  it('has costs for all category/tier combinations', () => {
    expect(CREDIT_COSTS_V2['chat']['fast']).toBe(1)
    expect(CREDIT_COSTS_V2['chat']['good']).toBe(4)
    expect(CREDIT_COSTS_V2['chat']['quality']).toBe(6)
    expect(CREDIT_COSTS_V2['image']['quality']).toBe(93)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd gateway && npx vitest run src/lib/model-routing.test.ts
```

Expected: FAIL — cannot find module `./model-routing`.

- [ ] **Step 3: Implement model-routing.ts**

```typescript
// gateway/src/lib/model-routing.ts
import { db } from '../db'

export type Category = 'chat' | 'coding' | 'image' | 'web_search' | 'web_scrape'
export type Tier = 'fast' | 'good' | 'quality'

/** Credit costs per (category, tier) — used at session billing time */
export const CREDIT_COSTS_V2: Record<string, Record<string, number>> = {
  chat:       { fast: 1, good: 4, quality: 6 },
  coding:     { fast: 1, good: 4, quality: 8 },
  image:      { fast: 3, good: 10, quality: 93 },
  video:      { quality: 250 },
  web_search: { fast: 2, good: 5, quality: 10 },
  web_scrape: { fast: 2, good: 4, quality: 8 },
}

/**
 * Resolve the model string for a (category, tier) pair.
 * Reads from the admin-managed platform.model_routes table.
 * Returns the highest-priority active route.
 */
export async function resolveModel(category: string, tier: string): Promise<string> {
  const { rows } = await db.query(
    `SELECT model_string
     FROM platform.model_routes
     WHERE category = $1 AND tier = $2 AND is_active = true
     ORDER BY priority DESC
     LIMIT 1`,
    [category, tier]
  )
  if (rows.length === 0) {
    throw new Error(`No model route found for category=${category} tier=${tier}`)
  }
  return (rows[0] as { model_string: string }).model_string
}

/**
 * Get credit cost for a (category, tier) combination.
 * Returns null if category/tier is not recognized.
 */
export function getCreditCost(category: string, tier: string): number | null {
  return CREDIT_COSTS_V2[category]?.[tier] ?? null
}

export const VALID_CATEGORIES = new Set(['chat', 'coding', 'image', 'web_search', 'web_scrape'])
export const VALID_TIERS = new Set(['fast', 'good', 'quality'])
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd gateway && npx vitest run src/lib/model-routing.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gateway/src/lib/model-routing.ts gateway/src/lib/model-routing.test.ts
git commit -m "feat(gateway): model routing library — resolveModel + CREDIT_COSTS_V2"
```

---

### Task 3: Gateway — POST /v1/generate endpoint

**Files:**
- Create: `gateway/src/routes/generate.ts`
- Modify: `gateway/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `gateway/src/routes/generate.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/model-routing', () => ({
  resolveModel: vi.fn().mockResolvedValue('anthropic/claude-haiku-4-5'),
  getCreditCost: vi.fn().mockReturnValue(4),
  VALID_CATEGORIES: new Set(['chat', 'coding']),
  VALID_TIERS: new Set(['fast', 'good', 'quality']),
}))
vi.mock('../db', () => ({
  db: { query: vi.fn().mockResolvedValue({ rows: [] }) }
}))
vi.mock('../lib/openrouter', () => ({
  callOpenRouter: vi.fn().mockResolvedValue({
    content: 'Hello world',
    usage: { prompt_tokens: 10, completion_tokens: 20 },
  })
}))

// Import after mocks
const { handleGenerate } = await import('./generate')

describe('handleGenerate', () => {
  it('returns 400 for missing category', async () => {
    const ctx = {
      req: { json: () => Promise.resolve({ tier: 'good', messages: [] }) },
      json: vi.fn(),
      get: vi.fn().mockReturnValue({ userId: 'user-1', appId: 'app-1', creditsCharged: 4 }),
    }
    await handleGenerate(ctx as unknown as Parameters<typeof handleGenerate>[0])
    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('category') }),
      400
    )
  })

  it('returns generate response with model_used', async () => {
    const ctx = {
      req: { json: () => Promise.resolve({ category: 'chat', tier: 'good', messages: [{ role: 'user', content: 'hi' }] }) },
      json: vi.fn(),
      get: vi.fn().mockReturnValue({ userId: 'user-1', appId: 'app-1', creditsCharged: 4 }),
    }
    await handleGenerate(ctx as unknown as Parameters<typeof handleGenerate>[0])
    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'chat',
        tier: 'good',
        model_used: 'anthropic/claude-haiku-4-5',
      })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd gateway && npx vitest run src/routes/generate.test.ts
```

Expected: FAIL — cannot find module `./generate`.

- [ ] **Step 3: Implement generate.ts**

```typescript
// gateway/src/routes/generate.ts
import type { Context } from 'hono'
import { resolveModel, getCreditCost, VALID_CATEGORIES, VALID_TIERS } from '../lib/model-routing'
import { db } from '../db'
import { logger } from '../lib/logger'

interface GenerateBody {
  category: string
  tier: string
  messages: Array<{ role: string; content: string }>
  system?: string
  stream?: boolean
  options?: { max_tokens?: number; temperature?: number }
}

interface OpenRouterMessage {
  role: string
  content: string
}

interface OpenRouterResponse {
  content: string
  usage: { prompt_tokens: number; completion_tokens: number }
}

async function callOpenRouter(
  model: string,
  messages: OpenRouterMessage[],
  system?: string,
  options?: { max_tokens?: number; temperature?: number }
): Promise<OpenRouterResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set')

  const body: Record<string, unknown> = {
    model,
    messages: system
      ? [{ role: 'system', content: system }, ...messages]
      : messages,
    max_tokens: options?.max_tokens ?? 2048,
    temperature: options?.temperature ?? 0.7,
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://terminalai.app',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenRouter error: ${res.status} ${text}`)
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>
    usage: { prompt_tokens: number; completion_tokens: number }
  }

  return {
    content: data.choices[0]?.message?.content ?? '',
    usage: data.usage,
  }
}

export async function handleGenerate(c: Context): Promise<Response> {
  const tokenData = c.get('tokenData') as { userId: string; appId: string; creditsCharged: number } | undefined
  if (!tokenData) return c.json({ error: 'Unauthorized' }, 401)

  let body: GenerateBody
  try {
    body = await c.req.json() as GenerateBody
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const { category, tier, messages, system, options } = body

  if (!category || !VALID_CATEGORIES.has(category)) {
    return c.json(
      { error: `Invalid category. Must be one of: ${[...VALID_CATEGORIES].join(', ')}` },
      400
    )
  }
  if (!tier || !VALID_TIERS.has(tier)) {
    return c.json(
      { error: `Invalid tier. Must be one of: fast, good, quality` },
      400
    )
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return c.json({ error: 'messages array is required and must not be empty' }, 400)
  }

  const creditCost = getCreditCost(category, tier)
  if (creditCost === null) {
    return c.json({ error: `No credit cost defined for ${category}/${tier}` }, 400)
  }

  let modelString: string
  try {
    modelString = await resolveModel(category, tier)
  } catch (err) {
    logger.error({ msg: 'model_route_not_found', category, tier, err: String(err) })
    return c.json({ error: `No model available for ${category}/${tier}` }, 503)
  }

  const startMs = Date.now()
  let response: OpenRouterResponse
  try {
    response = await callOpenRouter(modelString, messages, system, options)
  } catch (err) {
    logger.error({ msg: 'openrouter_error', modelString, err: String(err) })
    return c.json({ error: 'AI service error. Please try again.' }, 502)
  }
  const latencyMs = Date.now() - startMs

  // Log the API call
  await db.query(
    `INSERT INTO gateway.api_calls (user_id, app_id, model, credits_used, input_tokens, output_tokens, latency_ms, api_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'v2')`,
    [
      tokenData.userId,
      tokenData.appId,
      modelString,
      creditCost,
      response.usage.prompt_tokens,
      response.usage.completion_tokens,
      latencyMs,
    ]
  ).catch((err: unknown) => logger.warn({ msg: 'api_call_log_failed', err: String(err) }))

  return c.json({
    id: `gen_${Date.now()}`,
    category,
    tier,
    model_used: modelString,
    content: response.content,
    usage: {
      input_tokens: response.usage.prompt_tokens,
      output_tokens: response.usage.completion_tokens,
    },
    credits_charged: creditCost,
    latency_ms: latencyMs,
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd gateway && npx vitest run src/routes/generate.test.ts
```

Expected: PASS.

- [ ] **Step 5: Register route in gateway index**

In `gateway/src/index.ts`, add after the existing route registrations:

```typescript
import { handleGenerate } from './routes/generate'

// After existing routes:
app.post('/v1/generate', embedTokenAuth, handleGenerate)
```

- [ ] **Step 6: Commit**

```bash
git add gateway/src/routes/generate.ts gateway/src/routes/generate.test.ts gateway/src/index.ts
git commit -m "feat(gateway): POST /v1/generate endpoint with category/tier routing (v2)"
```

---

### Task 4: Platform — admin model routes management UI

**Files:**
- Create: `platform/app/api/admin/model-routes/route.ts`
- Create: `platform/app/admin/model-routes/page.tsx`
- Create: `platform/app/admin/model-routes/model-routes-table.tsx`

- [ ] **Step 1: Create admin API for model routes**

```typescript
// platform/app/api/admin/model-routes/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { headers } from 'next/headers'
import { z } from 'zod'

async function requireAdmin(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  const { rows } = await db.query(
    `SELECT role FROM public.user WHERE id = $1`, [session.user.id]
  )
  if (rows.length === 0 || (rows[0] as { role: string }).role !== 'admin') return null
  return session
}

export async function GET(req: Request): Promise<Response> {
  const session = await requireAdmin(req)
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { rows } = await db.query(
    `SELECT id, category, tier, model_string, priority, is_active, updated_at
     FROM platform.model_routes
     ORDER BY category, tier, priority DESC`
  )
  return NextResponse.json({ routes: rows })
}

const createRouteSchema = z.object({
  category: z.string().min(1).max(50),
  tier: z.enum(['fast', 'good', 'quality']),
  model_string: z.string().min(1).max(200),
  priority: z.number().int().min(0).max(100).default(1),
})

export async function POST(req: Request): Promise<Response> {
  const session = await requireAdmin(req)
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = createRouteSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { category, tier, model_string, priority } = parsed.data
  const { rows } = await db.query(
    `INSERT INTO platform.model_routes (category, tier, model_string, priority)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (category, tier, model_string) DO UPDATE SET priority = $4, is_active = true, updated_at = NOW()
     RETURNING id`,
    [category, tier, model_string, priority]
  )

  return NextResponse.json({ id: (rows[0] as { id: string }).id })
}
```

- [ ] **Step 2: Create toggle active endpoint**

```typescript
// platform/app/api/admin/model-routes/[routeId]/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { headers } from 'next/headers'
import { z } from 'zod'

const patchSchema = z.object({
  is_active: z.boolean().optional(),
  priority: z.number().int().min(0).max(100).optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ routeId: string }> }
): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { rows: userRows } = await db.query(
    `SELECT role FROM public.user WHERE id = $1`, [session.user.id]
  )
  if (userRows.length === 0 || (userRows[0] as { role: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = patchSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { routeId } = await params
  const updates: string[] = ['updated_at = NOW()']
  const values: unknown[] = [routeId]

  if (parsed.data.is_active !== undefined) {
    updates.push(`is_active = $${values.length + 1}`)
    values.push(parsed.data.is_active)
  }
  if (parsed.data.priority !== undefined) {
    updates.push(`priority = $${values.length + 1}`)
    values.push(parsed.data.priority)
  }

  await db.query(
    `UPDATE platform.model_routes SET ${updates.join(', ')} WHERE id = $1`,
    values
  )

  return NextResponse.json({ updated: true })
}
```

- [ ] **Step 3: Create model routes admin page**

```typescript
// platform/app/admin/model-routes/page.tsx
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { ModelRoutesTable } from './model-routes-table'

export default async function ModelRoutesPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')

  const { rows: userRows } = await db.query(
    `SELECT role FROM public.user WHERE id = $1`, [session.user.id]
  )
  if (!userRows.length || (userRows[0] as { role: string }).role !== 'admin') {
    redirect('/dashboard')
  }

  const { rows } = await db.query(
    `SELECT id, category, tier, model_string, priority, is_active, updated_at
     FROM platform.model_routes
     ORDER BY category, tier, priority DESC`
  )

  return (
    <div className="dark max-w-5xl mx-auto px-6 py-8 bg-background min-h-screen text-foreground">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Model Routing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Admin-editable model routing table. Changes take effect immediately — no deploy needed.
        </p>
      </div>
      <ModelRoutesTable initialRoutes={rows as Array<Record<string, unknown>>} />
    </div>
  )
}
```

- [ ] **Step 4: Create the client table component**

```typescript
// platform/app/admin/model-routes/model-routes-table.tsx
'use client'
import { useState } from 'react'

type ModelRoute = {
  id: string
  category: string
  tier: string
  model_string: string
  priority: number
  is_active: boolean
  updated_at: string
}

export function ModelRoutesTable({ initialRoutes }: { initialRoutes: Array<Record<string, unknown>> }) {
  const [routes, setRoutes] = useState<ModelRoute[]>(initialRoutes as unknown as ModelRoute[])

  async function toggleActive(routeId: string, currentValue: boolean) {
    await fetch(`/api/admin/model-routes/${routeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !currentValue }),
    })
    setRoutes((prev) =>
      prev.map((r) => r.id === routeId ? { ...r, is_active: !currentValue } : r)
    )
  }

  const categories = [...new Set(routes.map((r) => r.category))]

  return (
    <div className="space-y-8">
      {categories.map((cat) => (
        <div key={cat}>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
            {cat}
          </h2>
          <div className="border border-border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Tier</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Model</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Priority</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Active</th>
                </tr>
              </thead>
              <tbody>
                {routes
                  .filter((r) => r.category === cat)
                  .map((route) => (
                    <tr key={route.id} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs">{route.tier}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                        {route.model_string}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">{route.priority}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => void toggleActive(route.id, route.is_active)}
                          className={`text-xs font-medium ${
                            route.is_active
                              ? 'text-green-500 hover:text-green-600'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {route.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add platform/app/api/admin/model-routes/ platform/app/admin/model-routes/
git commit -m "feat(platform): admin model routes management UI + API (v2)"
```

---

### Task 5: Scaffold tool — v2 template

**Files:**
- Create: `scaffold/templates/v2-chat/terminal-ai.config.json`
- Create: `scaffold/templates/v2-chat/lib/terminal-ai.ts`
- Modify: `mcp-server/src/tools/scaffold_app.ts` (or equivalent scaffold tool)

- [ ] **Step 1: Find scaffold tool**

```bash
find . -name "scaffold*" -type f | grep -v node_modules | grep -v ".git"
```

Locate the scaffold tool file. It's likely in `mcp-server/src/tools/` or `scaffold/`.

- [ ] **Step 2: Create v2 config template**

```json
// scaffold/templates/v2-chat/terminal-ai.config.json
{
  "category": "chat",
  "tier": "good",
  "gateway_url": "${TERMINAL_AI_GATEWAY_URL}",
  "app_id": "${TERMINAL_AI_APP_ID}"
}
```

- [ ] **Step 3: Create v2 gateway client helper**

```typescript
// scaffold/templates/v2-chat/lib/terminal-ai.ts

/**
 * Terminal AI v2 gateway client.
 * Uses category/tier routing — no model string needed.
 */

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface GenerateOptions {
  system?: string
  maxTokens?: number
  temperature?: number
}

interface GenerateResult {
  content: string
  modelUsed: string
  creditsCharged: number
  latencyMs: number
}

export async function generate(
  token: string,
  messages: Message[],
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const config = getConfig()

  const res = await fetch(`${config.gatewayUrl}/v1/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      category: config.category,
      tier: config.tier,
      messages,
      system: options.system,
      options: {
        max_tokens: options.maxTokens,
        temperature: options.temperature,
      },
    }),
  })

  if (!res.ok) {
    const error = await res.json() as { error: string }
    throw new Error(error.error ?? `Gateway error: ${res.status}`)
  }

  const data = await res.json() as {
    content: string
    model_used: string
    credits_charged: number
    latency_ms: number
  }

  return {
    content: data.content,
    modelUsed: data.model_used,
    creditsCharged: data.credits_charged,
    latencyMs: data.latency_ms,
  }
}

interface AppConfig {
  category: string
  tier: string
  gatewayUrl: string
  appId: string
}

function getConfig(): AppConfig {
  // In a real app, load from terminal-ai.config.json or env vars
  return {
    category: process.env.TERMINAL_AI_CATEGORY ?? 'chat',
    tier: process.env.TERMINAL_AI_TIER ?? 'good',
    gatewayUrl: process.env.TERMINAL_AI_GATEWAY_URL ?? '',
    appId: process.env.TERMINAL_AI_APP_ID ?? '',
  }
}
```

- [ ] **Step 4: Update scaffold MCP tool to generate v2 config**

Find the scaffold tool in the MCP server. Update the generated `terminal-ai.config.json` to use `category` + `tier` instead of `model_tier`:

The scaffold tool should accept `category` and `tier` parameters (falling back to `chat` + `good` as defaults), and generate:

```typescript
// In scaffold tool handler — replace model_tier generation with:
const configJson = JSON.stringify({
  category: params.category ?? 'chat',
  tier: params.tier ?? 'good',
  gateway_url: '${TERMINAL_AI_GATEWAY_URL}',
  app_id: '${TERMINAL_AI_APP_ID}',
}, null, 2)
```

- [ ] **Step 5: Run existing MCP server tests**

```bash
cd mcp-server && npx vitest run
```

Expected: PASS (no regression in existing scaffold logic).

- [ ] **Step 6: Commit**

```bash
git add scaffold/ mcp-server/
git commit -m "feat(scaffold): v2 category/tier config template + gateway client helper"
```

---

### Task 6: Platform — app creation form v2

**Files:**
- Modify: `platform/app/creator/apps/new/page.tsx` (or wherever new app creation form lives)

- [ ] **Step 1: Find app creation form**

```bash
find platform/app -name "*.tsx" | xargs grep -l "model_tier" 2>/dev/null
```

Read the file(s) found.

- [ ] **Step 2: Add category + tier selectors**

In the app creation form, add two new fields after the app name/description fields:

```typescript
// Category selector
<div>
  <label className="block text-sm font-medium mb-1">Category</label>
  <select
    name="api_category"
    defaultValue="chat"
    className="w-full border border-input rounded px-3 py-2 text-sm bg-background"
  >
    <option value="chat">Chat — conversational AI, Q&A</option>
    <option value="coding">Coding — code generation, review, debugging</option>
    <option value="image">Image — generate images from prompts</option>
    <option value="web_search">Web Search — real-time web lookup</option>
    <option value="web_scrape">Web Scrape — extract data from URLs</option>
  </select>
</div>

// Tier selector
<div>
  <label className="block text-sm font-medium mb-1">Quality Tier</label>
  <select
    name="api_tier"
    defaultValue="good"
    className="w-full border border-input rounded px-3 py-2 text-sm bg-background"
  >
    <option value="fast">Fast — &lt;1s, good quality, lowest cost</option>
    <option value="good">Good — 2–5s, better quality, balanced cost (recommended)</option>
    <option value="quality">Quality — 5–15s, best output, premium cost</option>
  </select>
</div>
```

- [ ] **Step 3: Update the app creation API to save api_category + api_tier**

In the POST handler for app creation, add to the INSERT:

```typescript
const createAppSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  github_repo: z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/),
  api_category: z.enum(['chat', 'coding', 'image', 'web_search', 'web_scrape']).default('chat'),
  api_tier: z.enum(['fast', 'good', 'quality']).default('good'),
})

// In INSERT query, add api_category and api_tier columns
```

- [ ] **Step 4: Commit**

```bash
git add platform/app/creator/apps/new/
git commit -m "feat(platform): app creation form v2 — category + tier selectors"
```

---

### Task 7: Verification

- [ ] **Step 1: End-to-end test of POST /v1/generate**

```bash
# First create an embed token for a test app
TOKEN="..."  # get from test session

curl -X POST http://localhost:4000/v1/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "chat",
    "tier": "good",
    "messages": [{"role": "user", "content": "Say hello"}]
  }'
```

Expected response:
```json
{
  "id": "gen_...",
  "category": "chat",
  "tier": "good",
  "model_used": "anthropic/claude-haiku-4-5",
  "content": "Hello! How can I help you?",
  "usage": { "input_tokens": 5, "output_tokens": 12 },
  "credits_charged": 4,
  "latency_ms": 1234
}
```

- [ ] **Step 2: Verify existing v1 endpoint still works**

```bash
curl -X POST http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

Expected: valid OpenAI-format response (backward compatibility).

- [ ] **Step 3: Test model route toggle via admin UI**

1. Open `/admin/model-routes`
2. Toggle one route to inactive
3. Call POST /v1/generate with that category/tier
4. Verify it returns 503 (no active route)
5. Toggle back to active
6. Verify it returns 200

- [ ] **Step 4: Run all tests**

```bash
cd gateway && npx vitest run
cd ../platform && npx vitest run
```

Expected: all PASS.

- [ ] **Step 5: Final commit**

```bash
git commit -m "chore(v2): category/tier API abstraction complete — /v1/generate, model routing, admin UI"
```
