'use client'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Zap, CheckCircle2 } from 'lucide-react'

const inputClass =
  'w-full h-[44px] px-4 rounded-xl border border-slate-200 text-[14px] text-slate-700 placeholder-slate-400 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all'
const labelClass = 'text-[13px] font-medium text-slate-700 mb-1.5 block'

function ResetPasswordForm() {
  const router = useRouter()
  const token = useSearchParams().get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    if (!token) {
      setError('Invalid or expired reset link. Please request a new one.')
      return
    }

    setLoading(true)
    const { error } = await authClient.resetPassword({ newPassword: password, token })
    setLoading(false)
    if (error) {
      setError(error.message ?? 'Failed to reset password.')
      return
    }
    setSuccess(true)
    setTimeout(() => router.push('/login'), 2000)
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
        <div className="w-full max-w-[420px] text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          </div>
          <h1 className="text-[28px] font-black text-white">Password reset</h1>
          <p className="mt-2 text-sm text-white/40">Redirecting you to sign in...</p>
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
          <h1 className="text-[28px] font-black text-white">Set new password</h1>
          <p className="mt-1 text-sm text-white/40">Choose a strong password for your account</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="password" className={labelClass}>
                New password
              </label>
              <input
                id="password"
                type="password"
                placeholder="Min 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="confirm" className={labelClass}>
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                placeholder="Repeat your password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
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
              {loading ? 'Resetting...' : 'Reset password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
