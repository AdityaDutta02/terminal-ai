'use client'
import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'

type DeploymentEvent = {
  id: string
  event_type: string
  message: string
  metadata: Record<string, unknown> | null
  created_at: string
}

type DeploymentInfo = {
  id: string
  status: string
  error_code: string | null
  error_message: string | null
  app_name: string
  started_at: string | null
  completed_at: string | null
  retry_count: number
}

const EVENT_ICONS: Record<string, string> = {
  queued: '⏳',
  preflight_start: '🔍',
  preflight_ok: '✓',
  preflight_failed: '✗',
  creating_app: '🔧',
  build_start: '🔨',
  triggering_build: '🚀',
  build_running: '⚙',
  build_ok: '✓',
  build_failed: '✗',
  health_check_start: '🏥',
  health_check_ok: '✓',
  health_check_failed: '✗',
  deployed: '🟢',
  failed: '🔴',
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-muted-foreground',
  building: 'text-amber-500',
  live: 'text-green-500',
  failed: 'text-destructive',
  suspended: 'text-muted-foreground',
}

export function DeploymentDetail({
  appId,
  deploymentId,
  initialData,
}: {
  appId: string
  deploymentId: string
  initialData: { deployment: Record<string, string | null | number>; events: Array<Record<string, string | null>> }
}) {
  const dep = initialData.deployment as unknown as DeploymentInfo
  const [events, setEvents] = useState<DeploymentEvent[]>(
    initialData.events as unknown as DeploymentEvent[]
  )
  const [status, setStatus] = useState(dep.status)
  const isTerminal = status === 'live' || status === 'failed'

  useEffect(() => {
    if (isTerminal) return

    const evtSource = new EventSource(
      `/api/creator/deployments/${deploymentId}/events`
    )

    evtSource.onmessage = (e) => {
      const event = JSON.parse(e.data as string) as DeploymentEvent
      setEvents((prev) => {
        if (prev.find((p) => p.id === event.id)) return prev
        return [...prev, event]
      })
      if (event.event_type === 'deployed') setStatus('live')
      if (event.event_type === 'failed') setStatus('failed')
    }

    evtSource.onerror = () => evtSource.close()

    return () => evtSource.close()
  }, [deploymentId, isTerminal])

  return (
    <div className="space-y-6">
      {/* Status header */}
      <div className="flex items-center justify-between rounded-2xl border border-border p-4">
        <div>
          <p className="text-sm text-muted-foreground">Deployment</p>
          <p className="font-mono text-sm">{deploymentId}</p>
        </div>
        <div className="text-right">
          <p className={`text-lg font-semibold capitalize ${STATUS_COLOR[status] ?? ''}`}>
            {status}
          </p>
          {dep.started_at && (
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(dep.started_at), { addSuffix: true })}
            </p>
          )}
        </div>
      </div>

      {/* Error card */}
      {status === 'failed' && dep.error_message && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
          <span className="text-destructive font-mono text-sm">{dep.error_code ?? 'ERROR'}</span>
          <p className="mt-1 text-sm">{dep.error_message}</p>
          <button
            className="mt-3 text-sm text-primary hover:underline"
            onClick={async () => {
              await fetch(`/api/creator/apps/${appId}/redeploy`, { method: 'POST' })
              window.location.href = `/creator/apps/${appId}/deployments`
            }}
          >
            Redeploy →
          </button>
        </div>
      )}

      {/* Event timeline */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Event Timeline
        </h2>
        {events.length === 0 ? (
          <div className="text-sm text-muted-foreground animate-pulse">Waiting for events…</div>
        ) : (
          <div className="space-y-1">
            {events.map((event) => (
              <div
                key={event.id}
                className={`flex items-start gap-3 py-2 px-3 rounded text-sm ${
                  event.event_type === 'failed' ? 'bg-destructive/10' :
                  event.event_type === 'deployed' ? 'bg-green-500/10' : ''
                }`}
              >
                <span className="mt-0.5 text-base leading-none w-5 flex-shrink-0 text-center">
                  {EVENT_ICONS[event.event_type] ?? '·'}
                </span>
                <div className="flex-1 min-w-0">
                  <span>{event.message}</span>
                </div>
                <span className="font-mono text-xs text-muted-foreground flex-shrink-0">
                  {new Date(event.created_at).toLocaleTimeString()}
                </span>
              </div>
            ))}
            {!isTerminal && (
              <div className="flex items-center gap-3 py-2 px-3 text-sm text-muted-foreground animate-pulse">
                <span className="w-5 text-center">⚙</span>
                <span>Processing…</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
