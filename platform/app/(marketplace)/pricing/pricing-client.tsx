'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { CREDIT_RATE_INR } from '@/lib/pricing'

declare global {
  interface Window {
    Razorpay: new (opts: Record<string, unknown>) => { open(): void }
  }
}

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById('razorpay-script')) { resolve(); return }
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
  showInsufficientMessage?: boolean
  defaultBilling?: 'monthly' | 'annual'
  paymentCancelled?: boolean
}

function Spinner() {
  return <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
}

type RzpInput = {
  key: string; currency: string; orderId: string
  amount: number; credits: number; email: string; name: string
}

function buildRazorpayOpts(input: RzpInput): Record<string, unknown> {
  const opts: Record<string, unknown> = {}
  opts['key'] = input.key
  opts['currency'] = input.currency
  opts['order_id'] = input.orderId
  opts['amount'] = input.amount
  opts['name'] = 'Terminal AI'
  opts['description'] = `${input.credits.toLocaleString()} credits`
  opts['prefill'] = { email: input.email, name: input.name }
  opts['theme'] = { color: '#FF6B00' }
  opts['handler'] = () => { window.location.href = '/?paid=1' }
  return opts
}

async function extractApiError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  return body.error ?? 'Something went wrong'
}

export function PricingClient(props: PricingClientProps) {
  const { isLoggedIn, activeSubscription, razorpayKeyId, userEmail, userName, showInsufficientMessage, defaultBilling, paymentCancelled } = props
  const activePlanId = activeSubscription?.status === 'active' ? activeSubscription.plan_id as 'monthly' | 'annual' : null
  const [billing, setBilling] = useState<'monthly' | 'annual'>(defaultBilling ?? activePlanId ?? 'annual')
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'upi'>('card')
  const [amountInr, setAmountInr] = useState(500)
  const [subLoading, setSubLoading] = useState(false)
  const [subError, setSubError] = useState<string | null>(null)
  const [creditLoading, setCreditLoading] = useState(false)
  const [creditError, setCreditError] = useState<string | null>(null)
  const [showCancelledModal, setShowCancelledModal] = useState(paymentCancelled ?? false)

  // "Current plan" only shows when the selected tab matches the user's actual plan
  const isSubscribed = activePlanId === billing
  const creditPreview = Math.floor(amountInr / CREDIT_RATE_INR)

  async function handleSubscribe(): Promise<void> {
    if (!isLoggedIn) { window.location.href = '/login?next=/pricing'; return }
    setSubLoading(true)
    setSubError(null)
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: billing === 'annual' ? 'annual' : 'monthly',
          paymentMethod: billing === 'monthly' ? paymentMethod : undefined,
        }),
      })
      if (!res.ok) throw new Error(await extractApiError(res))
      const { subscriptionId, offerIdCard, offerIdUpi } = (await res.json()) as {
        subscriptionId: string; offerIdCard: string; offerIdUpi: string
      }
      const offerId = paymentMethod === 'upi' ? offerIdUpi : offerIdCard
      const params = new URLSearchParams()
      params.set('subscription_id', subscriptionId)
      params.set('key_id', razorpayKeyId)
      params.set('name', 'Terminal AI')
      params.set('description', billing === 'monthly' ? 'Monthly subscription' : 'Annual subscription')
      params.set('email', userEmail)
      params.set('user_name', userName)
      params.set('callback_url', `${window.location.origin}/`)
      params.set('cancel_url', `${window.location.origin}/pricing?payment=cancelled&plan=${billing}`)
      if (offerId) params.set('offer_id', offerId)
      window.location.href = `https://studioionique.com/pay?${params.toString()}`
    } catch (err) {
      setSubError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubLoading(false)
    }
  }

  async function handleBuyCredits(): Promise<void> {
    if (!isLoggedIn) { window.location.href = '/login?next=/pricing'; return }
    if (amountInr < 125) return
    setCreditLoading(true)
    setCreditError(null)
    try {
      await loadRazorpayScript()
      const res = await fetch('/api/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountInr }),
      })
      if (!res.ok) throw new Error(await extractApiError(res))
      const { orderId, amount, credits, currency, keyId } = (await res.json()) as {
        orderId: string; amount: number; credits: number; currency: string; keyId: string
      }

      const rzpOpts = buildRazorpayOpts({ key: keyId || razorpayKeyId, currency, orderId, amount, credits, email: userEmail, name: userName })
      const rzp = new window.Razorpay(rzpOpts)
      rzp.open()
    } catch (err) {
      setCreditError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setCreditLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      {/* Payment cancelled modal */}
      {showCancelledModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-[24px] p-8 max-w-[400px] w-full text-center shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-[#1e1e1f]/08 flex items-center justify-center mx-auto mb-5">
              <span className="text-2xl">&#9888;</span>
            </div>
            <h2 className="font-display text-[22px] text-[#1e1e1f] tracking-tight mb-2">Payment not completed</h2>
            <p className="text-[14px] text-[#1e1e1f]/50 mb-6">
              Your payment was cancelled or not completed. No charges were made. You can try again whenever you&apos;re ready.
            </p>
            <button
              onClick={() => setShowCancelledModal(false)}
              className="w-full py-3 rounded-full bg-[#1e1e1f] text-white font-medium text-[14px] hover:bg-[#333] transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      <div className="max-w-[960px] mx-auto px-6 py-16">
        {showInsufficientMessage && (
          <div className="mb-10 rounded-2xl border border-[#FF6B00]/20 bg-[#FF6B00]/[0.06] px-6 py-4 text-center">
            <p className="text-[13px] font-semibold text-[#FF6B00]">Not enough tokens</p>
            <p className="text-[13px] text-[#1e1e1f]/50 mt-0.5">Your token balance was too low to open that app. Subscribe or buy tokens to continue.</p>
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-14">
          <h1 className="font-display text-[clamp(32px,5vw,50px)] text-[#1e1e1f] tracking-[-0.02em] mb-3">
            Pricing
          </h1>
          <p className="text-[15px] text-[#1e1e1f]/45 max-w-[400px] mx-auto">
            Subscribe for monthly credits or buy as you go. No hidden fees.
          </p>

          {/* Billing toggle */}
          <div className="flex justify-center mt-8">
            <div className="inline-flex items-center bg-[#1e1e1f] rounded-full p-1">
              <button
                onClick={() => setBilling('monthly')}
                aria-pressed={billing === 'monthly'}
                aria-label="Monthly billing"
                className={`px-5 py-2 rounded-full text-[13px] font-medium transition-all duration-200 ${billing === 'monthly' ? 'bg-[#FF6B00] text-white' : 'text-white/50 hover:text-white/80'}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBilling('annual')}
                aria-pressed={billing === 'annual'}
                aria-label="Annual billing"
                className={`px-5 py-2 rounded-full text-[13px] font-medium transition-all duration-200 ${billing === 'annual' ? 'bg-[#FF6B00] text-white' : 'text-white/50 hover:text-white/80'}`}
              >
                Annual
              </button>
            </div>
          </div>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Subscription */}
          <div className="relative bg-white rounded-[24px] border-2 border-[#FF6B00] p-8">
            <div className="absolute -top-3 left-6">
              <span className="bg-[#FF6B00] text-white text-[11px] font-semibold px-3 py-1 rounded-full">
                {billing === 'annual' ? 'Best value' : 'Recommended'}
              </span>
            </div>
            <p className="text-[12px] font-semibold uppercase tracking-widest text-[#FF6B00] mb-1">
              {billing === 'annual' ? 'Annual Plan' : 'Monthly Plan'}
            </p>
            <p className="text-[14px] text-[#1e1e1f]/45 mb-5">
              {billing === 'annual'
                ? 'Lock in a lower rate -same credits, less spend'
                : 'Start at ₹99 -cancel any time'}
            </p>

            <div className="mb-6">
              {billing === 'monthly' ? (
                <>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[40px] font-display text-[#1e1e1f] tracking-[-0.02em]">&#8377;99</span>
                    <span className="text-[14px] text-[#1e1e1f]/35">/first month</span>
                  </div>
                  <p className="text-[13px] text-[#1e1e1f]/35 mt-0.5">then &#8377;299/month</p>
                </>
              ) : (
                <>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[40px] font-display text-[#1e1e1f] tracking-[-0.02em]">&#8377;2,490</span>
                    <span className="text-[14px] text-[#1e1e1f]/35">/year</span>
                  </div>
                  <p className="text-[13px] text-[#1e1e1f]/35 mt-0.5">Save &#8377;1,098 -over 3 months free</p>
                </>
              )}
            </div>

            {/* Payment method selector -only for monthly (offers differ per method) */}
            {billing === 'monthly' && !isSubscribed && (
              <div className="flex gap-2 mb-4">
                {(['card', 'upi'] as const).map((method) => (
                  <button
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    aria-pressed={paymentMethod === method}
                    className={`flex-1 py-2 rounded-xl text-[13px] font-medium border transition-all duration-150 ${
                      paymentMethod === method
                        ? 'bg-[#FF6B00]/10 border-[#FF6B00] text-[#FF6B00]'
                        : 'bg-white border-[#1e1e1f]/10 text-[#1e1e1f]/45 hover:border-[#1e1e1f]/25'
                    }`}
                  >
                    {method === 'card' ? 'Card' : 'UPI'}
                    {method === 'card'
                      ? <span className="block text-[10px] font-normal opacity-70">Visa / Mastercard</span>
                      : <span className="block text-[10px] font-normal opacity-70">GPay / PhonePe</span>
                    }
                  </button>
                ))}
              </div>
            )}

            {isSubscribed ? (
              <button disabled className="w-full py-3 rounded-full bg-[#1e1e1f]/10 text-[#1e1e1f]/40 font-medium text-[14px] cursor-not-allowed">
                Current plan
              </button>
            ) : (
              <button
                onClick={handleSubscribe} disabled={subLoading}
                className="w-full py-3 rounded-full bg-[#FF6B00] hover:bg-[#E55D00] text-white font-medium text-[14px] transition-all duration-200 hover:shadow-lg hover:shadow-orange-200/50 active:scale-[0.98] disabled:opacity-60"
              >
                {subLoading ? <><Spinner />Processing...</> : (isLoggedIn
                  ? (billing === 'annual' ? 'Get the best deal' : 'Start for ₹99')
                  : 'Sign in to subscribe')}
              </button>
            )}
            {subError && <p className="mt-2 text-[12px] text-red-500">{subError}</p>}

            <ul className="mt-6 space-y-2.5">
              {(billing === 'annual' ? [
                '300 credits per month -3,600 for the year',
                'Save ₹1,098 over monthly billing',
                'Every app on the marketplace',
                'Credits stay active all year',
                'Switch or cancel any time',
              ] : [
                '300 AI credits every month',
                'First month just ₹99',
                'Every app on the marketplace',
                'Credits valid for your billing period',
                'Cancel any time',
              ]).map((f) => (
                <li key={f} className="flex items-start gap-2 text-[13px] text-[#1e1e1f]/55">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B00] mt-1.5 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Pay as you go */}
          <div className="bg-white rounded-[24px] border border-[#1e1e1f]/[0.06] p-8">
            <p className="text-[12px] font-semibold uppercase tracking-widest text-[#1e1e1f]/35 mb-1">Pay as you go</p>
            <p className="text-[14px] text-[#1e1e1f]/45 mb-6">No commitment -buy only what you need</p>

            <div className="mb-4">
              <label className="block text-[12px] font-medium text-[#1e1e1f]/40 mb-2">Amount (min &#8377;125)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] font-display text-[#1e1e1f]/40">&#8377;</span>
                <input
                  type="number"
                  min={125}
                  max={50000}
                  step={1}
                  value={amountInr}
                  onChange={(e) => setAmountInr(Math.max(0, Math.round(Number(e.target.value))))}
                  className="w-full pl-8 pr-4 py-3 rounded-xl bg-[#f5f5f0] border border-[#1e1e1f]/[0.06] text-[18px] font-display text-[#1e1e1f] focus:outline-none focus:border-[#1e1e1f]/20"
                />
              </div>
              {amountInr < 125 && (
                <p className="mt-1 text-[11px] text-red-500">Minimum is &#8377;125</p>
              )}
            </div>

            <div className="bg-[#f5f5f0] rounded-xl p-4 mb-5">
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-[24px] font-display text-[#1e1e1f]">{creditPreview.toLocaleString()}</span>
                  <span className="text-[13px] text-[#1e1e1f]/35 ml-1">credits</span>
                </div>
                <span className="text-[12px] text-[#1e1e1f]/35">&#8377;{CREDIT_RATE_INR.toFixed(2)}/credit</span>
              </div>
              <p className="text-[11px] text-[#1e1e1f]/35 mt-2">Subscribe to pay 20% less per credit</p>
            </div>

            <button
              onClick={handleBuyCredits} disabled={creditLoading}
              className="w-full py-3 rounded-full bg-[#1e1e1f] hover:bg-[#333] text-white font-medium text-[14px] transition-all duration-200 hover:shadow-lg hover:shadow-black/15 active:scale-[0.98] disabled:opacity-60"
            >
              {creditLoading ? <><Spinner />Processing...</> : (isLoggedIn ? `Buy ${creditPreview.toLocaleString()} credits` : 'Sign in to buy')}
            </button>
            {creditError && <p className="mt-2 text-[12px] text-red-500">{creditError}</p>}

            <p className="mt-4 text-[11px] text-[#1e1e1f]/25 text-center">Credits valid for 12 months from purchase. Powered by Razorpay.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
