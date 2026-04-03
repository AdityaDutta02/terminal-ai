import { Resend } from 'resend'
import { logger } from './logger'

function safeHref(url: string): string {
  return url.startsWith('https://') || url.startsWith('http://') ? url : '#'
}

let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY ?? '')
  return _resend
}
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'Terminal AI <noreply@terminalai.studioionique.com>'

export async function sendVerificationEmail(email: string, url: string): Promise<void> {
  const { error } = await getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'Verify your Terminal AI account',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0F172A;">Verify your email</h2>
        <p style="color: #64748B;">Click the button below to verify your Terminal AI account.</p>
        <a href="${safeHref(url)}" style="display: inline-block; background: #FF6B00; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">Verify Email</a>
        <p style="color: #94A3B8; font-size: 13px;">If you didn&apos;t create an account, ignore this email.</p>
      </div>
    `,
  })
  if (error) logger.error({ msg: 'verification_email_failed', email, err: error.message })
}

export async function sendPasswordResetEmail(email: string, url: string): Promise<void> {
  const { error } = await getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'Reset your Terminal AI password',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0F172A;">Reset your password</h2>
        <p style="color: #64748B;">Click the button below to reset your password.</p>
        <a href="${safeHref(url)}" style="display: inline-block; background: #FF6B00; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">Reset Password</a>
        <p style="color: #94A3B8; font-size: 13px;">If you didn&apos;t request this, ignore this email.</p>
      </div>
    `,
  })
  if (error) logger.error({ msg: 'password_reset_email_failed', email, err: error.message })
}

export async function sendPaymentConfirmationEmail(
  email: string,
  amountInr: string,
  credits: number,
  type: 'credit_pack' | 'subscription',
): Promise<void> {
  const subject = type === 'subscription'
    ? 'Subscription activated — Terminal AI'
    : 'Payment confirmed — Terminal AI'

  const { error } = await getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0F172A;">Payment Confirmed</h2>
        <p style="color: #64748B;">Your payment of &#x20B9;${amountInr} has been processed successfully.</p>
        <p style="color: #64748B;"><strong>${credits} credits</strong> have been added to your account.</p>
        <a href="https://terminalai.studioionique.com/account" style="display: inline-block; background: #FF6B00; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">View Account</a>
        <p style="color: #94A3B8; font-size: 13px;">Terminal AI by Studio Ionique</p>
      </div>
    `,
  })
  if (error) logger.error({ msg: 'payment_email_failed', email, err: error.message })
}

export async function sendPaymentFailedEmail(email: string): Promise<void> {
  const { error } = await getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'Payment failed — Terminal AI',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0F172A;">Payment Failed</h2>
        <p style="color: #64748B;">Your recent payment could not be processed. Please update your payment method or try again.</p>
        <a href="https://terminalai.studioionique.com/pricing" style="display: inline-block; background: #FF6B00; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">Update Payment</a>
        <p style="color: #94A3B8; font-size: 13px;">If you need assistance, contact support@studioionique.com</p>
      </div>
    `,
  })
  if (error) logger.error({ msg: 'payment_failed_email_failed', email, err: error.message })
}
