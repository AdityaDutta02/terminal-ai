import Redis from 'ioredis'

// REDIS_URL may contain special characters (e.g. `/`, `=`) in the password
// that break URL parsing. Extract components via regex instead.
function buildRedisClient(): Redis {
  const url = process.env.REDIS_URL ?? ''
  const match = url.match(/^redis:\/\/:([^@]+)@([^:]+):(\d+)/)
  if (match) {
    return new Redis({
      password: match[1],
      host: match[2],
      port: parseInt(match[3], 10),
      lazyConnect: true,
    })
  }
  return new Redis(url, { lazyConnect: true })
}

export const redis = buildRedisClient()
