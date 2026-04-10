import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { embedTokenAuth } from '../middleware/auth.js'
import { db } from '../db.js'
import { logger } from '../lib/logger.js'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

const proxy = new Hono()

proxy.post('/v1/chat/completions', embedTokenAuth, async (c) => {
  const { userId, appId, sessionId, creditsPerCall, isFree } = c.get('embedToken')

  // Deduct credits on each API call (not on session start)
  let creditsCharged = 0
  if (userId && creditsPerCall > 0 && !isFree) {
    try {
      const balResult = await db.query<{ balance: number }>(
        `SELECT COALESCE(SUM(delta), 0) AS balance FROM subscriptions.credit_ledger WHERE user_id = $1`,
        [userId],
      )
      const balance = balResult.rows[0]?.balance ?? 0
      if (balance < creditsPerCall) {
        return c.json({ error: 'Insufficient credits', redirect: '/pricing?reason=insufficient_credits' }, 402)
      }
      await db.query(
        `INSERT INTO subscriptions.credit_ledger (user_id, delta, balance_after, reason, app_id)
         VALUES ($1, $2, (SELECT COALESCE(SUM(delta), 0)::int + $2 FROM subscriptions.credit_ledger WHERE user_id = $1), 'api_call', $3)`,
        [userId, -creditsPerCall, appId],
      )
      creditsCharged = creditsPerCall
    } catch (err) {
      logger.error({ msg: 'credit_deduction_failed', userId, appId, err: String(err) })
      return c.json({ error: 'Credit deduction failed' }, 500)
    }
  }

  const body = await c.req.json<Record<string, unknown>>()
  const startedAt = Date.now()

  const upstream = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
      'HTTP-Referer': 'https://terminalai.studioionique.com',
      'X-Title': 'Terminal AI',
    },
    body: JSON.stringify(body),
  })

  if (!upstream.ok) {
    const err = await upstream.text()
    await logCall({ userId, appId, sessionId, body, latency: Date.now() - startedAt, status: 'error', creditsCharged: 0 })
    return c.json({ error: 'Upstream error', detail: err }, upstream.status as 400 | 500)
  }

  const isStream = body.stream === true

  if (isStream) {
    return streamSSE(c, async (stream) => {
      const reader = upstream.body!.getReader()
      const decoder = new TextDecoder()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          await stream.write(decoder.decode(value, { stream: true }))
        }
      } finally {
        reader.releaseLock()
        await logCall({ userId, appId, sessionId, body, latency: Date.now() - startedAt, status: 'ok', creditsCharged })
      }
    })
  }

  const json = await upstream.json<Record<string, unknown>>()
  await logCall({ userId, appId, sessionId, body, latency: Date.now() - startedAt, status: 'ok', creditsCharged })
  return c.json(json)
})

interface LogCallParams {
  userId: string | null
  appId: string
  sessionId: string
  body: Record<string, unknown>
  latency: number
  status: 'ok' | 'error'
  creditsCharged: number
}

async function logCall(params: LogCallParams): Promise<void> {
  const { userId, appId, sessionId, body, latency, status, creditsCharged } = params
  const model = typeof body.model === 'string' ? body.model : 'unknown'
  try {
    await db.query(
      `INSERT INTO gateway.api_calls
         (user_id, app_id, session_id, provider, model, credits_charged, latency_ms, status)
       VALUES ($1, $2, $3, 'openrouter', $4, $5, $6, $7)`,
      [userId, appId, sessionId, model, creditsCharged, latency, status],
    )
  } catch (err) {
    // Audit log failure must not crash the proxy response path
    logger.error({ msg: 'logCall_insert_failed', sessionId, err: err instanceof Error ? err.message : String(err) })
  }
}

export { proxy }
