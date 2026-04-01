import { db } from '@/lib/db'
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

const PLANS = [
  { name: 'Starter', price: '₹149', credits: '250 credits / month', featured: false },
  { name: 'Creator', price: '₹299', credits: '650 credits / month', featured: true },
  { name: 'Pro', price: '₹599', credits: '1,400 credits / month', featured: false },
] as const

export default async function HomePage() {
  const channels = await getChannels()

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      {/* Hero */}
      <div className="mb-12 text-center">
        <p className="mb-3 text-sm font-medium text-violet-600">Beta</p>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          AI apps, ready to use
        </h1>
        <p className="mt-3 text-base text-gray-500 max-w-md mx-auto">
          Browse curated tools from creators. 20 free credits after email verification.
        </p>
        <div className="mt-6 flex justify-center">
          <SearchBar />
        </div>
      </div>

      {/* Pricing */}
      <div className="mb-16">
        <h2 className="mb-1 text-center text-xl font-semibold text-gray-900">
          Simple pricing
        </h2>
        <p className="mb-6 text-center text-sm text-gray-500">
          Subscribe monthly or buy credits as you go.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`flex flex-col rounded-xl p-6 ${
                plan.featured
                  ? 'border-2 border-violet-500 bg-white shadow-sm'
                  : 'border border-gray-200 bg-white'
              }`}
            >
              <p className={`text-sm font-semibold uppercase tracking-wide ${
                plan.featured ? 'text-violet-600' : 'text-gray-400'
              }`}>
                {plan.name}
              </p>
              <p className="mt-3 text-3xl font-bold text-gray-900">
                {plan.price}<span className="text-base font-normal text-gray-400">/mo</span>
              </p>
              <p className="mt-1 text-sm text-gray-500">{plan.credits}</p>
              <a
                href="/pricing"
                className={`mt-6 rounded-lg px-4 py-2 text-center text-sm font-medium transition-colors ${
                  plan.featured
                    ? 'bg-violet-600 text-white hover:bg-violet-700'
                    : 'bg-gray-900 text-white hover:bg-gray-700'
                }`}
              >
                Get started
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Channels */}
      <MarketplaceFilter channels={channels} />
    </div>
  )
}
