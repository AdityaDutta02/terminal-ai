import { db } from '@/lib/db'
import { Badge } from '@/components/ui/badge'
import { SearchBar } from '@/components/search-bar'
import { MarketplaceFilter, type FilterableChannel } from '@/components/marketplace-filter'

async function getChannels(): Promise<FilterableChannel[]> {
  const result = await db.query<FilterableChannel>(
    `SELECT c.id, c.slug, c.name, c.description, c.avatar_url,
            c.created_at,
            COUNT(a.id) AS app_count
     FROM marketplace.channels c
     LEFT JOIN marketplace.apps a
       ON a.channel_id = c.id AND a.status = 'live' AND a.deleted_at IS NULL
     WHERE c.status = 'active' AND c.deleted_at IS NULL
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
  )
  return result.rows
}

export default async function HomePage() {
  const channels = await getChannels()

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      {/* Hero */}
      <div className="mb-12 text-center">
        <Badge variant="violet" className="mb-4">Now in beta</Badge>
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          Discover AI-powered apps
        </h1>
        <p className="mt-4 text-lg text-gray-500">
          Curated tools built by creators. Start with 20 free credits after email verification.
        </p>
        <div className="mt-6 flex justify-center">
          <SearchBar />
        </div>
      </div>

      {/* Pricing */}
      <div className="mb-16">
        <h2 className="mb-2 text-center text-2xl font-bold tracking-tight text-gray-900">
          Simple pricing
        </h2>
        <p className="mb-8 text-center text-sm text-gray-500">
          Buy credits or subscribe for a monthly allowance.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Starter */}
          <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">Starter</p>
            <p className="mt-3 text-3xl font-bold text-gray-900">₹149<span className="text-base font-normal text-gray-400">/mo</span></p>
            <p className="mt-1 text-sm text-gray-500">250 credits / month</p>
            <a
              href="/pricing"
              className="mt-6 rounded-lg bg-gray-900 px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-gray-700"
            >
              Get started
            </a>
          </div>
          {/* Creator */}
          <div className="flex flex-col rounded-xl border-2 border-violet-500 bg-white p-6 shadow-md">
            <p className="text-sm font-semibold uppercase tracking-wide text-violet-500">Creator</p>
            <p className="mt-3 text-3xl font-bold text-gray-900">₹299<span className="text-base font-normal text-gray-400">/mo</span></p>
            <p className="mt-1 text-sm text-gray-500">650 credits / month</p>
            <a
              href="/pricing"
              className="mt-6 rounded-lg bg-violet-600 px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-violet-700"
            >
              Get started
            </a>
          </div>
          {/* Pro */}
          <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">Pro</p>
            <p className="mt-3 text-3xl font-bold text-gray-900">₹599<span className="text-base font-normal text-gray-400">/mo</span></p>
            <p className="mt-1 text-sm text-gray-500">1400 credits / month</p>
            <a
              href="/pricing"
              className="mt-6 rounded-lg bg-gray-900 px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-gray-700"
            >
              Get started
            </a>
          </div>
        </div>
      </div>

      {/* Channels */}
      <MarketplaceFilter channels={channels} />
    </div>
  )
}
