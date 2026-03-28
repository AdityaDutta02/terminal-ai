import { db } from '@/lib/db'
type Stats = {
  total_users: string
  total_channels: string
  total_apps: string
  total_sessions: string
  total_credits_granted: string
}
async function getStats(): Promise<Stats> {
  const result = await db.query<Stats>(
    `SELECT
       (SELECT COUNT(*) FROM "user") AS total_users,
       (SELECT COUNT(*) FROM marketplace.channels WHERE deleted_at IS NULL) AS total_channels,
       (SELECT COUNT(*) FROM marketplace.apps WHERE deleted_at IS NULL) AS total_apps,
       (SELECT COUNT(*) FROM gateway.api_calls) AS total_sessions,
       (SELECT COALESCE(SUM(delta), 0) FROM subscriptions.credit_ledger WHERE delta > 0) AS total_credits_granted`,
  )
  return result.rows[0]
}
function StatCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <p className="text-xs font-medium uppercase tracking-widest text-gray-500">{props.label}</p>
      <p className="mt-2 text-3xl font-bold text-white">{Number(props.value).toLocaleString()}</p>
    </div>
  )
}
export default async function AdminOverview() {
  const stats = await getStats()
  return (
    <div>
      <h1 className="mb-8 text-2xl font-bold text-white">Overview</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Users" value={stats.total_users} />
        <StatCard label="Channels" value={stats.total_channels} />
        <StatCard label="Apps" value={stats.total_apps} />
        <StatCard label="Sessions" value={stats.total_sessions} />
        <StatCard label="Credits granted" value={stats.total_credits_granted} />
      </div>
      <div className="mt-8 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-300">Quick actions</h2>
        <div className="flex flex-wrap gap-3">
          <a
            href="/admin/channels"
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
          >
            Manage channels →
          </a>
          <a
            href="/admin/apps"
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
          >
            Manage apps →
          </a>
          <a
            href="/admin/users"
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
          >
            Manage users →
          </a>
          <form action="/api/search/reindex" method="POST">
            <button
              type="submit"
              className="rounded-lg border border-violet-700 px-4 py-2 text-sm text-violet-300 hover:bg-violet-900/30 transition-colors"
            >
              Reindex search
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
