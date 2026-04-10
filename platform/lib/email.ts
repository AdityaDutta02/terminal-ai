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

export async function sendWaitlistConfirmationEmail(email: string): Promise<void> {
  const { error } = await getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "You're on the list — Terminal AI",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; background: #FAFAFA; padding: 40px 32px; border-radius: 16px;">
        <p style="font-size: 13px; font-weight: 600; color: #FF6B00; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 16px;">Terminal AI</p>
        <h2 style="font-size: 28px; color: #0F172A; margin: 0 0 12px; font-weight: 700;">You're in the queue.</h2>
        <p style="color: #64748B; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
          We'll let you know the moment Terminal AI launches.<br/>
          In the meantime, tell a friend.
        </p>
        <p style="color: #94A3B8; font-size: 13px; margin: 24px 0 0;">Terminal AI by Studio Ionique</p>
      </div>
    `,
  })
  if (error) logger.error({ msg: 'waitlist_confirmation_email_failed', email, err: error.message })
}

export async function sendWaitlistLaunchEmail(
  email: string,
  hasAccount: boolean,
): Promise<void> {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://terminalai.studioionique.com'
  const ctaHref = safeHref(hasAccount ? APP_URL : `${APP_URL}/signup`)
  const ctaLabel = hasAccount ? 'Open Terminal AI →' : 'Create Your Account →'
  const creditsLine = hasAccount
    ? '10 credits have been added to your account. Start exploring.'
    : 'Sign up now to claim your 10 free credits.'

  const { error } = await getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'Terminal AI is live — you\'re in',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; background: #FAFAFA; padding: 40px 32px; border-radius: 16px;">
        <p style="font-size: 13px; font-weight: 600; color: #FF6B00; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 16px;">Terminal AI</p>
        <h2 style="font-size: 28px; color: #0F172A; margin: 0 0 12px; font-weight: 700;">The wait is over.</h2>
        <p style="color: #64748B; font-size: 15px; line-height: 1.6; margin: 0 0 8px;">Terminal AI is live.</p>
        <p style="color: #64748B; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">${creditsLine}</p>
        <a href="${ctaHref}" style="display: inline-block; background: #FF6B00; color: white; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px; margin: 0 0 24px;">${ctaLabel}</a>
        <p style="color: #94A3B8; font-size: 13px; margin: 0;">Terminal AI by Studio Ionique</p>
      </div>
    `,
  })
  if (error) logger.error({ msg: 'waitlist_launch_email_failed', email, hasAccount, err: error.message })
}
