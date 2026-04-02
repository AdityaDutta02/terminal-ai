import { betterAuth } from 'better-auth'
import { Pool } from 'pg'
import { grantCredits } from './credits'
import { db } from './db'
import { logger } from './logger'
import { WELCOME_CREDITS } from './pricing'
import { sendVerificationEmail, sendPasswordResetEmail } from './email'

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL! }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, url)
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
      enabled: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    },
    apple: {
      clientId: process.env.APPLE_CLIENT_ID ?? '',
      clientSecret: process.env.APPLE_CLIENT_SECRET ?? '',
      enabled: !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET),
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user.email, url)
    },
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
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Grant welcome credits to social OAuth users (auto-verified, skip email verification hook)
          if (!user.emailVerified) return
          try {
            const existing = await db.query<Record<string, never>>(
              `SELECT 1 FROM subscriptions.credit_ledger WHERE user_id = $1 AND reason = 'welcome_bonus' LIMIT 1`,
              [user.id],
            )
            if (existing.rows.length > 0) return
            await grantCredits(user.id, WELCOME_CREDITS, 'welcome_bonus')
          } catch (err) {
            logger.error({ msg: 'social_welcome_credits_failed', userId: user.id, err })
          }
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const userId = session.userId
          if (!userId) return { data: session }
          const ban = await db.query(
            `SELECT id FROM platform.user_bans
             WHERE user_id = $1 AND is_active = true
               AND (expires_at IS NULL OR expires_at > NOW())`,
            [userId],
          )
          if (ban.rows[0]) {
            return false // block session creation for banned users
          }
          return { data: session }
        },
      },
    },
  },
})

export type Session = typeof auth.$Infer.Session
