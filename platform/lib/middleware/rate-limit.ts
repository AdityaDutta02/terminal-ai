import { NextResponse } from 'next/server'
import { createClient } from 'redis'
import { logger } from '@/lib/logger'

let redis: ReturnType<typeof createClient> | null = null

function getRedis(): ReturnType<typeof createClient> | null {
  if (!redis) {
    try {
      redis = createClient({ url: process.env.REDIS_URL })
      redis.connect().catch(() => { redis = null })
    } catch {
      // Invalid URL or other init error — disable rate limiting
      redis = null
    }
  }
  return redis
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const r = getRedis()
  if (!r) {
    logger.error({ msg: 'rate_limit_redis_unavailable_failing_open', key })
    return true
  }

  const now = Date.now()
  const windowStart = now - windowMs
  const rlKey = `rl:platform:${key}`

  const count = await r.zCount(rlKey, windowStart, now)
  if (count >= limit) return false

  await r.zAdd(rlKey, { score: now, value: `${now}` })
  await r.zRemRangeByScore(rlKey, '-inf', windowStart - 1)
  await r.expire(rlKey, Math.ceil(windowMs / 1000))
  return true
}

export function rateLimitResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please slow down.' },
    { status: 429 },
  )
}
