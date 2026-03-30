import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { embedTokenAuth, deductCredits } from '../middleware/auth.js'
import { db } from '../db.js'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const CREDITS_PER_REQUEST = 1

const proxy = new Hono()

proxy.post('/v1/chat/completions', embedTokenAuth, async (c) => {
  const { userId, appId, sessionId } = c.get('embedToken')

  // Deduct credits before proxying
  const remaining = await deductCredits(userId, CREDITS_PER_REQUEST, appId)
  if (remaining === null) {
    return c.json({ error: 'Insufficient credits' }, 402)
  }

  const body = await c.req.json<Record<string, unknown>>()
  const startedAt = Date.now()

  const upstream = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
      'HTTP-Referer': 'https://terminalai.app',
      'X-Title': 'Terminal AI',
    },
    body: JSON.stringify(body),
  })

  if (!upstream.ok) {
    const err = await upstream.text()
    await logCall({ userId, appId, sessionId, body, latency: Date.now() - startedAt, status: 'error' })
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
        await logCall({ userId, appId, sessionId, body, latency: Date.now() - startedAt, status: 'ok' })
      }
    })
  }

  const json = await upstream.json<Record<string, unknown>>()
  await logCall({ userId, appId, sessionId, body, latency: Date.now() - startedAt, status: 'ok' })
  return c.json(json)
})

interface LogCallParams {
  userId: string
  appId: string
  sessionId: string
  body: Record<string, unknown>
  latency: number
  status: 'ok' | 'error'
}

async function logCall({ userId, appId, sessionId, body, latency, status }: LogCallParams) {
  const model = typeof body.model === 'string' ? body.model : 'unknown'
  await db.query(
    `INSERT INTO gateway.api_calls
       (user_id, app_id, session_id, provider, model, credits_charged, latency_ms, status)
     VALUES ($1, $2, $3, 'openrouter', $4, $5, $6, $7)`,
    [userId, appId, sessionId, model, CREDITS_PER_REQUEST, latency, status],
  )
}

export { proxy }
