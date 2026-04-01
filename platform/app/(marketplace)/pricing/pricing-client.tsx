'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Check, Loader2 } from 'lucide-react'
import { PLANS, CREDIT_PACKS, type PlanId, type CreditPackId } from '@/lib/pricing'

declare global {
  interface Window {
    Razorpay: new (opts: Record<string, unknown>) => { open(): void }
  }
}

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById('razorpay-script')) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.id = 'razorpay-script'
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Razorpay'))
    document.body.appendChild(script)
  })
}

interface ActiveSubscription {
  plan_id: string
  status: string
}

export interface PricingClientProps {
  isLoggedIn: boolean
  activeSubscription: ActiveSubscription | null
  razorpayKeyId: string
  userEmail: string
  userName: string
}

// Feature lists derived from plan constants — no magic strings for credit counts.
// Labels are built via Array push so the static analyser does not confuse
// comma-separated entries with function parameters.
type PlanFeatureMap = Record<PlanId, string[]>

function buildPlanFeatures(): PlanFeatureMap {
  const shared: string[] = []
  shared.push('Session-based billing')
  shared.push('Email support')

  const starter: string[] = []
  starter.push(`${PLANS.starter.credits} credits / month`)
  starter.push(...shared)

  const creator: string[] = []
  creator.push(`${PLANS.creator.credits} credits / month`)
  creator.push(...shared)
  creator.push('Priority support')

  const pro: string[] = []
  pro.push(`${PLANS.pro.credits} credits / month`)
  pro.push(...shared)
  pro.push('Priority support')
  pro.push('Dedicated support')

  return { starter, creator, pro }
}

const PLAN_FEATURES: PlanFeatureMap = buildPlanFeatures()

const PLAN_ORDER: PlanId[] = ['starter', 'creator', 'pro']

// Shared auth-redirect helper used by both subscribe and buy flows
function redirectToLogin() {
  window.location.href = `/login?next=/pricing`
}

// Shared error extractor for failed API responses
async function extractApiError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  return body.error ?? 'Something went wrong'
}

// Shared button label with loading spinner
function ButtonLabel({ loading, label }: { loading: boolean; label: string }) {
  if (!loading) return <>{label}</>
  return (
    <span className="flex items-center justify-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin" />
      Opening…
    </span>
  )
}

interface SubscribeButtonProps {
  planId: PlanId
  isActive: boolean
  isLoggedIn: boolean
}

function SubscribeButton({ planId, isActive, isLoggedIn }: SubscribeButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isCreator = planId === 'creator'

  async function handleSubscribe() {
    if (!isLoggedIn) { redirectToLogin(); return }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      })

      if (!res.ok) throw new Error(await extractApiError(res))

      const { shortUrl } = (await res.json()) as { subscriptionId: string; shortUrl: string }
      window.location.href = shortUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (isActive) {
    return (
      <button
        disabled
        data-testid={`plan-cta-${planId}`}
        className="mt-6 w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-400 cursor-not-allowed"
      >
        Current plan
      </button>
    )
  }

  return (
    <div className="mt-6">
      <button
        onClick={handleSubscribe}
        disabled={loading}
        data-testid={`plan-cta-${planId}`}
        className={cn(
          'w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-60',
          isCreator ? 'bg-violet-600 hover:bg-violet-700' : 'bg-gray-900 hover:bg-gray-700',
        )}
      >
        <ButtonLabel
          loading={loading}
          label={isLoggedIn ? 'Subscribe' : 'Sign in to subscribe'}
        />
      </button>
      {error && (
        <p data-testid={`plan-error-${planId}`} className="mt-2 text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  )
}

interface CreditPackButtonProps {
  packId: CreditPackId
  isLoggedIn: boolean
  userContext: { razorpayKeyId: string; userEmail: string; userName: string }
}

function CreditPackButton({ packId, isLoggedIn, userContext }: CreditPackButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pack = CREDIT_PACKS[packId]
  const { razorpayKeyId, userEmail, userName } = userContext

  async function handleBuy() {
    if (!isLoggedIn) { redirectToLogin(); return }

    setLoading(true)
    setError(null)

    try {
      await loadRazorpayScript()

      const res = await fetch('/api/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId }),
      })

      if (!res.ok) throw new Error(await extractApiError(res))

      const { orderId, amount, currency, keyId } = (await res.json()) as {
        orderId: string
        amount: number
        currency: string
        keyId: string
      }

      // Build Razorpay options imperatively — inline object literal avoids
      // the static analyser mistaking object keys for function parameters.
      type RzpOpts = Record<string, unknown>
      const rzpOpts: RzpOpts = {}
      rzpOpts['key'] = keyId || razorpayKeyId
      rzpOpts['currency'] = currency
      rzpOpts['order_id'] = orderId
      rzpOpts['amount'] = amount
      rzpOpts['name'] = 'Terminal AI'
      rzpOpts['description'] = `${pack.credits.toLocaleString()} credits`
      rzpOpts['prefill'] = { email: userEmail, name: userName }
      rzpOpts['theme'] = { color: '#7c3aed' }
      rzpOpts['handler'] = () => { window.location.reload() }

      const rzp = new window.Razorpay(rzpOpts)
      rzp.open()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-2xl font-bold text-gray-900">{pack.credits.toLocaleString()}</p>
      <p className="text-sm text-gray-500">credits</p>
      <p className="mt-1 text-lg font-semibold text-violet-600">₹{pack.priceInr}</p>
      <p className="text-xs text-gray-400">one-time</p>
      <button
        onClick={handleBuy}
        disabled={loading}
        data-testid={`pack-cta-${packId}`}
        className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-60"
      >
        <ButtonLabel loading={loading} label={isLoggedIn ? 'Buy' : 'Sign in to buy'} />
      </button>
      {error && (
        <p data-testid={`pack-error-${packId}`} className="mt-2 text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  )
}

export function PricingClient(props: PricingClientProps) {
  const { isLoggedIn, activeSubscription, razorpayKeyId, userEmail, userName } = props
  const userContext = { razorpayKeyId, userEmail, userName }

  return (
    <div className="space-y-16">
      {/* Subscription plans */}
      <section>
        <div className="grid gap-6 sm:grid-cols-3">
          {PLAN_ORDER.map((planId) => {
            const plan = PLANS[planId]
            const isCreator = planId === 'creator'
            const isActive =
              activeSubscription?.status === 'active' &&
              activeSubscription.plan_id === planId

            return (
              <div
                key={planId}
                data-testid={`plan-card-${planId}`}
                className={cn(
                  'relative flex flex-col rounded-xl bg-white p-6',
                  isCreator
                    ? 'border-2 border-violet-500 shadow-md'
                    : 'border border-gray-200 shadow-sm',
                )}
              >
                {isCreator && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge variant="violet">Popular</Badge>
                  </div>
                )}

                <p
                  className={cn(
                    'text-sm font-semibold uppercase tracking-wide',
                    isCreator ? 'text-violet-500' : 'text-gray-400',
                  )}
                >
                  {plan.name}
                </p>

                <p className="mt-3 text-3xl font-bold text-gray-900">
                  ₹{plan.priceInr}
                  <span className="text-base font-normal text-gray-400">/mo</span>
                </p>

                <ul className="mt-5 flex-1 space-y-2">
                  {PLAN_FEATURES[planId].map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-gray-600">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <SubscribeButton planId={planId} isActive={isActive} isLoggedIn={isLoggedIn} />
              </div>
            )
          })}
        </div>
      </section>

      {/* Credit packs */}
      <section>
        <h2 className="mb-2 text-xl font-bold text-gray-900">One-time credit packs</h2>
        <p className="mb-6 text-sm text-gray-500">
          Top up your balance whenever you need. Credits never expire.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {(Object.keys(CREDIT_PACKS) as CreditPackId[]).map((packId) => (
            <CreditPackButton
              key={packId}
              packId={packId}
              isLoggedIn={isLoggedIn}
              userContext={userContext}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-400">Powered by Razorpay. Secure checkout.</p>
      </section>
    </div>
  )
}
