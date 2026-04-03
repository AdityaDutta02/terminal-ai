'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { CREDIT_PACKS, type CreditPackId } from '@/lib/pricing'

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
}

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
  opts['handler'] = () => { window.location.reload() }
  return opts
}

async function extractApiError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  return body.error ?? 'Something went wrong'
}

export function PricingClient(props: PricingClientProps) {
  const { isLoggedIn, activeSubscription, razorpayKeyId, userEmail, userName } = props
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [creditAmount, setCreditAmount] = useState(500)
  const [subLoading, setSubLoading] = useState(false)
  const [subError, setSubError] = useState<string | null>(null)
  const [creditLoading, setCreditLoading] = useState(false)
  const [creditError, setCreditError] = useState<string | null>(null)

  const isSubscribed = activeSubscription?.status === 'active'
  const creditPrice = getCreditPrice(creditAmount)
  const totalCreditPrice = Math.round(creditAmount * creditPrice)
  const discountLabel = getDiscountLabel(creditAmount)

  async function handleSubscribe(): Promise<void> {
    if (!isLoggedIn) { window.location.href = '/login?next=/pricing'; return }
    setSubLoading(true)
    setSubError(null)
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: 'creator' }),
      })
      if (!res.ok) throw new Error(await extractApiError(res))
      const { shortUrl } = (await res.json()) as { subscriptionId: string; shortUrl: string }
      if (!shortUrl.startsWith('https://rzp.io/') && !shortUrl.startsWith('https://pages.razorpay.com/')) {
        throw new Error('Invalid subscription URL')
      }
      window.location.href = shortUrl
    } catch (err) {
      setSubError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubLoading(false)
    }
  }

  async function handleBuyCredits(): Promise<void> {
    if (!isLoggedIn) { window.location.href = '/login?next=/pricing'; return }
    setCreditLoading(true)
    setCreditError(null)
    try {
      await loadRazorpayScript()
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
        orderId: string; amount: number; currency: string; keyId: string
      }

      const rzpOpts = buildRazorpayOpts({ key: keyId || razorpayKeyId, currency, orderId, amount, credits: creditAmount, email: userEmail, name: userName })
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
      <div className="max-w-[960px] mx-auto px-6 py-16">
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
              <span className="bg-[#FF6B00] text-white text-[11px] font-semibold px-3 py-1 rounded-full">Recommended</span>
            </div>
            <p className="text-[12px] font-semibold uppercase tracking-widest text-[#FF6B00] mb-1">Subscription</p>
            <p className="text-[14px] text-[#1e1e1f]/45 mb-5">Best value for regular users</p>

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
                    <span className="text-[40px] font-display text-[#1e1e1f] tracking-[-0.02em]">&#8377;2,499</span>
                    <span className="text-[14px] text-[#1e1e1f]/35">/year</span>
                  </div>
                  <p className="text-[13px] text-[#1e1e1f]/35 mt-0.5">Save &#8377;1,089 vs monthly</p>
                </>
              )}
            </div>

            {isSubscribed ? (
              <button disabled className="w-full py-3 rounded-full bg-[#1e1e1f]/10 text-[#1e1e1f]/40 font-medium text-[14px] cursor-not-allowed">
                Current plan
              </button>
            ) : (
              <button
                onClick={handleSubscribe} disabled={subLoading}
                className="w-full py-3 rounded-full bg-[#FF6B00] hover:bg-[#E55D00] text-white font-medium text-[14px] transition-all duration-200 hover:shadow-lg hover:shadow-orange-200/50 active:scale-[0.98] disabled:opacity-60"
              >
                {subLoading ? <><Spinner />Processing...</> : (isLoggedIn ? 'Subscribe now' : 'Sign in to subscribe')}
              </button>
            )}
            {subError && <p className="mt-2 text-[12px] text-red-500">{subError}</p>}

            <ul className="mt-6 space-y-2.5">
              {['Monthly credit allowance', 'Session-based billing', 'Access all marketplace apps', 'Email support', 'Usage analytics dashboard'].map((f) => (
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
            <p className="text-[14px] text-[#1e1e1f]/45 mb-6">Buy credits when you need them</p>

            <div className="mb-4">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[32px] font-display text-[#1e1e1f] tracking-[-0.02em]">
                  {creditAmount.toLocaleString()}
                </span>
                <span className="text-[13px] text-[#1e1e1f]/35">credits</span>
              </div>
              <input
                type="range" min={100} max={5000} step={100}
                value={creditAmount} onChange={(e) => setCreditAmount(Number(e.target.value))}
                className="w-full h-1.5 bg-[#1e1e1f]/10 rounded-full appearance-none cursor-pointer accent-[#1e1e1f]"
              />
              <div className="flex justify-between text-[11px] text-[#1e1e1f]/25 mt-1">
                <span>100</span><span>5,000</span>
              </div>
            </div>

            <div className="bg-[#f5f5f0] rounded-xl p-4 mb-5">
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-[24px] font-display text-[#1e1e1f]">&#8377;{totalCreditPrice.toLocaleString()}</span>
                  <span className="text-[13px] text-[#1e1e1f]/35 ml-1">one-time</span>
                </div>
                <span className="text-[12px] text-[#1e1e1f]/35">&#8377;{creditPrice.toFixed(2)}/credit</span>
              </div>
              {discountLabel && (
                <span className="inline-block mt-2 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                  {discountLabel}
                </span>
              )}
            </div>

            <button
              onClick={handleBuyCredits} disabled={creditLoading}
              className="w-full py-3 rounded-full bg-[#1e1e1f] hover:bg-[#333] text-white font-medium text-[14px] transition-all duration-200 hover:shadow-lg hover:shadow-black/15 active:scale-[0.98] disabled:opacity-60"
            >
              {creditLoading ? <><Spinner />Processing...</> : (isLoggedIn ? 'Buy credits' : 'Sign in to buy')}
            </button>
            {creditError && <p className="mt-2 text-[12px] text-red-500">{creditError}</p>}

            <p className="mt-4 text-[11px] text-[#1e1e1f]/25 text-center">Credits never expire. Powered by Razorpay.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
