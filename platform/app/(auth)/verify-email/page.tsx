import { Zap } from 'lucide-react'

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email } = await searchParams

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
      <div className="w-full max-w-[420px]">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white">
            <Zap className="h-6 w-6 text-[#0A0A0A]" strokeWidth={2.5} />
          </div>
          <h1 className="text-[28px] font-black text-white">Check your inbox</h1>
          <p className="mt-1 text-sm text-white/40">We sent a verification link</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white p-8 shadow-2xl text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-orange-50">
            <svg
              className="w-6 h-6 text-[#FF6B00]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>

          {email && (
            <p className="text-[14px] text-slate-700 mb-1">
              We sent a verification link to
            </p>
          )}
          {email && (
            <p className="text-[14px] font-bold text-slate-900 mb-4">{email}</p>
          )}

          <p className="text-[13px] text-slate-500 mb-6">
            Verify your email to receive <strong className="text-slate-700">20 free credits</strong>{' '}
            and start using Terminal AI apps.
          </p>

          <p className="text-[12px] text-slate-400">
            Didn&apos;t receive it?{' '}
            <a href="/signup" className="text-[#FF6B00] hover:underline font-medium">
              Try signing up again
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
