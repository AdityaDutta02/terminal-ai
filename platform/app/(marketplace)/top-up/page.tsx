import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { TopUpClient } from './top-up-client'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Top Up - Terminal AI',
  description: 'Buy more tokens for your Terminal AI account.',
}

type SubRow = { status: string; [key: string]: unknown }

export default async function TopUpPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login?next=/top-up')

  // Check if user has active subscription
  const subResult = await db.query<SubRow>(
    `SELECT status FROM subscriptions.user_subscriptions
     WHERE user_id = $1 AND status = 'active'
     ORDER BY created_at DESC LIMIT 1`,
    [session.user.id],
  )
  const hasSubscription = !!subResult.rows[0]

  // If no subscription, send them to the full pricing page
  if (!hasSubscription) redirect('/pricing')

  const razorpayKeyId = process.env.RAZORPAY_KEY_ID ?? ''
  const { reason } = await searchParams

  return (
    <TopUpClient
      razorpayKeyId={razorpayKeyId}
      userEmail={session.user.email ?? ''}
      userName={session.user.name ?? ''}
      showInsufficientMessage={reason === 'insufficient_credits'}
    />
  )
}
