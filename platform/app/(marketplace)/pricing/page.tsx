import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { WELCOME_CREDITS } from '@/lib/pricing'
import { ArrowLeft, Gift } from 'lucide-react'
import { PricingClient } from './pricing-client'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pricing — Terminal AI',
  description: 'Simple, transparent pricing for AI-powered apps. Start with free credits.',
}

type ActiveSub = { plan_id: string; status: string }

export default async function PricingPage() {
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

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <a
        href="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to marketplace
      </a>

      {/* Header */}
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Simple, transparent pricing
        </h1>
        <p className="mt-3 text-gray-500">
          Subscribe for a monthly credit allowance, or buy credits as you go.
        </p>
      </div>

      {/* Free credits callout */}
      <div className="mb-10 flex items-center justify-center gap-3 rounded-xl border border-violet-100 bg-violet-50 px-5 py-3">
        <Gift className="h-5 w-5 text-violet-500" />
        <p className="text-sm text-violet-700">
          New users receive <strong>{WELCOME_CREDITS} free credits</strong> after email verification.{' '}
          {!session && (
            <a href="/signup" className="font-medium underline hover:text-violet-900">
              Create an account
            </a>
          )}
        </p>
      </div>

      <PricingClient
        isLoggedIn={isLoggedIn}
        activeSubscription={activeSub}
        razorpayKeyId={razorpayKeyId}
        userEmail={userEmail}
        userName={userName}
      />
    </div>
  )
}
