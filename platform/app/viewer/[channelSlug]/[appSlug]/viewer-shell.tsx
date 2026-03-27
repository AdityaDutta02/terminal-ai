'use client'
import { useEffect, useRef, useState } from 'react'

type Props = { appId: string; appName: string; iframeUrl: string }

export default function ViewerShell({ appId, appName, iframeUrl }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [tokenReady, setTokenReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tokenRef = useRef<string | null>(null)

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>

    async function fetchToken() {
      const res = await fetch('/api/embed-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setError(data.error ?? 'Failed to start session')
        return
      }
      const { token } = await res.json() as { token: string }
      tokenRef.current = token
      setTokenReady(true)

      // Refresh token every 10 minutes (before 15m expiry)
      interval = setInterval(fetchToken, 10 * 60 * 1000)
    }

    fetchToken()
    return () => clearInterval(interval)
  }, [appId])

  function handleIframeLoad() {
    if (tokenRef.current && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type: 'TERMINAL_AI_TOKEN', token: tokenRef.current },
        new URL(iframeUrl).origin
      )
    }
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-zinc-400">{error}</p>
          <a href="/" className="text-sm text-violet-400 hover:underline">Back to marketplace</a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <span className="text-sm font-medium">{appName}</span>
        <a href="/" className="text-xs text-zinc-500 hover:text-zinc-300">← Back</a>
      </div>
      {tokenReady ? (
        <iframe
          ref={iframeRef}
          src={iframeUrl}
          onLoad={handleIframeLoad}
          className="flex-1 w-full border-none"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
          title={appName}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-zinc-500">Starting session…</p>
        </div>
      )}
    </div>
  )
}
