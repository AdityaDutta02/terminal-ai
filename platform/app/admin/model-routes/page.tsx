// platform/app/admin/model-routes/page.tsx
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { ModelRoutesTable } from './model-routes-table'

export default async function ModelRoutesPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')

  const { rows: userRows } = await db.query(
    `SELECT role FROM public.user WHERE id = $1`, [session.user.id]
  )
  if (!userRows.length || (userRows[0] as { role: string }).role !== 'admin') {
    redirect('/dashboard')
  }

  const { rows } = await db.query(
    `SELECT id, category, tier, model_string, priority, is_active, updated_at
     FROM platform.model_routes
     ORDER BY category, tier, priority DESC`
  )

  return (
    <div className="dark max-w-5xl mx-auto px-6 py-8 bg-background min-h-screen text-foreground">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Model Routing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Admin-editable model routing table. Changes take effect immediately — no deploy needed.
        </p>
      </div>
      <ModelRoutesTable initialRoutes={rows as Array<Record<string, unknown>>} />
    </div>
  )
}
