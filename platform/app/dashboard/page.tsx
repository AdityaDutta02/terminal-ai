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

type RecentSession = {
  created_at: string
  credits_deducted: number
  app_name: string
  app_slug: string
  channel_slug: string
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  const weeks = Math.floor(days / 7)
  if (weeks === 1) return '1 week ago'
  return `${weeks} weeks ago`
}

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')

  const [apps, credits, subscription, recentSessions] = await Promise.all([
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
    db.query<RecentSession>(
      `SELECT et.created_at, et.credits_deducted, a.name as app_name, a.slug as app_slug,
              c.slug as channel_slug
       FROM gateway.embed_tokens et
       JOIN marketplace.apps a ON a.id = et.app_id
       JOIN marketplace.channels c ON c.id = a.channel_id
       WHERE et.user_id = $1
       ORDER BY et.created_at DESC
       LIMIT 5`,
      [session.user.id],
    ).then(r => r.rows).catch(() => [] as RecentSession[]),
  ])

  const hasActiveSubscription = subscription?.status === 'active'

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <Link
          href="/dashboard/apps/new"
          className="px-4 py-2 bg-[#FF6B00] hover:bg-[#E55D00] rounded-lg text-sm font-medium text-[#0A0A0A] transition-colors">
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
              className="mt-4 inline-block rounded-lg bg-[#FF6B00] px-4 py-2 text-sm font-medium text-[#0A0A0A] hover:bg-[#E55D00] transition-colors">
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
                className="inline-block rounded-lg border border-[#FF6B00] px-4 py-2 text-sm font-medium text-[#FF6B00] hover:bg-[#FF6B00] hover:text-[#0A0A0A] transition-colors">
                Subscribe
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
      {recentSessions.length === 0 ? (
        <div className="text-center py-10 text-zinc-500 mb-10">
          <p className="text-sm">No activity yet</p>
        </div>
      ) : (
        <ul className="space-y-3 mb-10" role="list">
          {recentSessions.map((session, index) => (
            <li
              key={index}
              data-testid="recent-activity-row"
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <Link
                  href={`/viewer/${session.channel_slug}/${session.app_slug}`}
                  className="font-medium text-white hover:text-[#FF6B00] transition-colors">
                  {session.app_name}
                </Link>
                <p className="text-sm text-zinc-400 mt-0.5">{timeAgo(session.created_at)}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-amber-900/30 text-amber-400 whitespace-nowrap">
                -{session.credits_deducted} credits
              </span>
            </li>
          ))}
        </ul>
      )}

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
                  {app.subdomain ? `${app.subdomain as string}.apps.terminalai.studioionique.com` : 'No subdomain yet'}
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
