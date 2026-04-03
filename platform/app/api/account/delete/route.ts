import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { withTransaction } from '@/lib/db'
import { logger } from '@/lib/logger'

export async function DELETE(): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const userEmail = session.user.email

  try {
    await withTransaction(async (client) => {
      // Prevent re-registration from claiming welcome credits again
      if (userEmail) {
        await client.query(
          `INSERT INTO platform.email_welcome_grants (email) VALUES ($1) ON CONFLICT DO NOTHING`,
          [userEmail],
        )
      }
      await client.query('DELETE FROM session WHERE "userId" = $1', [userId])
      await client.query('DELETE FROM account WHERE "userId" = $1', [userId])
      await client.query('DELETE FROM subscriptions.credit_ledger WHERE user_id = $1', [userId])
      await client.query('DELETE FROM subscriptions.credit_pack_purchases WHERE user_id = $1', [userId])
      await client.query('DELETE FROM subscriptions.user_subscriptions WHERE user_id = $1', [userId])
      await client.query('DELETE FROM "user" WHERE id = $1', [userId])
    })

    logger.info({ msg: 'account_deleted', userId })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    logger.error({ msg: 'account_delete_failed', userId, err: String(err) })
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
  }
}
