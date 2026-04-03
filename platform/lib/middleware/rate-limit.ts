import { NextResponse } from 'next/server'
import { createClient } from 'redis'
import { logger } from '@/lib/logger'

let redis: ReturnType<typeof createClient> | null = null

function getRedis(): ReturnType<typeof createClient> | null {
  if (!redis) {
    try {
      const password = process.env.REDIS_PASSWORD
      const host = process.env.REDIS_HOST ?? 'redis'
      if (password) {
        // Use socket+password to avoid URL-encoding issues with special chars in password
        redis = createClient({ socket: { host, port: 6379 }, password })
      } else {
        redis = createClient({ url: process.env.REDIS_URL })
      }
      redis.connect().catch((err: unknown) => {
        logger.error({ msg: 'rate_limit_redis_connect_failed', err: String(err) })
        redis = null
      })
    } catch (err) {
      logger.error({ msg: 'rate_limit_redis_init_failed', err: String(err) })
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

  try {
    const now = Date.now()
    const windowStart = now - windowMs
    const rlKey = `rl:platform:${key}`

    const count = await r.zCount(rlKey, windowStart, now)
    if (count >= limit) return false

    await r.zAdd(rlKey, { score: now, value: `${now}` })
    await r.zRemRangeByScore(rlKey, '-inf', windowStart - 1)
    await r.expire(rlKey, Math.ceil(windowMs / 1000))
    return true
  } catch (err) {
    logger.error({ msg: 'rate_limit_redis_error_failing_open', key, err: String(err) })
    return true
  }
}

export function rateLimitResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please slow down.' },
    { status: 429 },
  )
}
