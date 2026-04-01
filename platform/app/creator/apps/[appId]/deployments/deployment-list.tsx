'use client'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'

type Deployment = {
  id: string
  status: string
  error_code: string | null
  started_at: string | null
  completed_at: string | null
  retry_count: number
  created_at: string
}

function statusDotClass(status: string): string {
  switch (status) {
    case 'building': return 'bg-amber-400 animate-pulse'
    case 'live': return 'bg-green-500'
    case 'failed': return 'bg-red-500'
    default: return 'bg-gray-400'
  }
}

function durationStr(start: string | null, end: string | null): string {
  if (!start) return '—'
  const startMs = new Date(start).getTime()
  const endMs = end ? new Date(end).getTime() : Date.now()
  const secs = Math.round((endMs - startMs) / 1000)
  return secs < 60 ? `${secs}s` : `${Math.round(secs / 60)}m ${secs % 60}s`
}

export function DeploymentList({
  appId,
  initialDeployments,
}: {
  appId: string
  initialDeployments: Array<Record<string, string | null>>
}) {
  const deployments = initialDeployments as unknown as Deployment[]

  if (deployments.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-12 text-center text-muted-foreground">
        No deployments yet.
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Started</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Duration</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Retries</th>
            <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {deployments.map((dep, i) => (
            <tr key={dep.id} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${statusDotClass(dep.status)}`} />
                  <span className="capitalize">{dep.status}</span>
                  {dep.error_code && (
                    <span className="text-xs text-destructive font-mono">{dep.error_code}</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {dep.started_at
                  ? formatDistanceToNow(new Date(dep.started_at), { addSuffix: true })
                  : '—'}
              </td>
              <td className="px-4 py-3 font-mono text-xs">
                {durationStr(dep.started_at, dep.completed_at)}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{dep.retry_count}</td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/creator/apps/${appId}/deployments/${dep.id}`}
                  className="text-primary hover:underline"
                >
                  View logs
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
