'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Check, Loader2, Sparkles, Shield, Zap } from 'lucide-react'
import { PLANS, CREDIT_PACKS, type PlanId, type CreditPackId } from '@/lib/pricing'
import { Footer } from '@/components/footer'

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

export interface PricingClientProps {
  isLoggedIn: boolean
  activeSubscription: { plan_id: string; status: string } | null
  razorpayKeyId: string
  userEmail: string
  userName: string
}

function redirectToLogin(): void {
  window.location.href = '/login?next=/pricing'
}

async function extractApiError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  return body.error ?? 'Something went wrong'
}

function ButtonLabel({ loading, label }: { loading: boolean; label: string }) {
  if (!loading) return <>{label}</>
  return (
    <span className="flex items-center justify-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin" />
      Opening...
    </span>
  )
}

/* ── Credit pricing tiers ── */
function getCreditPrice(amount: number): number {
  if (amount <= 500) return 0.45
  if (amount <= 1500) return 0.38
  if (amount <= 3000) return 0.30
  return 0.24
}

function getDiscountLabel(amount: number): string | null {
  if (amount <= 500) return null
  if (amount <= 1500) return '15% off'
  if (amount <= 3000) return '33% off'
  return '47% off'
}

/* ── Subscription features ── */
const subscriptionFeatures = [
  'Monthly credit allowance',
  'Session-based billing',
  'Access all marketplace apps',
  'Email support',
  'Priority support (Creator+)',
  'Usage analytics dashboard',
]

/* ── Trust section items ── */
const trustItems = [
  {
    icon: Shield,
    title: 'Secure by default',
    desc: 'Bank-grade encryption. Your data never leaves our infrastructure.',
  },
  {
    icon: Zap,
    title: 'Lightning fast',
    desc: 'Sub-second inference. Optimized pipelines for every model tier.',
  },
  {
    icon: Sparkles,
    title: 'Pay only for what you use',
    desc: 'Credits map to actual compute. No hidden fees, no surprises.',
  },
]

export function PricingClient(props: PricingClientProps) {
  const { isLoggedIn, activeSubscription, razorpayKeyId, userEmail, userName } = props
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [creditAmount, setCreditAmount] = useState(500)
  const [subLoading, setSubLoading] = useState(false)
  const [subError, setSubError] = useState<string | null>(null)
  const [creditLoading, setCreditLoading] = useState(false)
  const [creditError, setCreditError] = useState<string | null>(null)

  const isSubscribed =
    activeSubscription?.status === 'active'

  const monthlyPrice = 299
  const firstMonthPrice = 99
  const annualPrice = 2499

  const creditPrice = getCreditPrice(creditAmount)
  const totalCreditPrice = Math.round(creditAmount * creditPrice)
  const discountLabel = getDiscountLabel(creditAmount)

  async function handleSubscribe(): Promise<void> {
    if (!isLoggedIn) { redirectToLogin(); return }
    setSubLoading(true)
    setSubError(null)
    try {
      const planId: PlanId = 'creator'
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      })
      if (!res.ok) throw new Error(await extractApiError(res))
      const { shortUrl } = (await res.json()) as { subscriptionId: string; shortUrl: string }
      window.location.href = shortUrl
    } catch (err) {
      setSubError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubLoading(false)
    }
  }

  async function handleBuyCredits(): Promise<void> {
    if (!isLoggedIn) { redirectToLogin(); return }
    setCreditLoading(true)
    setCreditError(null)
    try {
      await loadRazorpayScript()
      // Find the closest pack
      const packIds = Object.keys(CREDIT_PACKS) as CreditPackId[]
      const packId = packIds.reduce((closest, pid) => {
        const diff = Math.abs(CREDIT_PACKS[pid].credits - creditAmount)
        const closestDiff = Math.abs(CREDIT_PACKS[closest].credits - creditAmount)
        return diff < closestDiff ? pid : closest
      }, packIds[0])

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

      type RzpOpts = Record<string, unknown>
      const rzpOpts: RzpOpts = {}
      rzpOpts['key'] = keyId || razorpayKeyId
      rzpOpts['currency'] = currency
      rzpOpts['order_id'] = orderId
      rzpOpts['amount'] = amount
      rzpOpts['name'] = 'Terminal AI'
      rzpOpts['description'] = `${creditAmount.toLocaleString()} credits`
      rzpOpts['prefill'] = { email: userEmail, name: userName }
      rzpOpts['theme'] = { color: '#FF6B00' }
      rzpOpts['handler'] = () => { window.location.reload() }

      const rzp = new window.Razorpay(rzpOpts)
      rzp.open()
    } catch (err) {
      setCreditError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setCreditLoading(false)
    }
  }

  return (
    <>
      {/* Dark hero header */}
      <div className="bg-[#0A0A0A] pt-16 pb-24">
        <div className="max-w-[1200px] mx-auto px-6 text-center">
          <h1 className="text-4xl sm:text-[48px] font-black text-white tracking-tight leading-tight">
            Simple, transparent pricing
          </h1>
          <p className="mt-4 text-white/50 text-lg">
            Subscribe for monthly credits or pay as you go.
          </p>

          {/* Billing toggle */}
          <div className="mt-8 inline-flex items-center bg-white/10 rounded-full p-1">
            <button
              onClick={() => setBilling('monthly')}
              className={cn(
                'px-5 py-2 rounded-full text-sm font-medium transition-colors',
                billing === 'monthly'
                  ? 'bg-[#FF6B00] text-white'
                  : 'text-white/60 hover:text-white/80',
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling('annual')}
              className={cn(
                'px-5 py-2 rounded-full text-sm font-medium transition-colors',
                billing === 'annual'
                  ? 'bg-[#FF6B00] text-white'
                  : 'text-white/60 hover:text-white/80',
              )}
            >
              Annual
            </button>
          </div>
        </div>
      </div>

      {/* Pricing cards */}
      <div className="max-w-[960px] mx-auto px-6 -mt-12">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Subscription card */}
          <div className="relative bg-white rounded-2xl border-2 border-[#FF6B00] shadow-lg p-8">
            <div className="absolute -top-3 left-6">
              <span className="bg-[#FF6B00] text-white text-xs font-semibold px-3 py-1 rounded-full">
                Recommended
              </span>
            </div>

            <p className="text-sm font-semibold uppercase tracking-wide text-orange-600 mb-1">
              Subscription
            </p>
            <p className="text-sm text-slate-500 mb-4">
              Best value for regular users
            </p>

            {billing === 'monthly' ? (
              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-slate-900">
                    ₹{firstMonthPrice}
                  </span>
                  <span className="text-slate-400">/first month</span>
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  then ₹{monthlyPrice}/month
                </p>
              </div>
            ) : (
              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-slate-900">
                    ₹{annualPrice.toLocaleString()}
                  </span>
                  <span className="text-slate-400">/year</span>
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  Save ₹{(monthlyPrice * 12 - annualPrice).toLocaleString()} vs monthly
                </p>
              </div>
            )}

            {isSubscribed ? (
              <button
                disabled
                className="w-full py-3 rounded-xl bg-slate-100 text-slate-400 font-semibold text-sm cursor-not-allowed"
              >
                Current plan
              </button>
            ) : (
              <button
                onClick={handleSubscribe}
                disabled={subLoading}
                className="w-full py-3 rounded-xl bg-[#FF6B00] hover:bg-[#E55D00] text-white font-semibold text-sm shadow-lg shadow-orange-200/50 transition-colors disabled:opacity-60"
              >
                <ButtonLabel
                  loading={subLoading}
                  label={isLoggedIn ? 'Subscribe now' : 'Sign in to subscribe'}
                />
              </button>
            )}
            {subError && (
              <p className="mt-2 text-xs text-red-500">{subError}</p>
            )}

            <ul className="mt-6 space-y-2.5">
              {subscriptionFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-slate-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {/* Pay-as-you-go card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Pay as you go
            </p>
            <p className="text-sm text-slate-500 mb-6">
              Buy credits when you need them
            </p>

            {/* Credit slider */}
            <div className="mb-4">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-3xl font-bold text-slate-900">
                  {creditAmount.toLocaleString()}
                </span>
                <span className="text-sm text-slate-400">credits</span>
              </div>
              <input
                type="range"
                min={100}
                max={5000}
                step={100}
                value={creditAmount}
                onChange={(e) => setCreditAmount(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-[#FF6B00]"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>100</span>
                <span>5,000</span>
              </div>
            </div>

            {/* Dynamic price */}
            <div className="bg-slate-50 rounded-xl p-4 mb-4">
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-2xl font-bold text-slate-900">
                    ₹{totalCreditPrice.toLocaleString()}
                  </span>
                  <span className="text-sm text-slate-400 ml-1">one-time</span>
                </div>
                <span className="text-xs text-slate-400">
                  ₹{creditPrice.toFixed(2)}/credit
                </span>
              </div>
              {discountLabel && (
                <span className="inline-block mt-2 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                  {discountLabel}
                </span>
              )}
            </div>

            <button
              onClick={handleBuyCredits}
              disabled={creditLoading}
              className="w-full py-3 rounded-xl bg-[#0A0A0A] hover:bg-slate-800 text-white font-semibold text-sm transition-colors disabled:opacity-60"
            >
              <ButtonLabel
                loading={creditLoading}
                label={isLoggedIn ? 'Buy credits' : 'Sign in to buy'}
              />
            </button>
            {creditError && (
              <p className="mt-2 text-xs text-red-500">{creditError}</p>
            )}

            <p className="mt-4 text-xs text-slate-400 text-center">
              Credits never expire. Powered by Razorpay.
            </p>
          </div>
        </div>
      </div>

      {/* Trust section */}
      <div className="max-w-[960px] mx-auto px-6 mt-20 mb-16">
        <h2 className="text-center text-xl font-bold text-slate-900 mb-8">
          Why teams choose Terminal AI
        </h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {trustItems.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.title}
                className="bg-[#0A0A0A] rounded-2xl p-6 text-center"
              >
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mx-auto mb-3">
                  <Icon className="w-5 h-5 text-orange-400" />
                </div>
                <h3 className="text-sm font-semibold text-white mb-1">{item.title}</h3>
                <p className="text-xs text-white/50 leading-relaxed">{item.desc}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="max-w-[1200px] mx-auto px-6">
        <Footer />
      </div>
    </>
  )
}
