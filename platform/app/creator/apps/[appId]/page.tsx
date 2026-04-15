import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { SidebarNav } from '@/components/sidebar-nav'
import { getCreatorTabs } from '@/lib/creator-tabs'
import { AppSettingsForm } from './app-settings-form'
import type { AppSettingsData } from './app-settings-form'
import EnvVarsSection from './env-vars-section'

interface AppRow {
  [key: string]: unknown
  id: string
  name: string
  slug: string
  description: string | null
  status: string
  model_tier: string
  is_free: boolean
  iframe_url: string | null
  created_at: string
}

export default async function CreatorAppSettingsPage({
  params,
}: {
  params: Promise<{ appId: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login?next=/creator')

  const { appId } = await params

  // Get app with ownership check (app must belong to any channel owned by this user)
  const appResult = await db.query<AppRow>(
    `SELECT a.id, a.name, a.slug, a.description, a.status, a.model_tier, a.is_free, a.credits_per_session, a.iframe_url, a.created_at
     FROM marketplace.apps a
     JOIN marketplace.channels c ON c.id = a.channel_id
     WHERE a.id = $1 AND c.creator_id = $2 AND a.deleted_at IS NULL`,
    [appId, session.user.id],
  )
  const app = appResult.rows[0]
  if (!app) redirect('/creator/apps')

  const appData: AppSettingsData = {
    id: app.id,
    name: app.name,
    description: app.description,
    status: app.status as 'live' | 'draft',
    model_tier: (app.model_tier ?? 'standard') as AppSettingsData['model_tier'],
    is_free: app.is_free,
    credits_per_session: (app as Record<string, unknown>).credits_per_session as number ?? 1,
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex gap-8">
        <SidebarNav title="Creator Studio" tabs={getCreatorTabs()} />
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight">
              {app.name}
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-0.5 rounded-full ${
                app.status === 'live'
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {app.status === 'live' && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              )}
              {app.status}
            </span>
          </div>

          {/* Slug + URL info */}
          <div className="text-[13px] text-slate-400 mb-6 font-mono">
            {app.slug}
            {app.iframe_url && (
              <>
                {' · '}
                <a
                  href={app.iframe_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-500 hover:underline"
                >
                  {app.iframe_url}
                </a>
              </>
            )}
          </div>

          <AppSettingsForm app={appData} />
          <div className="mt-6">
            <EnvVarsSection appId={app.id} />
          </div>
        </div>
      </div>
    </div>
  )
}
