'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface TopUpButtonProps {
  credits: number
  price: string
  planCode: string
  popular?: boolean
  razorpayKeyId: string
  userEmail: string
  userName: string
}

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

export function TopUpButton(props: TopUpButtonProps) {
  const { credits, price, planCode, popular, razorpayKeyId, userEmail, userName } = props
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      await loadRazorpayScript()
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Failed to create order')
      }
      const { orderId } = await res.json() as { orderId: string; amount: number }
      const rzpOpts: Record<string, unknown> = { key: razorpayKeyId, currency: 'INR', order_id: orderId }
      rzpOpts.name = 'Terminal AI'
      rzpOpts.description = `${credits.toLocaleString()} credits`
      rzpOpts.prefill = { email: userEmail, name: userName }
      rzpOpts.theme = { color: '#FF6B00' }
      rzpOpts.handler = () => { router.refresh() }
      const rzp = new window.Razorpay(rzpOpts)
      rzp.open()
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
