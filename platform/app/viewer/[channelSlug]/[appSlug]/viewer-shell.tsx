'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Coins, RefreshCw, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  appId: string
  appName: string
  channelSlug: string
  iframeUrl: string
}

type Status = 'loading' | 'ready' | 'error'

export function ViewerShell({ appId, appName, channelSlug, iframeUrl }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const tokenRef = useRef<string | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  const fetchAndDeliverToken = useCallback(async () => {
    try {
      const res = await fetch('/api/embed-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Failed to get token')
      }
      const { token } = await res.json() as { token: string }
      tokenRef.current = token
      return token
    } catch (err) {
      throw err
    }
  }, [appId])

  function deliverToken(token: string) {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return
    iframe.contentWindow.postMessage(
      { type: 'TERMINAL_AI_TOKEN', token },
      new URL(iframeUrl).origin,
    )
  }

  async function init() {
    setStatus('loading')
    setErrorMsg('')
    try {
      const token = await fetchAndDeliverToken()
      tokenRef.current = token
      setStatus('ready')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
      setStatus('error')
    }
  }

  useEffect(() => {
    void init()
    // Refresh token every 12 minutes (before 15m expiry)
    const interval = setInterval(
      async () => {
        try {
          const token = await fetchAndDeliverToken()
          deliverToken(token)
        } catch {
          // Silently fail — next interval will retry
        }
      },
      12 * 60 * 1000,
    )
    return () => clearInterval(interval)
  }, [appId]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleIframeLoad() {
    if (tokenRef.current) {
      deliverToken(tokenRef.current)
    }
  }

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Top bar */}
      <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
        <div className="flex items-center gap-3">
          <a
            href={`/c/${channelSlug}`}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </a>
          <span className="text-sm font-medium text-gray-900">{appName}</span>
        </div>
        <div className="flex items-center gap-2">
          {status === 'loading' && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Connecting…
            </div>
          )}
          {status === 'error' && (
            <Button variant="outline" size="sm" onClick={init}>
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="relative flex-1">
        {status === 'error' ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-sm text-center">
              <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
              <p className="font-medium text-gray-900">Unable to load app</p>
              <p className="mt-1 text-sm text-gray-500">{errorMsg}</p>
              <Button className="mt-4" onClick={init}>Try again</Button>
            </div>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={iframeUrl}
            onLoad={handleIframeLoad}
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
            title={appName}
          />
        )}
      </div>
    </div>
  )
}
