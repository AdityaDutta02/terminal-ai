import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { searchApps } from '@/lib/search'
import { logger } from '@/lib/logger'
import { checkRateLimit, rateLimitResponse } from '@/lib/middleware/rate-limit'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
  const allowed = await checkRateLimit(`search:${ip}`, 30, 60_000)
  if (!allowed) return rateLimitResponse()

  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q') ?? ''
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 50) : 20
  if (!query.trim()) {
    return NextResponse.json({ hits: [], estimatedTotalHits: 0, query: '' })
  }
  try {
    const result = await searchApps(query, limit)
    return NextResponse.json(result)
  } catch (err) {
    logger.error({ msg: 'search_failed', query, err: String(err) })
    return NextResponse.json({ error: 'Search unavailable' }, { status: 503 })
  }
}
