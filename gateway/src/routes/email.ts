import { Hono } from 'hono'
import { db } from '../db.js'
import { logger } from '../lib/logger.js'
import { ResendEmailProvider } from '../services/email-provider.js'
import { checkEmailRateLimit } from '../lib/email-rate-limit.js'
import type { EmbedTokenPayload } from '../middleware/auth.js'

const FROM_EMAIL = process.env.FROM_EMAIL ?? 'Terminal AI <noreply@terminalai.studioionique.com>'

const emailProvider = process.env.RESEND_API_KEY
  ? new ResendEmailProvider(process.env.RESEND_API_KEY)
  : null

export const emailRouter = new Hono()

emailRouter.post('/send', async (c) => {
  if (!emailProvider) {
    logger.error({ msg: 'email_not_configured', detail: 'RESEND_API_KEY is not set' })
    return c.json({ error: 'Email service is not configured' }, 503)
  }

  const token: EmbedTokenPayload = c.get('embedToken')
  const { userId, appId, isFree } = token

  if (!userId) {
    return c.json({ error: 'Anonymous users cannot send emails' }, 403)
  }

  const body = await c.req.json<{ to?: string; subject?: string; html?: string }>()

  if (!body.to) return c.json({ error: 'Missing required field: to' }, 400)
  if (!body.subject) return c.json({ error: 'Missing required field: subject' }, 400)
  if (!body.html) return c.json({ error: 'Missing required field: html' }, 400)

  // Validate recipient matches authenticated user's email
  const userResult = await db.query<{ email: string }>(
    `SELECT email FROM public."user" WHERE id = $1`,
    [userId],
  )
  const userEmail = userResult.rows[0]?.email
  if (!userEmail || body.to.toLowerCase() !== userEmail.toLowerCase()) {
    return c.json({ error: 'Can only send emails to the authenticated user' }, 403)
  }

  // Rate limit: 10 emails/hour per app per user
  const allowed = await checkEmailRateLimit(appId, userId)
  if (!allowed) {
    return c.json({ error: 'Email rate limit exceeded (10/hour)' }, 429)
  }

  // Credit deduction: 1 credit per email
  if (!isFree) {
    const balResult = await db.query<{ balance: number }>(
      `SELECT COALESCE(SUM(delta), 0) AS balance FROM subscriptions.credit_ledger WHERE user_id = $1`,
      [userId],
    )
    const balance = balResult.rows[0]?.balance ?? 0
    if (balance < 1) {
      return c.json({ error: 'Insufficient credits', redirect: '/pricing?reason=insufficient_credits' }, 402)
    }
    await db.query(
      `INSERT INTO subscriptions.credit_ledger (user_id, delta, balance_after, reason, app_id)
       VALUES ($1, -1, (SELECT COALESCE(SUM(delta), 0) - 1 FROM subscriptions.credit_ledger WHERE user_id = $1), 'email_send', $2)`,
      [userId, appId],
    )
  }

  // Send email
  let messageId: string
  try {
    const result = await emailProvider.send({
      from: FROM_EMAIL,
      to: body.to,
      subject: body.subject,
      html: body.html,
    })
    messageId = result.messageId
  } catch (err) {
    logger.error({ msg: 'email_send_failed', appId, userId, err: String(err) })
    return c.json({ error: 'Email delivery failed' }, 502)
  }

  // Audit log
  await db.query(
    `INSERT INTO gateway.email_sends (app_id, user_id, recipient, subject, status, message_id, credits_charged)
     VALUES ($1, $2, $3, $4, 'sent', $5, $6)`,
    [appId, userId, body.to, body.subject, messageId, isFree ? 0 : 1],
  )

  return c.json({ sent: true, messageId })
})
