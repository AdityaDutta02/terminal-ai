type ServiceStatus = 'operational' | 'degraded' | 'outage'

function getStatusColor(status: ServiceStatus): string {
  if (status === 'operational') return 'bg-green-500'
  if (status === 'degraded') return 'bg-amber-500'
  return 'bg-red-500'
}

function getStatusLabel(status: ServiceStatus): string {
  if (status === 'operational') return 'Operational'
  if (status === 'degraded') return 'Degraded'
  return 'Outage'
}

async function getStatus() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/status`, {
      cache: 'no-store',
    })
    return res.json() as Promise<{
      status: ServiceStatus
      services: Record<string, { status: ServiceStatus; latencyMs: number }>
      checked_at: string
    }>
  } catch {
    return null
  }
}

function ServiceRow({ name, status, latencyMs }: { name: string; status: ServiceStatus; latencyMs: number }) {
  const textColor = status === 'operational' ? 'text-green-600' : 'text-amber-600'
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${getStatusColor(status)}`} />
        <span className="text-sm capitalize">{name.replace('_', ' ')}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-muted-foreground font-mono">{latencyMs}ms</span>
        <span className={`text-xs font-medium ${textColor}`}>{getStatusLabel(status)}</span>
      </div>
    </div>
  )
}

export const revalidate = 30

export default async function StatusPage() {
  const data = await getStatus()

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="font-display text-4xl font-bold text-foreground">System Status</h1>
        {data && (
          <p className="mt-2 text-muted-foreground text-sm">
            Last updated {new Date(data.checked_at).toLocaleTimeString()}
          </p>
        )}
      </div>

      {!data ? (
        <div className="text-muted-foreground">Unable to fetch status. Try refreshing.</div>
      ) : (
        <>
          <div className={`rounded-xl border p-4 mb-8 ${
            data.status === 'operational'
              ? 'border-green-200 bg-green-50'
              : 'border-amber-200 bg-amber-50'
          }`}>
            <div className="flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${getStatusColor(data.status)}`} />
              <span className="font-medium">
                {data.status === 'operational'
                  ? 'All systems operational'
                  : 'Some systems degraded'}
              </span>
            </div>
          </div>

          <div className="border border-border rounded-xl overflow-hidden bg-white">
            {Object.entries(data.services).map(([name, service]) => (
              <ServiceRow
                key={name}
                name={name}
                status={service.status}
                latencyMs={service.latencyMs}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
