'use client'

import { useState } from 'react'
import { Loader2, ArrowLeft } from 'lucide-react'
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

interface TopUpClientProps {
  razorpayKeyId: string
  userEmail: string
  userName: string
  showInsufficientMessage?: boolean
}

type RzpInput = {
  key: string; currency: string; orderId: string
  amount: number; credits: number; email: string; name: string
}

function buildRzpOpts(input: RzpInput): Record<string, unknown> {
  const opts: Record<string, unknown> = {}
  opts['key'] = input.key
  opts['currency'] = input.currency
  opts['order_id'] = input.orderId
  opts['amount'] = input.amount
  opts['name'] = 'Terminal AI'
  opts['description'] = `${input.credits.toLocaleString()} tokens top-up`
  opts['prefill'] = { email: input.email, name: input.name }
  opts['theme'] = { color: '#FF6B00' }
  opts['handler'] = () => { window.location.href = '/' }
  return opts
}

const AMOUNTS = [100, 500, 1000, 2000] as const

function getPrice(amount: number): number {
  if (amount <= 100) return 89
  if (amount <= 500) return 399
  if (amount <= 1000) return 699
  return 1499
}

export function TopUpClient(props: TopUpClientProps) {
  const { razorpayKeyId, userEmail, userName, showInsufficientMessage } = props
  const [selected, setSelected] = useState(500)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const price = getPrice(selected)

  async function handleBuy(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      await loadRazorpayScript()
      const packIds = Object.keys(CREDIT_PACKS) as CreditPackId[]
      const packId = packIds.reduce((closest, pid) => {
        const diff = Math.abs(CREDIT_PACKS[pid].credits - selected)
        const closestDiff = Math.abs(CREDIT_PACKS[closest].credits - selected)
        return diff < closestDiff ? pid : closest
      }, packIds[0])

      const res = await fetch('/api/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Something went wrong')
      }
      const { orderId, amount, currency, keyId } = (await res.json()) as {
        orderId: string; amount: number; currency: string; keyId: string
      }

      const rzp = new window.Razorpay(buildRzpOpts({
        key: keyId || razorpayKeyId, currency, orderId, amount,
        credits: selected, email: userEmail, name: userName,
      }))
      rzp.open()
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

        {/* Amount selector */}
        <div className="grid grid-cols-4 gap-3 mb-8">
          {AMOUNTS.map((amt) => (
            <button
              key={amt}
              onClick={() => setSelected(amt)}
              aria-pressed={selected === amt}
              aria-label={`${amt.toLocaleString()} tokens`}
              className={`py-3 rounded-[16px] text-center transition-all duration-200 ${
                selected === amt
                  ? 'bg-[#1e1e1f] text-white shadow-lg shadow-black/10'
                  : 'bg-white border border-[#1e1e1f]/[0.06] text-[#1e1e1f] hover:border-[#1e1e1f]/20'
              }`}
            >
              <span className="block text-[18px] font-semibold font-mono">{amt.toLocaleString()}</span>
              <span className={`block text-[11px] mt-0.5 ${selected === amt ? 'text-white/50' : 'text-[#1e1e1f]/30'}`}>tokens</span>
            </button>
          ))}
        </div>

        {/* Price summary */}
        <div className="bg-white rounded-[20px] border border-[#1e1e1f]/[0.06] p-6 mb-6">
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-[32px] font-display text-[#1e1e1f] tracking-[-0.02em]">&#8377;{price.toLocaleString()}</span>
              <span className="text-[13px] text-[#1e1e1f]/35 ml-2">one-time</span>
            </div>
            <span className="text-[12px] text-[#1e1e1f]/25">&#8377;{(price / selected).toFixed(2)}/token</span>
          </div>
        </div>

        <button
          onClick={handleBuy}
          disabled={loading}
          className="w-full py-3.5 rounded-full bg-[#1e1e1f] hover:bg-[#333] text-white font-medium text-[15px] transition-all duration-200 hover:shadow-lg hover:shadow-black/15 active:scale-[0.98] disabled:opacity-60"
        >
          {loading ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Processing...</> : `Buy ${selected.toLocaleString()} tokens`}
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
