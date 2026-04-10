// gateway/src/routes/generate.ts
import type { Context } from 'hono'
import { resolveModel, getCreditCost, getDirectModelCost, VALID_CATEGORIES, VALID_TIERS } from '../lib/model-routing.js'
import { callOpenRouter } from '../lib/openrouter.js'
import { db } from '../db.js'
import { logger } from '../lib/logger.js'
import type { EmbedTokenPayload } from '../middleware/auth.js'

interface GenerateBody {
  category?: string   // required if model not provided
  tier?: string       // required if model not provided
  model?: string      // direct model selection, e.g. "anthropic/claude-sonnet-4-6"
  messages: Array<{ role: string; content: string }>
  system?: string
  stream?: boolean
  options?: { max_tokens?: number; temperature?: number }
}

export async function handleGenerate(c: Context): Promise<Response> {
  const embedToken = c.get('embedToken') as EmbedTokenPayload | undefined
  if (!embedToken) return c.json({ error: 'Unauthorized' }, 401)
  if (embedToken.userId === null) return c.json({ error: 'Forbidden: anonymous users cannot use generate' }, 403)

  let body: GenerateBody
  try {
    body = await c.req.json() as GenerateBody
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const { messages, system, options } = body

  if (!Array.isArray(messages) || messages.length === 0) {
    return c.json({ error: 'messages array is required and must not be empty' }, 400)
  }

  let modelString: string
  let creditCost: number
  let mode: 'direct' | 'tiered'
  let category: string | undefined
  let tier: string | undefined

  if (body.model) {
    // Direct model selection path
    const lookup = await getDirectModelCost(body.model)
    if (lookup === null) {
      return c.json({ error: 'Model not available' }, 400)
    }
    modelString = lookup.modelString
    creditCost = lookup.creditCost
    mode = 'direct'
  } else {
    // Tiered routing path
    category = body.category
    tier = body.tier

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

    const cost = getCreditCost(category, tier)
    if (cost === null) {
      return c.json({ error: `No credit cost defined for ${category}/${tier}` }, 400)
    }
    creditCost = cost
    mode = 'tiered'

    try {
      modelString = await resolveModel(category, tier)
    } catch (err) {
      logger.error({ msg: 'model_route_not_found', category, tier, err: String(err) })
      return c.json({ error: `No model available for ${category}/${tier}` }, 503)
    }
  }

  // Deduct credits before calling OpenRouter
  let creditsCharged = 0
  if (embedToken.userId && creditCost > 0) {
    const balResult = await db.query<{ balance: number }>(
      `SELECT COALESCE(SUM(delta), 0) AS balance FROM subscriptions.credit_ledger WHERE user_id = $1`,
      [embedToken.userId],
    )
    const balance = balResult.rows[0]?.balance ?? 0
    if (balance < creditCost) {
      return c.json({ error: 'Insufficient credits', redirect: '/pricing?reason=insufficient_credits' }, 402)
    }
    await db.query(
      `INSERT INTO subscriptions.credit_ledger (user_id, delta, balance_after, reason, app_id)
       VALUES ($1, $2, (SELECT COALESCE(SUM(delta), 0)::int + $2 FROM subscriptions.credit_ledger WHERE user_id = $1), 'api_call', $3)`,
      [embedToken.userId, -creditCost, embedToken.appId],
    )
    creditsCharged = creditCost
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
    `INSERT INTO gateway.api_calls (user_id, app_id, session_id, provider, model, prompt_tokens, completion_tokens, credits_charged, latency_ms, status)
     VALUES ($1, $2, $3, 'openrouter', $4, $5, $6, $7, $8, 'success')`,
    [
      embedToken.userId,
      embedToken.appId,
      embedToken.sessionId,
      modelString,
      response.usage.prompt_tokens,
      response.usage.completion_tokens,
      creditsCharged,
      latencyMs,
    ]
  ).catch((err: unknown) => logger.warn({ msg: 'api_call_log_failed', err: String(err) }))

  return c.json({
    id: `gen_${Date.now()}`,
    ...(mode === 'tiered' ? { category, tier } : { model: body.model }),
    model_used: modelString,
    content: response.content,
    usage: {
      input_tokens: response.usage.prompt_tokens,
      output_tokens: response.usage.completion_tokens,
    },
    credits_charged: creditsCharged,
    latency_ms: latencyMs,
  })
}
