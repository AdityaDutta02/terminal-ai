import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const result = await db.query(
      `UPDATE mcp.api_keys
       SET revoked_at = NOW()
       WHERE id = $1 AND creator_id = $2 AND revoked_at IS NULL`,
      [id, session.user.id]
    )

    if ((result.rowCount ?? 0) === 0) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 })
    }

    return NextResponse.json({ revoked: true })
  } catch {
    return NextResponse.json({ error: 'Failed to revoke key' }, { status: 500 })
  }
}
