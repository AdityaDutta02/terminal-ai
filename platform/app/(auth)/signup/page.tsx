'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import Link from 'next/link'
import { SocialAuthButtons } from '@/components/social-auth-buttons'

const inputClass =
  'w-full h-[44px] px-4 rounded-xl border border-[#1e1e1f]/10 bg-white text-[14px] text-[#1e1e1f] placeholder-[#1e1e1f]/30 outline-none focus:border-[#FF6B00] focus:ring-2 focus:ring-orange-100 transition-all'
const labelClass = 'text-[13px] font-medium text-[#1e1e1f]/70 mb-1.5 block'

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
      if (error.code === 'USER_ALREADY_EXISTS' || error.message?.includes('already')) {
        setError('An account with this email already exists. Try signing in instead, or use the Google button if you signed up with Google.')
      } else {
        setError(error.message ?? 'Sign up failed. Please try again.')
      }
      return
    }
    router.push(`/verify-email?email=${encodeURIComponent(email)}`)
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[400px]">
        {/* Header */}
        <div className="mb-10 text-center">
          <a href="/" className="text-[22px] font-display text-[#1e1e1f] tracking-tight">
            Terminal AI
          </a>
          <h1 className="mt-6 text-[clamp(28px,4vw,36px)] font-display text-[#1e1e1f] tracking-[-0.02em]">
            Create your account
          </h1>
          <p className="mt-2 text-[14px] text-[#1e1e1f]/40">Get 10 free credits on signup</p>
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
              <label htmlFor="name" className={labelClass}>Full name</label>
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
              <label htmlFor="password" className={labelClass}>Password</label>
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
              <div className="rounded-xl border border-red-200/50 bg-red-50 px-4 py-3 text-[13px] text-red-600">
                {error}
              </div>
            )}

            <label className="flex items-start gap-3 cursor-pointer" data-testid="terms-checkbox-label">
              <input
                type="checkbox"
                required
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[#1e1e1f]/20 text-[#FF6B00] accent-[#FF6B00] shrink-0"
                data-testid="terms-checkbox"
              />
              <span className="text-[12px] text-[#1e1e1f]/45 leading-relaxed">
                I agree to the{' '}
                <Link href="/terms" target="_blank" className="text-[#1e1e1f]/70 underline underline-offset-2 hover:text-[#FF6B00] transition-colors">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/privacy" target="_blank" className="text-[#1e1e1f]/70 underline underline-offset-2 hover:text-[#FF6B00] transition-colors">
                  Privacy Policy
                </Link>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !agreedToTerms}
              className="w-full bg-[#FF6B00] hover:bg-[#E55D00] text-white rounded-full py-3 text-[14px] font-medium transition-all duration-200 hover:shadow-lg hover:shadow-orange-200/50 active:scale-[0.98] disabled:opacity-50"
              data-testid="signup-submit"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="mt-8 text-center text-[13px] text-[#1e1e1f]/35">
          Already have an account?{' '}
          <a href="/login" className="font-medium text-[#FF6B00] hover:text-[#E55D00] transition-colors">
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}
