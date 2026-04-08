'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { X, RefreshCw, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreditsPill } from '@/components/ui/credits-pill'
import { useToast } from '@/hooks/use-toast'
import { ToastAction } from '@/components/ui/toast'

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

type ViewState = 'deploying' | 'deploy_failed' | 'loading' | 'ready' | 'error' | 'session_ended'


function getInitialViewState(iframeUrl: string, deploymentStatus: string | null): ViewState {
  if (iframeUrl) return 'loading'
  if (deploymentStatus === 'failed') return 'deploy_failed'
  return 'deploying'
}

function ViewerSkeleton() {
  return (
    <div className="flex h-screen w-full flex-col bg-zinc-950 animate-pulse">
      <div className="h-12 border-b border-zinc-800 bg-zinc-900" />
      <div className="flex-1 p-6 space-y-4">
        <div className="h-4 w-3/4 rounded bg-zinc-800" />
        <div className="h-4 w-1/2 rounded bg-zinc-800" />
        <div className="h-32 rounded bg-zinc-800" />
      </div>
    </div>
  )
}

function ChannelLink({ channelSlug }: { channelSlug: string }) {
  return (
    <a
      href={`/c/${channelSlug}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
    >
      Back to channel
    </a>
  )
}

function DeployingState() {
  const steps = [
    'Queuing deployment…',
    'Cloning repository…',
    'Building your app…',
    'Starting container…',
    'Almost ready…',
  ]
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, steps.length - 1))
    }, 25_000)
    return () => clearInterval(interval)
  }, [steps.length])

  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-xs text-center">
        <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-violet-500" />
        <p className="font-medium text-gray-900">Deploying your app</p>
        <p className="mt-1 text-sm text-gray-500">{steps[stepIndex]}</p>
        <div className="mt-4 h-1 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-violet-500 transition-all duration-[25000ms] ease-linear"
            style={{ width: `${Math.round(((stepIndex + 1) / steps.length) * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-gray-400">Usually 2–5 minutes</p>
      </div>
    </div>
  )
}

export function ViewerShell(props: Props) {
  const { appId, appName, channelSlug, iframeUrl: initialIframeUrl, initialCredits, userName, deploymentStatus, deploymentError } = props
  const { toast } = useToast()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const tokenRef = useRef<string | null>(null)
  const [iframeUrl, setIframeUrl] = useState(initialIframeUrl)
  const [viewState, setViewState] = useState<ViewState>(() => getInitialViewState(initialIframeUrl, deploymentStatus))
  const [errorMsg, setErrorMsg] = useState(deploymentError ?? '')
  const [credits, setCredits] = useState(initialCredits)
  const [tokenIssuedAt, setTokenIssuedAt] = useState<number | null>(null)

  const fetchToken = useCallback(async () => {
    const res = await fetch('/api/embed-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId }),
    })
    if (!res.ok) {
      const data = await res.json() as { error?: string; redirect?: string }
      if (data.redirect) {
        window.location.href = data.redirect
        return '' // unreachable but satisfies type
      }
      throw new Error(data.error ?? 'Failed to get token')
    }
    const { token } = await res.json() as { token: string }
    return token
  }, [appId])

  function deliverToken(token: string) {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return
    // Sandboxed iframes have a null effective origin; must use '*' or message is silently dropped
    iframe.contentWindow.postMessage({ type: 'TERMINAL_AI_TOKEN', token }, '*')
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
        setTokenIssuedAt(Date.now())
        setViewState('ready')
        deliverToken(token)
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
        deliverToken(token)
      } catch {
        // silently fail — next interval will retry
      }
    }, 12 * 60 * 1000)

    return () => clearInterval(interval)
  }, [viewState, iframeUrl, fetchToken])

  // Show expiry warning toast at 13 min, end session at 15 min if not extended
  useEffect(() => {
    if (!tokenIssuedAt || viewState !== 'ready') return
    const elapsed = Date.now() - tokenIssuedAt
    const warningDelay = 13 * 60 * 1000 - elapsed
    const expiryDelay = 15 * 60 * 1000 - elapsed

    const timers: ReturnType<typeof setTimeout>[] = []

    if (warningDelay > 0) {
      timers.push(setTimeout(() => {
        toast({
          title: 'Session expiring soon',
          description: 'Your session will expire in 2 minutes.',
          duration: 120000,
          action: (
            <ToastAction
              altText="Extend session"
              onClick={() => {
                void (async () => {
                  try {
                    const token = await fetchToken()
                    tokenRef.current = token
                    setTokenIssuedAt(Date.now())
                    deliverToken(token)
                  } catch {
                    // silently fail — the auto-refresh interval will retry
                  }
                })()
              }}
            >
              Extend
            </ToastAction>
          ),
        })
      }, warningDelay))
    }

    if (expiryDelay > 0) {
      timers.push(setTimeout(() => {
        setViewState('session_ended')
      }, expiryDelay))
    }

    return () => timers.forEach(clearTimeout)
  }, [tokenIssuedAt, viewState, toast, fetchToken, iframeUrl])

  // Re-deliver token when iframe reloads
  function handleIframeLoad() {
    if (tokenRef.current) {
      deliverToken(tokenRef.current)
    }
  }

  // Listen for messages from the embedded app (credit updates + ready signal)
  useEffect(() => {
    if (!iframeUrl) return
    function handleMessage(event: MessageEvent) {
      // Sandboxed iframe sends from null origin; accept null or the app's URL origin
      const expectedOrigin = (() => { try { return new URL(iframeUrl).origin } catch { return null } })()
      if (event.origin !== expectedOrigin && event.origin !== 'null') return
      const data = event.data
      if (!data || typeof data !== 'object') return

      // App signals it's ready to receive the token — re-deliver immediately
      if (data.type === 'TERMINAL_AI_READY' && tokenRef.current) {
        deliverToken(tokenRef.current)
        return
      }

      // Credit balance update from the app
      if (data.type === 'TERMINAL_AI_CREDITS_UPDATE' && typeof data.balance === 'number') {
        setCredits(data.balance)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [iframeUrl])

  const initials = userName.charAt(0).toUpperCase()

  return (
    <div className="dark flex h-screen flex-col bg-zinc-950">
      <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#0A0A0A] px-4">
        <div className="flex items-center gap-3">
          {/* Terminal AI logo mark */}
          <a href="/" className="flex items-center justify-center w-6 h-6 rounded-full bg-[#FF6B00] flex-shrink-0" aria-label="Terminal AI home">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
              <path d="M8 1l2.1 4.3L15 6l-3.5 3.4.8 4.6L8 11.8 3.7 14l.8-4.6L1 6l4.9-.7L8 1z" fill="white" />
            </svg>
          </a>
          <span className="text-white/20 text-sm">/</span>
          <a href={`/c/${channelSlug}`} className="text-sm text-white/40 hover:text-white/70 transition-colors truncate max-w-[120px]">
            {channelSlug}
          </a>
          <span className="text-white/20 text-sm">/</span>
          <span className="text-sm font-medium text-white truncate max-w-[180px]">{appName}</span>
        </div>
        <div className="flex items-center gap-3">
          {viewState === 'deploying' && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Deploying…
            </div>
          )}
          {viewState === 'loading' && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
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
          <CreditsPill credits={credits} variant="dark" />
          <a
            href="/account"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FF6B00] text-xs font-bold text-white hover:bg-[#E55D00] transition-colors"
            title={userName}
          >
            {initials}
          </a>
          <a
            href={`/c/${channelSlug}`}
            className="flex items-center justify-center w-7 h-7 rounded-full bg-white/[0.08] hover:bg-white/[0.14] transition-colors"
            aria-label="Close viewer"
          >
            <X className="h-3.5 w-3.5 text-white/60" />
          </a>
        </div>
      </div>

      <div className="relative flex-1">
        {viewState === 'deploying' && <DeployingState />}

        {viewState === 'deploy_failed' && (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-sm text-center">
              <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
              <p className="font-medium text-zinc-100">Deployment failed</p>
              <p className="mt-1 text-sm text-zinc-400">{errorMsg || 'The app failed to deploy. The creator has been notified.'}</p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <Button variant="outline" size="sm" onClick={() => { setErrorMsg(''); setViewState('deploying') }}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Retry
                </Button>
                <ChannelLink channelSlug={channelSlug} />
              </div>
            </div>
          </div>
        )}

        {viewState === 'error' && (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-sm text-center">
              <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
              <p className="font-medium text-zinc-100">Unable to load app</p>
              <p className="mt-1 text-sm text-zinc-400">{errorMsg}</p>
              <Button className="mt-4" onClick={() => setViewState('loading')}>Try again</Button>
            </div>
          </div>
        )}

        {viewState === 'loading' && <ViewerSkeleton />}

        {viewState === 'session_ended' && (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-sm text-center">
              <AlertCircle className="mx-auto mb-3 h-8 w-8 text-zinc-400" />
              <p className="font-medium text-zinc-100">Session ended</p>
              <p className="mt-1 text-sm text-zinc-400">Your session has expired. Any unsaved work in the app may have been lost.</p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <Button size="sm" onClick={() => setViewState('loading')}>
                  Start new session
                </Button>
                <ChannelLink channelSlug={channelSlug} />
              </div>
            </div>
          </div>
        )}

        {(viewState === 'loading' || viewState === 'ready') && iframeUrl && (
          <iframe
            ref={iframeRef}
            src={iframeUrl}
            onLoad={handleIframeLoad}
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups-to-escape-sandbox"
            title={appName}
          />
        )}
      </div>
    </div>
  )
}
