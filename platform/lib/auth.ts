import { betterAuth } from 'better-auth'
import { Pool } from 'pg'
import { grantCredits } from './credits'
import { db } from './db'
import { logger } from './logger'
import { WELCOME_CREDITS } from './pricing'

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL! }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  emailVerification: {
    afterEmailVerification: async (user) => {
      if (!user.id) return // guard against malformed user objects
      try {
        // Idempotency check: skip if welcome credits were already granted
        const existing = await db.query<Record<string, never>>(
          `SELECT 1 FROM subscriptions.credit_ledger
           WHERE user_id = $1 AND reason = 'welcome_bonus' LIMIT 1`,
          [user.id],
        )
        if (existing.rows.length > 0) return
        await grantCredits(user.id, WELCOME_CREDITS, 'welcome_bonus')
      } catch (err) {
        logger.error({ msg: 'welcome_credits_grant_failed', userId: user.id, err })
      }
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  user: {
    additionalFields: {
      credits: {
        type: 'number',
        defaultValue: 0,
        input: false,
      },
      role: {
        type: 'string',
        defaultValue: 'user',
        input: false,
      },
    },
  },
  hooks: {
    after: [
      {
        matcher: (ctx: { path: string }) => ctx.path.startsWith('/get-session'),
        handler: async (ctx: { context?: { session?: { user?: { id?: string } } } }) => {
          const userId = ctx.context?.session?.user?.id
          if (!userId) return

          const ban = await db.query(
            `SELECT id FROM platform.user_bans
             WHERE user_id = $1 AND is_active = true
               AND (expires_at IS NULL OR expires_at > NOW())`,
            [userId],
          )
          if (ban.rows[0]) {
            throw new Error('Account suspended')
          }
        },
      },
    ],
  },
})

export type Session = typeof auth.$Infer.Session
