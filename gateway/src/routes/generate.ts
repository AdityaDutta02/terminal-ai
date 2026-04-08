// gateway/src/routes/generate.ts
import type { Context } from 'hono'
import { resolveModel, getCreditCost, VALID_CATEGORIES, VALID_TIERS } from '../lib/model-routing'
import { callOpenRouter } from '../lib/openrouter'
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
  let response: { content: string; usage: { prompt_tokens: number; completion_tokens: number } }
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
