export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email } = await searchParams

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm w-full text-center">
        <div className="w-12 h-12 rounded-full border-2 border-violet-600 flex items-center justify-center mx-auto mb-6">
          <svg className="w-6 h-6 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Check your inbox</h1>
        <p className="text-gray-500 mb-1">
          We sent a verification link to
        </p>
        {email && (
          <p className="font-medium text-gray-900 mb-4">{email}</p>
        )}
        <p className="text-sm text-gray-500 mb-8">
          Verify your email to receive <strong>20 free credits</strong> and start using Terminal AI apps.
        </p>
        <p className="text-xs text-gray-400">
          Didn&apos;t receive it?{' '}
          <a href="/signup" className="text-violet-600 underline">Try signing up again</a>
        </p>
      </div>
    </div>
  )
}
