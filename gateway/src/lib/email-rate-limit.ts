import { createClient } from 'redis'

let redisClient: ReturnType<typeof createClient> | null = null

function getRedis(): ReturnType<typeof createClient> | null {
  if (!redisClient) {
    try {
      redisClient = createClient({ url: process.env.REDIS_URL ?? 'redis://redis:6379' })
      redisClient.connect().catch(() => { redisClient = null })
    } catch {
      redisClient = null
    }
  }
  return redisClient
}

const WINDOW_MS = 60 * 60 * 1000 // 1 hour
const MAX_EMAILS = 10

export async function checkEmailRateLimit(appId: string, userId: string): Promise<boolean> {
  try {
    const redis = getRedis()
    if (!redis) return true // fail open if Redis unavailable

    const key = `rl:email:${appId}:${userId}`
    const now = Date.now()
    const windowStart = now - WINDOW_MS

    const count = await redis.zCount(key, windowStart, now)
    if (count >= MAX_EMAILS) return false

    await redis.zAdd(key, { score: now, value: `${now}` })
    await redis.zRemRangeByScore(key, '-inf', windowStart - 1)
    await redis.expire(key, Math.ceil(WINDOW_MS / 1000))
    return true
  } catch {
    redisClient = null
    return true // fail open
  }
}
