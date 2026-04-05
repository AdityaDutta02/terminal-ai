'use client'

import { useState } from 'react'

// Razorpay is blocked on terminalai.studioionique.com (not an approved domain).
// Workaround: redirect to studioionique.com/pay (approved domain) which opens the
// Razorpay checkout modal there, then redirects back here on success.
const PAY_RELAY_URL = 'https://studioionique.com/pay'

interface TopUpButtonProps {
  credits: number
  price: string
  planCode: string
  popular?: boolean
  razorpayKeyId: string
  userEmail: string
  userName: string
}

export function TopUpButton(props: TopUpButtonProps) {
  const { credits, price, planCode, popular, razorpayKeyId, userEmail, userName } = props
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Failed to create order')
      }
      const { orderId, amount } = await res.json() as { orderId: string; amount: number }

      // Redirect to approved domain to open Razorpay checkout
      const callbackUrl = `${window.location.origin}/dashboard`
      const params = new URLSearchParams({
        order_id: orderId,
        amount: String(amount),
        currency: 'INR',
        key_id: razorpayKeyId,
        name: 'Terminal AI',
        description: `${credits.toLocaleString()} credits`,
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
    <div className="flex flex-col">
      <button
        onClick={handleClick}
        disabled={loading}
        data-testid="top-up-button"
        className={`relative rounded-2xl border p-5 text-left transition-all hover:shadow-sm disabled:opacity-60 ${
          popular
            ? 'border-orange-300 shadow-[0_0_0_1px_rgba(255,107,0,0.15)] bg-white'
            : 'border-slate-200 bg-white hover:border-slate-300'
        }`}
      >
        {popular && (
          <span className="absolute -top-2.5 left-3 text-[11px] font-bold text-white bg-orange-500 px-2.5 py-0.5 rounded-full">
            Popular
          </span>
        )}
        <p className="text-[32px] font-extrabold font-mono text-slate-900">{credits.toLocaleString()}</p>
        <p className="text-[13px] text-slate-500">credits</p>
        <p className="mt-3 text-[15px] font-semibold text-slate-700">{loading ? 'Opening\u2026' : price}</p>
        <div className={`mt-3 w-full h-[36px] rounded-xl text-[13px] font-medium flex items-center justify-center transition-colors ${
          popular
            ? 'bg-orange-500 text-white hover:bg-orange-600'
            : 'bg-slate-900 text-white hover:bg-slate-800'
        }`}>
          Buy now
        </div>
      </button>
      {error && (
        <p data-testid="top-up-error" className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  )
}
