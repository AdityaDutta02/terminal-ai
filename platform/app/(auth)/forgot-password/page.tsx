'use client'
import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { Zap, Mail } from 'lucide-react'

const inputClass =
  'w-full h-[44px] px-4 rounded-xl border border-slate-200 text-[14px] text-slate-700 placeholder-slate-400 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all'
const labelClass = 'text-[13px] font-medium text-slate-700 mb-1.5 block'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    // better-auth exposes forgetPassword at runtime but types may lag — cast to bypass
    const client = authClient as unknown as {
      forgetPassword: (opts: { email: string; redirectTo: string }) => Promise<{ error: { message?: string } | null }>
    }
    const { error } = await client.forgetPassword({ email, redirectTo: '/reset-password' })
    setLoading(false)
    if (error) {
      setError(error.message ?? 'Failed to send reset email.')
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
        <div className="w-full max-w-[420px] text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white">
            <Mail className="h-6 w-6 text-[#0A0A0A]" />
          </div>
          <h1 className="text-[28px] font-black text-white">Check your email</h1>
          <p className="mt-2 text-sm text-white/40">
            We sent a password reset link to{' '}
            <strong className="text-white/70">{email}</strong>.
          </p>
          <a
            href="/login"
            className="mt-6 inline-block text-sm font-medium text-[#FF6B00] hover:underline"
          >
            Back to sign in
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
      <div className="w-full max-w-[420px]">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white">
            <Zap className="h-6 w-6 text-[#0A0A0A]" strokeWidth={2.5} />
          </div>
          <h1 className="text-[28px] font-black text-white">Reset your password</h1>
          <p className="mt-1 text-sm text-white/40">Enter your email and we'll send a reset link</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className={labelClass}>
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={inputClass}
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0A0A0A] hover:bg-[#1A1A1A] text-white rounded-xl py-3 text-[14px] font-bold transition-colors disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-white/40">
          Remember your password?{' '}
          <a href="/login" className="font-medium text-[#FF6B00] hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}
