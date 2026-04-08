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

/**
 * Get credit cost for a direct model selection.
 * Returns null if the model is not found or not available.
 */
export async function getDirectModelCost(modelId: string): Promise<{ creditCost: number; modelString: string } | null> {
  const { rows } = await db.query(
    `SELECT model_id, credit_cost FROM gateway.model_pricing WHERE model_id = $1 AND is_available = true`,
    [modelId]
  )
  if (rows.length === 0) return null
  const row = rows[0] as { model_id: string; credit_cost: number }
  return { creditCost: row.credit_cost, modelString: row.model_id }
}
