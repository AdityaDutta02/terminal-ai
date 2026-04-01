'use client'
import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Zap, Mail } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await authClient.forgetPassword({ email, redirectTo: '/reset-password' })
    setLoading(false)
    if (error) {
      setError(error.message ?? 'Failed to send reset email.')
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100">
            <Mail className="h-6 w-6 text-violet-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Check your email</h1>
          <p className="mt-2 text-sm text-gray-500">
            We sent a password reset link to <strong className="text-gray-700">{email}</strong>.
          </p>
          <a href="/login" className="mt-6 inline-block text-sm font-medium text-violet-600 hover:underline">
            Back to sign in
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600 shadow-sm">
            <Zap className="h-6 w-6 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Reset your password</h1>
          <p className="mt-1 text-sm text-gray-500">Enter your email and we'll send a reset link</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          Remember your password?{' '}
          <a href="/login" className="font-medium text-violet-600 hover:underline">
            Sign in →
          </a>
        </p>
      </div>
    </div>
  )
}
