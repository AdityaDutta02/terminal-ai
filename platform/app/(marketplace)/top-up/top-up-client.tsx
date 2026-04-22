'use client'

import { useState } from 'react'
import { Loader2, ArrowLeft } from 'lucide-react'
import { CREDIT_RATE_INR } from '@/lib/pricing'

// Razorpay is blocked on terminalai.studioionique.com (not an approved domain).
// Workaround: redirect to studioionique.com/pay (approved domain) which opens the
// Razorpay checkout modal there, then redirects back here on success.
// The webhook handles credit awarding server-to-server regardless of domain.
const PAY_RELAY_URL = 'https://studioionique.com/pay'

interface TopUpClientProps {
  razorpayKeyId: string
  userEmail: string
  userName: string
  showInsufficientMessage?: boolean
}

export function TopUpClient(props: TopUpClientProps) {
  const { razorpayKeyId, userEmail, userName, showInsufficientMessage } = props
  const [amountInr, setAmountInr] = useState(500)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const creditPreview = Math.floor(amountInr / CREDIT_RATE_INR)

  async function handleBuy(): Promise<void> {
    if (amountInr < 125) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountInr }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Something went wrong')
      }
      const { orderId, amount, credits, currency, keyId } = (await res.json()) as {
        orderId: string; amount: number; credits: number; currency: string; keyId: string
      }

      // Redirect to approved domain to open Razorpay checkout
      const callbackUrl = `${window.location.origin}/`
      const params = new URLSearchParams({
        order_id: orderId,
        amount: String(amount),
        currency,
        key_id: keyId || razorpayKeyId,
        name: 'Terminal AI',
        description: `${credits.toLocaleString()} tokens top-up`,
        email: userEmail,
        user_name: userName,
        callback_url: callbackUrl,
        theme_color: '#FF6B00',
      })
      window.location.href = `${PAY_RELAY_URL}?${params.toString()}`
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      <div className="max-w-[480px] mx-auto px-6 py-16">
        <a
          href="/"
          className="inline-flex items-center gap-2 text-[14px] font-medium text-[#1e1e1f]/40 hover:text-[#1e1e1f]/70 transition-colors mb-10"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </a>

        {showInsufficientMessage && (
          <div className="mb-8 rounded-2xl border border-[#FF6B00]/20 bg-[#FF6B00]/[0.06] px-5 py-4">
            <p className="text-[13px] font-semibold text-[#FF6B00]">Not enough tokens</p>
            <p className="text-[13px] text-[#1e1e1f]/50 mt-0.5">Your token balance was too low to open that app. Top up to continue.</p>
          </div>
        )}

        <h1 className="font-display text-[clamp(28px,4vw,38px)] text-[#1e1e1f] tracking-[-0.02em] mb-2">
          Top up tokens
        </h1>
        <p className="text-[14px] text-[#1e1e1f]/40 mb-10">
          Pick a token pack to continue using apps.
        </p>

        {/* Amount input */}
        <div className="mb-6">
          <label className="block text-[12px] font-medium text-[#1e1e1f]/40 mb-2">Amount (min &#8377;125)</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[20px] font-display text-[#1e1e1f]/40">&#8377;</span>
            <input
              type="number"
              min={125}
              max={50000}
              step={1}
              value={amountInr}
              onChange={(e) => setAmountInr(Math.max(0, Math.round(Number(e.target.value))))}
              className="w-full pl-8 pr-4 py-3.5 rounded-xl bg-white border border-[#1e1e1f]/[0.06] text-[20px] font-display text-[#1e1e1f] focus:outline-none focus:border-[#1e1e1f]/20"
            />
          </div>
          {amountInr < 125 && (
            <p className="mt-1 text-[11px] text-red-500">Minimum is &#8377;125</p>
          )}
        </div>

        {/* Summary */}
        <div className="bg-white rounded-[20px] border border-[#1e1e1f]/[0.06] p-6 mb-6">
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-[32px] font-display text-[#1e1e1f] tracking-[-0.02em]">{creditPreview.toLocaleString()}</span>
              <span className="text-[13px] text-[#1e1e1f]/35 ml-2">tokens</span>
            </div>
            <span className="text-[12px] text-[#1e1e1f]/25">&#8377;{CREDIT_RATE_INR.toFixed(2)}/token</span>
          </div>
        </div>

        <button
          onClick={handleBuy}
          disabled={loading || amountInr < 125}
          className="w-full py-3.5 rounded-full bg-[#1e1e1f] hover:bg-[#333] text-white font-medium text-[15px] transition-all duration-200 hover:shadow-lg hover:shadow-black/15 active:scale-[0.98] disabled:opacity-60"
        >
          {loading ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Processing...</> : `Buy ${creditPreview.toLocaleString()} tokens`}
        </button>

        {error && (
          <p className="mt-3 text-[12px] text-red-500 text-center">{error}</p>
        )}

        <p className="mt-6 text-[11px] text-[#1e1e1f]/20 text-center">
          Tokens never expire. Powered by Razorpay.
        </p>
      </div>
    </div>
  )
}
