import type { Context, Next } from 'hono'
import { createClient } from 'redis'

let redisClient: ReturnType<typeof createClient> | null = null

function getRedis(): ReturnType<typeof createClient> | null {
  if (!redisClient) {
    redisClient = createClient({ url: process.env.REDIS_URL ?? 'redis://redis:6379' })
    redisClient.connect().catch(() => { redisClient = null })
  }
  return redisClient
}

async function checkLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return true // fail open if Redis unavailable

  const now = Date.now()
  const windowStart = now - windowMs
  const rateLimitKey = `rl:gw:${key}`

  const count = await redis.zCount(rateLimitKey, windowStart, now)
  if (count >= limit) return false

  await redis.zAdd(rateLimitKey, { score: now, value: `${now}` })
  await redis.zRemRangeByScore(rateLimitKey, '-inf', windowStart - 1)
  await redis.expire(rateLimitKey, Math.ceil(windowMs / 1000))
  return true
}

export function gatewayRateLimit() {
  return async (c: Context, next: Next) => {
    const userId = c.get('userId') as string | undefined
    const key = userId ? `user:${userId}` : `ip:${c.req.header('x-forwarded-for') ?? 'unknown'}`
    const limit = userId ? 60 : 5 // 60 req/min for auth users, 5 for anon

    const allowed = await checkLimit(key, limit, 60_000)
    if (!allowed) {
      return c.json({ error: 'Rate limit exceeded. Try again in a minute.' }, 429)
    }
    await next()
  }
}
