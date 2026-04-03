import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'
import { type NextRequest } from 'next/server'
import { checkRateLimit, rateLimitResponse } from '@/lib/middleware/rate-limit'
import { logger } from '@/lib/logger'

const { GET, POST: _POST } = toNextJsHandler(auth)

export { GET }

export async function POST(req: NextRequest): Promise<Response> {
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
  const allowed = await checkRateLimit(`auth:${ip}`, 20, 300_000)
  if (!allowed) {
    logger.warn({ msg: 'auth_rate_limit_exceeded', ip, path: req.nextUrl.pathname })
    return rateLimitResponse()
  }
  return _POST(req)
}
