import { NextResponse } from 'next/server'
import { requireCreator } from '@/lib/middleware/require-creator'

const DEPLOY_MANAGER_URL = process.env.DEPLOY_MANAGER_URL ?? 'http://deploy-manager:3002'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ deploymentId: string }> }
): Promise<Response> {
  const result = await requireCreator()
  if (result instanceof NextResponse) return result

  const { deploymentId } = await params

  const upstream = await fetch(`${DEPLOY_MANAGER_URL}/deployments/${deploymentId}/logs`)
  const data: unknown = await upstream.json()

  return NextResponse.json(data, { status: upstream.status })
}
