import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { PricingClient } from './pricing-client'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pricing - Terminal AI',
  description: 'Run AI apps for ₹1 per credit. Subscribe from ₹299/month or ₹2,490/year — over 3 months free. No hidden fees.',
}

type ActiveSub = { plan_id: string; status: string }

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; plan?: string; payment?: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })

  let activeSub: ActiveSub | null = null
  if (session) {
    const result = await db.query<ActiveSub>(
      `SELECT plan_id, status FROM subscriptions.user_subscriptions
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [session.user.id],
    )
    activeSub = result.rows[0] ?? null
  }

  const isLoggedIn = !!session
  const razorpayKeyId = process.env.RAZORPAY_KEY_ID ?? ''
  const userEmail = session?.user.email ?? ''
  const userName = session?.user.name ?? ''
  const { reason, plan, payment } = await searchParams
  const defaultBilling = plan === 'annual' ? 'annual' : plan === 'monthly' ? 'monthly' : undefined

  return (
    <PricingClient
      isLoggedIn={isLoggedIn}
      activeSubscription={activeSub}
      razorpayKeyId={razorpayKeyId}
      userEmail={userEmail}
      userName={userName}
      showInsufficientMessage={reason === 'insufficient_credits'}
      defaultBilling={defaultBilling}
      paymentCancelled={payment === 'cancelled'}
    />
  )
}
