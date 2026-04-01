import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://gateway:4000'
const DEPLOY_MANAGER_URL = process.env.DEPLOY_MANAGER_URL ?? 'http://deploy-manager:3002'

type ServiceStatus = 'operational' | 'degraded' | 'outage'

async function checkService(url: string): Promise<{ status: ServiceStatus; latencyMs: number }> {
  const start = Date.now()
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3_000) })
    const latencyMs = Date.now() - start
    return { status: res.ok ? 'operational' : 'degraded', latencyMs }
  } catch {
    return { status: 'outage', latencyMs: Date.now() - start }
  }
}

async function checkDatabase(): Promise<{ status: ServiceStatus; latencyMs: number }> {
  const start = Date.now()
  try {
    await db.query('SELECT 1')
    return { status: 'operational', latencyMs: Date.now() - start }
  } catch {
    return { status: 'outage', latencyMs: Date.now() - start }
  }
}

function overallStatus(services: Record<string, { status: ServiceStatus }>): ServiceStatus {
  const statuses = Object.values(services).map((s) => s.status)
  if (statuses.includes('outage')) return 'outage'
  if (statuses.includes('degraded')) return 'degraded'
  return 'operational'
}

export async function GET(): Promise<Response> {
  const [gateway, deployManager, database] = await Promise.all([
    checkService(GATEWAY_URL),
    checkService(DEPLOY_MANAGER_URL),
    checkDatabase(),
  ])

  const platformEntry = { status: 'operational' as ServiceStatus, latencyMs: 0 }
  const services = { platform: platformEntry, gateway, deploy_manager: deployManager, database }

  return NextResponse.json(
    { status: overallStatus(services), services, checked_at: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
