'use client'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { SocialAuthButtons } from '@/components/social-auth-buttons'
import { safeRedirectPath } from '@/lib/utils'

const inputClass =
  'w-full h-[44px] px-4 rounded-xl border border-[#1e1e1f]/10 bg-white text-[14px] text-[#1e1e1f] placeholder-[#1e1e1f]/30 outline-none focus:border-[#FF6B00] focus:ring-2 focus:ring-[#FF6B00]/30 transition-all'

function LoginForm() {
  const router = useRouter()
  const next = safeRedirectPath(useSearchParams().get('next'))
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
        setError('Invalid email or password. If you signed up with Google, use the Google button.')
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
    <div className="min-h-screen bg-[#f5f5f0] flex">
      {/* Left — brand panel */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(145deg, #f8a4c8 0%, #f4845f 20%, #f7b267 40%, #f8a4c8 60%, #c9a7eb 80%, #f0e0d0 100%)' }}
        />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <a href="/" className="text-[22px] font-display text-[#1e1e1f] tracking-tight">
            Terminal AI
          </a>
          <div>
            <h2 className="font-display text-[clamp(32px,4vw,48px)] text-[#1e1e1f] tracking-[-0.02em] leading-[1.1] mb-4">
              Where AI apps
              <br />come alive
            </h2>
            <p className="text-[15px] text-[#1e1e1f]/50 max-w-[300px] leading-relaxed">
              Discover and run AI-powered apps - instant access, zero setup.
            </p>
          </div>
          <p className="text-[12px] text-[#1e1e1f]/30">
            &copy; {new Date().getFullYear()} Studio Ionique
          </p>
        </div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px]">
          {/* Mobile-only wordmark */}
          <a href="/" className="lg:hidden block text-center text-[22px] font-display text-[#1e1e1f] tracking-tight mb-8">
            Terminal AI
          </a>

          <h1 className="text-[28px] font-display text-[#1e1e1f] tracking-[-0.02em] mb-1">
            Welcome back
          </h1>
          <p className="text-[14px] text-[#1e1e1f]/40 mb-8">Sign in to your account</p>

          <div className="mb-6">
            <SocialAuthButtons />
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#1e1e1f]/8" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-[#f5f5f0] px-3 text-[12px] text-[#1e1e1f]/30 font-medium">or</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="text-[13px] font-medium text-[#1e1e1f]/70 mb-1.5 block">Email</label>
              <input
                id="email" type="email" placeholder="you@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)}
                required autoComplete="email" className={inputClass}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="text-[13px] font-medium text-[#1e1e1f]/70">Password</label>
                <a href="/forgot-password" className="text-[12px] font-medium text-[#FF6B00] hover:text-[#E55D00] transition-colors">
                  Forgot?
                </a>
              </div>
              <input
                id="password" type="password" placeholder="••••••••••"
                value={password} onChange={(e) => setPassword(e.target.value)}
                required autoComplete="current-password" className={inputClass}
              />
            </div>

            {error && (
              <div role="alert" className="rounded-xl border border-red-200/50 bg-red-50 px-4 py-3 text-[13px] text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full bg-[#1e1e1f] hover:bg-[#333] text-white rounded-full py-3 text-[14px] font-medium transition-all duration-200 hover:shadow-lg hover:shadow-black/15 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="mt-8 text-[13px] text-[#1e1e1f]/35">
            No account?{' '}
            <a href="/signup" className="font-medium text-[#FF6B00] hover:text-[#E55D00] transition-colors">
              Sign up free
            </a>
          </p>
        </div>
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
