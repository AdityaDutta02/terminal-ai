'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'

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
  async function handleClick() {
    setLoading(true)
    try {
      await loadRazorpayScript()
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode }),
      })
      if (!res.ok) throw new Error('Failed to create order')
      const { orderId, amount } = await res.json() as { orderId: string; amount: number }
      const rzpOpts: Record<string, unknown> = { key: razorpayKeyId, amount, currency: 'INR', order_id: orderId }
      rzpOpts.name = 'Terminal AI'
      rzpOpts.description = `${credits.toLocaleString()} credits`
      rzpOpts.prefill = { email: userEmail, name: userName }
      rzpOpts.theme = { color: '#7c3aed' }
      rzpOpts.handler = () => { router.refresh() }
      const rzp = new window.Razorpay(rzpOpts)
      rzp.open()
    } finally {
      setLoading(false)
    }
  }
  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`relative rounded-xl border p-4 text-left transition-all hover:border-violet-300 hover:shadow-sm disabled:opacity-60 ${popular ? 'border-violet-300 bg-violet-50' : 'border-gray-200 bg-white'}`}
    >
      {popular && (
        <Badge variant="violet" className="absolute -top-2 left-3">Popular</Badge>
      )}
      <p className="text-lg font-bold text-gray-900">{credits.toLocaleString()}</p>
      <p className="text-xs text-gray-500">credits</p>
      <p className="mt-2 font-semibold text-violet-600">{loading ? 'Opening…' : price}</p>
    </button>
  )
}
