import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { validateServiceToken, unauthorizedResponse } from '@/lib/internal-auth'

export async function GET(req: Request): Promise<Response> {
  if (!validateServiceToken(req)) return unauthorizedResponse()

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return NextResponse.json({ error: 'Missing bearer token' }, { status: 400 })

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  try {
    const result = await db.query<{ creator_id: string }>(
      `SELECT creator_id FROM mcp.api_keys WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash]
    )
    if (result.rows.length === 0) {
      logger.warn({ msg: 'internal_me_invalid_key' })
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }
    const userId = result.rows[0].creator_id
    db.query(`UPDATE mcp.api_keys SET last_used_at = NOW() WHERE token_hash = $1`, [tokenHash])
      .catch(err => logger.warn({ msg: 'internal_me_last_used_update_failed', err }))
    logger.info({ msg: 'internal_me_resolved', userId })
    return NextResponse.json({ userId })
  } catch (err) {
    logger.error({ msg: 'internal_me_db_error', err })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
