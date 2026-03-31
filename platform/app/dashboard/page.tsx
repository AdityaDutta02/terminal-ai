import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { getBalance } from '@/lib/credits'
import Link from 'next/link'

function deployBadge(status: string): string {
  if (status === 'live') return 'bg-green-900/40 text-green-400'
  if (status === 'building') return 'bg-yellow-900/40 text-yellow-400'
  if (status === 'pending') return 'bg-blue-900/40 text-blue-400'
  return 'bg-red-900/40 text-red-400'
}

type SubscriptionRow = {
  status: string
  name: string
  current_period_end: string | null
}

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')

  const [apps, credits, subscription] = await Promise.all([
    db.query(
      `SELECT a.id, a.name, a.status, d.subdomain, d.status as deploy_status
       FROM marketplace.apps a
       LEFT JOIN deployments.deployments d ON d.app_id = a.id
       WHERE a.channel_id IN (
         SELECT id FROM marketplace.channels WHERE creator_id = $1 AND deleted_at IS NULL
       )
       ORDER BY a.created_at DESC`,
      [session.user.id],
    ),
    getBalance(session.user.id).catch(() => null),
    db.query<SubscriptionRow>(
      `SELECT us.status, p.name, us.current_period_end
       FROM subscriptions.user_subscriptions us
       JOIN subscriptions.plans p ON p.id = us.plan_id
       WHERE us.user_id = $1
       ORDER BY us.created_at DESC LIMIT 1`,
      [session.user.id],
    ).then(r => r.rows[0] ?? null).catch(() => null),
  ])

  const hasActiveSubscription = subscription?.status === 'active'

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <Link
          href="/dashboard/apps/new"
          className="px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-sm font-medium text-white transition-colors">
          Deploy New App
        </Link>
      </div>

      {/* Credits & Subscription */}
      <div className="grid gap-4 sm:grid-cols-2 mb-10">
        {/* Credits card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Credit Balance</p>
          {credits !== null ? (
            <p className="text-3xl font-bold text-white">{credits.toLocaleString()}</p>
          ) : (
            <p className="text-sm text-zinc-500">Unable to load balance</p>
          )}
          {!hasActiveSubscription && (
            <Link
              href="/pricing"
              className="mt-4 inline-block rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-colors">
              Buy Credits
            </Link>
          )}
        </div>

        {/* Subscription card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Subscription</p>
          {hasActiveSubscription ? (
            <>
              <p className="text-lg font-semibold text-white capitalize">{subscription?.name ?? 'Active'}</p>
              {subscription?.current_period_end && (
                <p className="mt-1 text-sm text-zinc-400">
                  Renews {new Date(subscription.current_period_end).toLocaleDateString()}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-500 mb-3">No active subscription</p>
              <Link
                href="/pricing"
                className="inline-block rounded-lg border border-violet-500 px-4 py-2 text-sm font-medium text-violet-400 hover:bg-violet-600 hover:text-white transition-colors">
                Subscribe
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Apps */}
      <h2 className="text-lg font-semibold text-white mb-4">Your Apps</h2>
      {apps.rows.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <p className="text-lg mb-2">No apps yet</p>
          <p className="text-sm">Deploy your first app to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {apps.rows.map((app) => (
            <div
              key={app.id as string}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-white">{app.name as string}</p>
                <p className="text-sm text-zinc-400">
                  {app.subdomain ? `${app.subdomain as string}.apps.terminalai.app` : 'No subdomain yet'}
                </p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${deployBadge((app.deploy_status ?? 'pending') as string)}`}>
                {(app.deploy_status as string) ?? 'pending'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
