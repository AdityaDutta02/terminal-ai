import { redis } from '@/lib/redis'
export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}
// Sliding-window rate limiter using Redis sorted sets.
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Date.now()
  const windowMs = windowSeconds * 1000
  const redisKey = `rl:${key}`
  const pipe = redis.pipeline()
  pipe.zremrangebyscore(redisKey, '-inf', now - windowMs)
  pipe.zadd(redisKey, now, `${now}-${Math.random()}`)
  pipe.zcard(redisKey)
  pipe.pexpire(redisKey, windowMs)
  const results = await pipe.exec()
  const count = (results?.[2]?.[1] as number) ?? 0
  const resetAt = now + windowMs
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt,
  }
}
