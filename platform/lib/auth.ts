import { betterAuth } from 'better-auth'
import { Pool } from 'pg'
import { grantCredits } from './credits'
import { db } from './db'
import { logger } from './logger'
import { WELCOME_CREDITS } from './pricing'
import { sendVerificationEmail, sendPasswordResetEmail } from './email'

/**
 * Idempotently grant welcome credits to a user.
 * Checks both the email-level grant table (survives account deletion) and the
 * ledger (in-place guard) before writing, so neither a delete-recreate cycle
 * nor a duplicate hook invocation can award credits twice.
 */
async function maybeGrantWelcomeCredits(userId: string, email: string): Promise<void> {
  const [emailGrant, ledgerGrant] = await Promise.all([
    db.query<Record<string, never>>(
      `SELECT 1 FROM platform.email_welcome_grants WHERE email = $1 LIMIT 1`,
      [email],
    ),
    db.query<Record<string, never>>(
      `SELECT 1 FROM subscriptions.credit_ledger
       WHERE user_id = $1 AND reason = 'welcome_bonus' LIMIT 1`,
      [userId],
    ),
  ])
  if (emailGrant.rows.length > 0 || ledgerGrant.rows.length > 0) return
  await grantCredits(userId, WELCOME_CREDITS, 'welcome_bonus')
  await db.query(
    `INSERT INTO platform.email_welcome_grants (email) VALUES ($1) ON CONFLICT DO NOTHING`,
    [email],
  )
}

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
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      // Append callbackURL so user lands on login after verification
      const verifyUrl = url.includes('?') ? `${url}&callbackURL=/login` : `${url}?callbackURL=/login`
      await sendVerificationEmail(user.email, verifyUrl)
    },
    autoSignInAfterVerification: false,
    afterEmailVerification: async (user) => {
      if (!user.id) return // guard against malformed user objects
      try {
        await maybeGrantWelcomeCredits(user.id, user.email)
      } catch (err) {
        logger.error({ msg: 'welcome_credits_grant_failed', userId: user.id, err })
      }
      // Grant waitlist launch credits if this email was notified at launch
      try {
        const waitlistRow = await db.query<Record<string, never>>(
          `SELECT 1 FROM platform.waitlist
           WHERE email = $1 AND notified_at IS NOT NULL LIMIT 1`,
          [user.email],
        )
        if (waitlistRow.rows.length > 0) {
          const alreadyGranted = await db.query<Record<string, never>>(
            `SELECT 1 FROM subscriptions.credit_ledger
             WHERE user_id = $1 AND reason = 'waitlist_launch' LIMIT 1`,
            [user.id],
          )
          if (alreadyGranted.rows.length === 0) {
            await grantCredits(user.id, 10, 'waitlist_launch')
          }
        }
      } catch (err) {
        logger.error({ msg: 'waitlist_credits_grant_failed', userId: user.id, err })
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
            await maybeGrantWelcomeCredits(user.id, user.email)
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
