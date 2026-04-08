import { db } from '../lib/db'

interface TieredModel {
  category: string
  tier: string
  model: string
  credits: number
}

interface DirectModel {
  model_id: string
  name: string
  provider: string
  credit_cost: number
  context_length: number | null
}

interface ProvidersResponse {
  api_version: string
  endpoint: string
  tiered_models: {
    description: string
    usage: string
    categories: TieredModel[]
  }
  direct_models: {
    description: string
    usage: string
    models: DirectModel[]
  }
}

// Credit costs for tiered models — must match gateway CREDIT_COSTS_V2
const TIERED_CREDITS: Record<string, Record<string, number>> = {
  chat:       { fast: 1, good: 4, quality: 6 },
  coding:     { fast: 1, good: 4, quality: 8 },
  image:      { fast: 3, good: 10, quality: 93 },
  video:      { quality: 250 },
  web_search: { fast: 2, good: 5, quality: 10 },
  web_scrape: { fast: 2, good: 4, quality: 8 },
}

export async function getProvidersJson(): Promise<string> {
  // Fetch tiered model routes
  const routesResult = await db.query(
    `SELECT category, tier, model_string FROM platform.model_routes WHERE is_active = true ORDER BY category, priority DESC`
  )
  const tieredModels: TieredModel[] = (routesResult.rows as Array<{ category: string; tier: string; model_string: string }>).map(row => ({
    category: row.category,
    tier: row.tier,
    model: row.model_string,
    credits: TIERED_CREDITS[row.category]?.[row.tier] ?? 1,
  }))

  // Fetch direct models from pricing table
  let directModels: DirectModel[] = []
  try {
    const pricingResult = await db.query(
      `SELECT model_id, name, provider, credit_cost, context_length
       FROM gateway.model_pricing WHERE is_available = true ORDER BY provider, credit_cost`
    )
    directModels = pricingResult.rows as DirectModel[]
  } catch {
    // table may not exist yet during migration
  }

  const response: ProvidersResponse = {
    api_version: 'v2',
    endpoint: '/v1/generate',
    tiered_models: {
      description: 'Use category + tier for automatic model routing. Platform picks the best model.',
      usage: '{ "category": "chat", "tier": "good", "messages": [...] }',
      categories: tieredModels,
    },
    direct_models: {
      description: 'Use model param for direct model selection. Pricing based on model cost.',
      usage: '{ "model": "anthropic/claude-sonnet-4-6", "messages": [...] }',
      models: directModels,
    },
  }

  return JSON.stringify(response, null, 2)
}
