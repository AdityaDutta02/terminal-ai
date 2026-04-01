'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
          <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
          <button
            onClick={reset}
            className="mt-4 px-4 py-2 text-sm bg-primary text-white rounded-lg"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
