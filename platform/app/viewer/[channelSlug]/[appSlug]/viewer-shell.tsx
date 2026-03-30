'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { X, RefreshCw, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreditsPill } from '@/components/ui/credits-pill'

interface Props {
  appId: string
  appName: string
  channelSlug: string
  iframeUrl: string
  initialCredits: number
  userName: string
  deploymentStatus: string | null
  deploymentError: string | null
}

type ViewState = 'deploying' | 'deploy_failed' | 'loading' | 'ready' | 'error'

function getInitialViewState(iframeUrl: string, deploymentStatus: string | null): ViewState {
  if (iframeUrl) return 'loading'
  if (deploymentStatus === 'failed') return 'deploy_failed'
  return 'deploying'
}

export function ViewerShell(props: Props) {
  const { appId, appName, channelSlug, iframeUrl: initialIframeUrl, initialCredits, userName, deploymentStatus, deploymentError } = props
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const tokenRef = useRef<string | null>(null)
  const [iframeUrl, setIframeUrl] = useState(initialIframeUrl)
  const [viewState, setViewState] = useState<ViewState>(() => getInitialViewState(initialIframeUrl, deploymentStatus))
  const [errorMsg, setErrorMsg] = useState(deploymentError ?? '')
  const [credits, setCredits] = useState(initialCredits)

  const fetchToken = useCallback(async () => {
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
    return token
  }, [appId])

  function deliverToken(token: string, url: string) {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow || !url) return
    try {
      iframe.contentWindow.postMessage(
        { type: 'TERMINAL_AI_TOKEN', token },
        new URL(url).origin,
      )
    } catch {
      // ignore invalid URL
    }
  }

  // Fetch token once the app URL is available
  useEffect(() => {
    if (viewState !== 'loading' || !iframeUrl) return
    let cancelled = false

    const init = async () => {
      try {
        const token = await fetchToken()
        if (cancelled) return
        tokenRef.current = token
        setViewState('ready')
        deliverToken(token, iframeUrl)
      } catch (err) {
        if (cancelled) return
        setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
        setViewState('error')
      }
    }

    void init()
    return () => { cancelled = true }
  }, [viewState, iframeUrl, fetchToken])

  // Poll for deployment completion
  useEffect(() => {
    if (viewState !== 'deploying') return

    const poll = async () => {
      try {
        const res = await fetch(`/api/app-status?appId=${appId}`)
        if (!res.ok) return
        const data = await res.json() as { iframe_url: string; deployment_status: string | null; deployment_error: string | null }
        if (data.iframe_url) {
          setIframeUrl(data.iframe_url)
          setViewState('loading')
        } else if (data.deployment_status === 'failed') {
          setErrorMsg(data.deployment_error ?? 'Deployment failed')
          setViewState('deploy_failed')
        }
      } catch {
        // ignore, retry next interval
      }
    }

    const interval = setInterval(() => void poll(), 10_000)
    return () => clearInterval(interval)
  }, [viewState, appId])

  // Refresh token every 12 minutes while the app is open
  useEffect(() => {
    if (viewState !== 'ready' || !iframeUrl) return

    const interval = setInterval(async () => {
      try {
        const token = await fetchToken()
        deliverToken(token, iframeUrl)
      } catch {
        // silently fail — next interval will retry
      }
    }, 12 * 60 * 1000)

    return () => clearInterval(interval)
  }, [viewState, iframeUrl, fetchToken])

  // Re-deliver token when iframe reloads
  function handleIframeLoad() {
    if (tokenRef.current && iframeUrl) {
      deliverToken(tokenRef.current, iframeUrl)
    }
  }

  // Listen for credit updates from the embedded app
  useEffect(() => {
    if (!iframeUrl) return
    function handleMessage(event: MessageEvent) {
      try {
        if (event.origin !== new URL(iframeUrl).origin) return
      } catch {
        return
      }
      if (event.data?.type === 'TERMINAL_AI_CREDITS_UPDATE' && typeof event.data.balance === 'number') {
        setCredits(event.data.balance)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [iframeUrl])

  const initials = userName.charAt(0).toUpperCase()

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
        <div className="flex items-center gap-3">
          <a href={`/c/${channelSlug}`} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            <X className="h-4 w-4" />
          </a>
          <span className="text-sm font-medium text-gray-900">{appName}</span>
        </div>
        <div className="flex items-center gap-3">
          {viewState === 'deploying' && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Deploying…
            </div>
          )}
          {viewState === 'loading' && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Connecting…
            </div>
          )}
          {viewState === 'error' && (
            <Button variant="outline" size="sm" onClick={() => setViewState('loading')}>
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          )}
          <CreditsPill credits={credits} />
          <a
            href="/account"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white hover:bg-violet-700 transition-colors"
            title={userName}
          >
            {initials}
          </a>
        </div>
      </div>

      <div className="relative flex-1">
        {viewState === 'deploying' && (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-sm text-center">
              <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-violet-500" />
              <p className="font-medium text-gray-900">Your app is deploying</p>
              <p className="mt-1 text-sm text-gray-500">This usually takes 2–5 minutes. This page will update automatically.</p>
            </div>
          </div>
        )}

        {viewState === 'deploy_failed' && (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-sm text-center">
              <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
              <p className="font-medium text-gray-900">Deployment failed</p>
              <p className="mt-1 text-sm text-gray-500">{errorMsg || 'The app failed to deploy. Check the deployment logs for details.'}</p>
            </div>
          </div>
        )}

        {viewState === 'error' && (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-sm text-center">
              <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
              <p className="font-medium text-gray-900">Unable to load app</p>
              <p className="mt-1 text-sm text-gray-500">{errorMsg}</p>
              <Button className="mt-4" onClick={() => setViewState('loading')}>Try again</Button>
            </div>
          </div>
        )}

        {(viewState === 'loading' || viewState === 'ready') && iframeUrl && (
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
