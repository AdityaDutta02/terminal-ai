import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { grantCredits } from '@/lib/credits'
import { sendWaitlistLaunchEmail } from '@/lib/email'
import { invalidateWaitlistCache } from '@/lib/waitlist-config'
import { requireAdmin } from '@/lib/middleware/require-admin'

const BATCH_SIZE = 50

export async function POST(_request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) return authResult

  const { session } = authResult
  logger.info({ msg: 'platform_launch_started', userId: session.user.id })

  try {
    // 1. Flip waitlist_mode to false
    await db.query(
      `UPDATE platform.config SET value = 'false' WHERE key = 'waitlist_mode'`,
    )
    invalidateWaitlistCache()

    // 2. Find all waitlist emails and whether they have accounts
    type WaitlistRow = { email: string; user_id: string | null }
    const waitlistResult = await db.query<WaitlistRow>(
      `SELECT w.email, u.id AS user_id
       FROM platform.waitlist w
       LEFT JOIN public."user" u ON LOWER(u.email) = LOWER(w.email)
       WHERE w.notified_at IS NULL`,
    )
    const rows = waitlistResult.rows

    // 3. Grant 10 credits to matched accounts (idempotent check)
    let creditsGranted = 0
    for (const row of rows) {
      if (!row.user_id) continue
      const alreadyGranted = await db.query<Record<string, never>>(
        `SELECT 1 FROM subscriptions.credit_ledger
         WHERE user_id = $1 AND reason = 'waitlist_launch' LIMIT 1`,
        [row.user_id],
      )
      if (alreadyGranted.rows.length === 0) {
        await grantCredits(row.user_id, 10, 'waitlist_launch')
        creditsGranted++
      }
    }

    // 4. Send launch emails in batches of 50
    let emailsSent = 0
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)
      await Promise.all(
        batch.map(async (row) => {
          try {
            await sendWaitlistLaunchEmail(row.email, row.user_id !== null)
            emailsSent++
          } catch (err) {
            logger.error({ msg: 'launch_email_failed', email: row.email, err: String(err) })
          }
        }),
      )
    }

    // 5. Mark all as notified
    await db.query(
      `UPDATE platform.waitlist SET notified_at = NOW() WHERE notified_at IS NULL`,
    )

    logger.info({ msg: 'platform_launch_complete', emailsSent, creditsGranted })
    return NextResponse.json({ launched: true, emailsSent, creditsGranted })
  } catch (err) {
    logger.error({ msg: 'platform_launch_failed', err: String(err) })
    return NextResponse.json({ error: 'Launch failed' }, { status: 500 })
  }
}
