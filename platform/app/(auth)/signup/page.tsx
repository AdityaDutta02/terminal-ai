'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import Link from 'next/link'
import { SocialAuthButtons } from '@/components/social-auth-buttons'

const inputClass =
  'w-full h-[44px] px-4 rounded-xl border border-[#1e1e1f]/10 bg-white text-[14px] text-[#1e1e1f] placeholder-[#1e1e1f]/30 outline-none focus:border-[#FF6B00] focus:ring-2 focus:ring-orange-100 transition-all'

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
        setError('An account with this email already exists. Try signing in, or use Google if you signed up that way.')
      } else {
        setError(error.message ?? 'Sign up failed. Please try again.')
      }
      return
    }
    router.push(`/verify-email?email=${encodeURIComponent(email)}`)
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0] flex">
      {/* Left — brand panel */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(145deg, #c9a7eb 0%, #f8a4c8 25%, #f4845f 50%, #f7b267 75%, #f0e0d0 100%)' }}
        />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <a href="/" className="text-[22px] font-display text-[#1e1e1f] tracking-tight">
            Terminal AI
          </a>
          <div>
            <h2 className="font-display text-[clamp(32px,4vw,48px)] text-[#1e1e1f] tracking-[-0.02em] leading-[1.1] mb-4">
              Build with
              <br />intelligence
            </h2>
            <p className="text-[15px] text-[#1e1e1f]/50 max-w-[300px] leading-relaxed">
              Get 10 free credits on signup. Run AI-powered apps instantly.
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
          <a href="/" className="lg:hidden block text-center text-[22px] font-display text-[#1e1e1f] tracking-tight mb-8">
            Terminal AI
          </a>

          <h1 className="text-[28px] font-display text-[#1e1e1f] tracking-[-0.02em] mb-1">
            Create your account
          </h1>
          <p className="text-[14px] text-[#1e1e1f]/40 mb-8">Get 10 free credits on signup</p>

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
              <label htmlFor="name" className="text-[13px] font-medium text-[#1e1e1f]/70 mb-1.5 block">Full name</label>
              <input
                id="name" type="text" placeholder="Ada Lovelace"
                value={name} onChange={(e) => setName(e.target.value)}
                required autoComplete="name" className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="email" className="text-[13px] font-medium text-[#1e1e1f]/70 mb-1.5 block">Email</label>
              <input
                id="email" type="email" placeholder="you@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)}
                required autoComplete="email" className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="password" className="text-[13px] font-medium text-[#1e1e1f]/70 mb-1.5 block">Password</label>
              <input
                id="password" type="password" placeholder="Min 8 characters"
                value={password} onChange={(e) => setPassword(e.target.value)}
                required minLength={8} autoComplete="new-password" className={inputClass}
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-200/50 bg-red-50 px-4 py-3 text-[13px] text-red-600">
                {error}
              </div>
            )}

            <label className="flex items-start gap-3 cursor-pointer" data-testid="terms-checkbox-label">
              <input
                type="checkbox" required checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[#1e1e1f]/20 text-[#FF6B00] accent-[#FF6B00] shrink-0"
                data-testid="terms-checkbox"
              />
              <span className="text-[12px] text-[#1e1e1f]/45 leading-relaxed">
                I agree to the{' '}
                <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-[#1e1e1f]/70 underline underline-offset-2 hover:text-[#FF6B00] transition-colors">Terms</Link>
                {' '}and{' '}
                <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[#1e1e1f]/70 underline underline-offset-2 hover:text-[#FF6B00] transition-colors">Privacy Policy</Link>
              </span>
            </label>

            <button
              type="submit" disabled={loading || !agreedToTerms}
              className="w-full bg-[#FF6B00] hover:bg-[#E55D00] text-white rounded-full py-3 text-[14px] font-medium transition-all duration-200 hover:shadow-lg hover:shadow-orange-200/50 active:scale-[0.98] disabled:opacity-50"
              data-testid="signup-submit"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="mt-8 text-[13px] text-[#1e1e1f]/35">
            Already have an account?{' '}
            <a href="/login" className="font-medium text-[#FF6B00] hover:text-[#E55D00] transition-colors">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  )
}
