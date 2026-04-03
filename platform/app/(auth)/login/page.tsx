'use client'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { SocialAuthButtons } from '@/components/social-auth-buttons'

const inputClass =
  'w-full h-[44px] px-4 rounded-xl border border-[#1e1e1f]/10 bg-white text-[14px] text-[#1e1e1f] placeholder-[#1e1e1f]/30 outline-none focus:border-[#FF6B00] focus:ring-2 focus:ring-orange-100 transition-all'
const labelClass = 'text-[13px] font-medium text-[#1e1e1f]/70 mb-1.5 block'

function LoginForm() {
  const router = useRouter()
  const next = useSearchParams().get('next') ?? '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { data, error } = await authClient.signIn.email({ email, password })
    setLoading(false)
    if (error) {
      if (error.code === 'EMAIL_NOT_VERIFIED') {
        router.push(`/verify-email?email=${encodeURIComponent(email)}`)
        return
      }
      if (error.message?.includes('credentials') || error.code === 'INVALID_EMAIL_OR_PASSWORD') {
        setError('Invalid email or password. If you signed up with Google, use the Google button above.')
      } else {
        setError(error.message ?? 'Sign in failed. Please try again.')
      }
      return
    }
    if (!data?.token) {
      router.push(`/verify-email?email=${encodeURIComponent(email)}`)
      return
    }
    router.push(next)
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center px-4">
      <div className="w-full max-w-[400px]">
        {/* Header */}
        <div className="mb-10 text-center">
          <a href="/" className="text-[22px] font-display text-[#1e1e1f] tracking-tight">
            Terminal AI
          </a>
          <h1 className="mt-6 text-[clamp(28px,4vw,36px)] font-display text-[#1e1e1f] tracking-[-0.02em]">
            Welcome back
          </h1>
          <p className="mt-2 text-[14px] text-[#1e1e1f]/40">Sign in to your account</p>
        </div>

        {/* Form area */}
        <div className="bg-white rounded-[24px] p-8 border border-[#1e1e1f]/[0.06]">
          <div className="mb-6">
            <SocialAuthButtons />
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#1e1e1f]/8" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-[12px] text-[#1e1e1f]/30 font-medium">or</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className={labelClass}>Email</label>
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
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="text-[13px] font-medium text-[#1e1e1f]/70">
                  Password
                </label>
                <a href="/forgot-password" className="text-[12px] font-medium text-[#FF6B00] hover:text-[#E55D00] transition-colors">
                  Forgot password?
                </a>
              </div>
              <input
                id="password"
                type="password"
                placeholder="••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className={inputClass}
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-200/50 bg-red-50 px-4 py-3 text-[13px] text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1e1e1f] hover:bg-[#333] text-white rounded-full py-3 text-[14px] font-medium transition-all duration-200 hover:shadow-lg hover:shadow-black/15 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="mt-8 text-center text-[13px] text-[#1e1e1f]/35">
          No account?{' '}
          <a href="/signup" className="font-medium text-[#FF6B00] hover:text-[#E55D00] transition-colors">
            Sign up free
          </a>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
