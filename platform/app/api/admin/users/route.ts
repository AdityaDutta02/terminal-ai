import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/middleware/require-admin'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const result = await requireAdmin()
  if (result instanceof NextResponse) return result

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') ?? ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '20', 10))
  const offset = (page - 1) * limit

  const users = await db.query(
    `SELECT u.id, u.email, u.name, u.role, u.credits, u."createdAt",
            us.plan_id AS subscription_plan, us.status AS subscription_status,
            EXISTS(SELECT 1 FROM platform.user_bans ub WHERE ub.user_id = u.id AND ub.is_active = true) AS is_banned
     FROM public."user" u
     LEFT JOIN subscriptions.user_subscriptions us ON us.user_id = u.id AND us.status = 'active'
     WHERE ($1 = '' OR u.email ILIKE '%' || $1 || '%' OR u.name ILIKE '%' || $1 || '%')
     ORDER BY u."createdAt" DESC
     LIMIT $2 OFFSET $3`,
    [search, limit, offset],
  )

  const total = await db.query<{ count: number }>(
    `SELECT COUNT(*)::INTEGER AS count FROM public."user"
     WHERE ($1 = '' OR email ILIKE '%' || $1 || '%' OR name ILIKE '%' || $1 || '%')`,
    [search],
  )

  logger.info({ msg: 'admin_users_listed', page, limit, search: search || undefined })
  return NextResponse.json({
    users: users.rows,
    pagination: { page, limit, total: total.rows[0]?.count ?? 0 },
  })
}
