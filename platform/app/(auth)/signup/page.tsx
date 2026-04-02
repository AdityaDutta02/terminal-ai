'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Zap } from 'lucide-react'
import Link from 'next/link'
import { SocialAuthButtons } from '@/components/social-auth-buttons'

const inputClass =
  'w-full h-[44px] px-4 rounded-xl border border-slate-200 text-[14px] text-slate-700 placeholder-slate-400 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all'
const labelClass = 'text-[13px] font-medium text-slate-700 mb-1.5 block'

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await authClient.signUp.email({ name, email, password })
    setLoading(false)
    if (error) {
      setError(error.message ?? 'Sign up failed. Please try again.')
      return
    }
    router.push(`/verify-email?email=${encodeURIComponent(email)}`)
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
      <div className="w-full max-w-[420px]">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white">
            <Zap className="h-6 w-6 text-[#0A0A0A]" strokeWidth={2.5} />
          </div>
          <h1 className="text-[28px] font-black text-white">Create your account</h1>
          <p className="mt-1 text-sm text-white/40">Get 10 free credits on signup</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          {/* OAuth buttons */}
          <div className="mb-6">
            <SocialAuthButtons />
          </div>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-[13px] text-slate-400">or</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="name" className={labelClass}>
                Full name
              </label>
              <input
                id="name"
                type="text"
                placeholder="Ada Lovelace"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                className={inputClass}
              />
            </div>

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

            <div>
              <label htmlFor="password" className={labelClass}>
                Password
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

            {error && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <label className="flex items-start gap-3 cursor-pointer" data-testid="terms-checkbox-label">
              <input
                type="checkbox"
                required
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-orange-500 accent-orange-500 shrink-0"
                data-testid="terms-checkbox"
              />
              <span className="text-[13px] text-slate-500 leading-relaxed">
                I agree to the{' '}
                <Link
                  href="/terms"
                  target="_blank"
                  className="text-slate-700 underline underline-offset-2 hover:text-orange-500 transition-colors"
                >
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link
                  href="/privacy"
                  target="_blank"
                  className="text-slate-700 underline underline-offset-2 hover:text-orange-500 transition-colors"
                >
                  Privacy Policy
                </Link>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !agreedToTerms}
              className="w-full bg-[#FF6B00] hover:bg-[#E55D00] text-[#0A0A0A] rounded-xl py-3 text-[14px] font-bold transition-colors disabled:opacity-50"
              data-testid="signup-submit"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

        </div>

        <p className="mt-6 text-center text-sm text-white/40">
          Already have an account?{' '}
          <a href="/login" className="font-medium text-[#FF6B00] hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}
