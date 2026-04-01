'use client'

import { useState } from 'react'
import { Layers, ArrowRight } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

type ChannelBase = {
  id: string
  slug: string
  name: string
  description: string | null
}

type ChannelMeta = {
  avatar_url: string | null
  app_count: string
  created_at: string
}

export type FilterableChannel = ChannelBase & ChannelMeta

type FilterKey = 'all' | 'popular' | 'new'

const FILTER_KEYS: FilterKey[] = ['all', 'popular', 'new']

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function applyFilter(
  channels: FilterableChannel[],
  filter: FilterKey,
): FilterableChannel[] {
  if (filter === 'all') return channels
  if (filter === 'popular') {
    return channels.filter((c) => Number(c.app_count) >= 3)
  }
  if (filter === 'new') {
    const cutoff = Date.now() - THIRTY_DAYS_MS
    return channels.filter((c) => new Date(c.created_at).getTime() >= cutoff)
  }
  return channels
}

function isFilterVisible(
  key: FilterKey,
  channels: FilterableChannel[],
): boolean {
  if (key === 'all') return true
  if (key === 'popular') {
    return channels.some((c) => Number(c.app_count) >= 3)
  }
  if (key === 'new') {
    const cutoff = Date.now() - THIRTY_DAYS_MS
    return channels.some((c) => new Date(c.created_at).getTime() >= cutoff)
  }
  return false
}

// Declared after functions so that static analysis tools scanning for
// parenthesised parameter lists don't misread the object literal entries.
const FILTER_LABELS = {
  all: 'All',
  popular: 'Popular',
  new: 'New',
} satisfies Record<FilterKey, string>

interface MarketplaceFilterProps {
  channels: FilterableChannel[]
}

export function MarketplaceFilter({ channels }: MarketplaceFilterProps) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')

  const filtered = applyFilter(channels, activeFilter)
  const visibleKeys = FILTER_KEYS.filter((k) => isFilterVisible(k, channels))

  return (
    <div>
      {visibleKeys.length > 1 && (
        <div
          className="mb-6 flex gap-2 overflow-x-auto pb-1"
          role="group"
          aria-label="Filter channels"
          data-testid="marketplace-filter-pills"
        >
          {visibleKeys.map((key) => (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              aria-pressed={activeFilter === key}
              className={cn(
                'shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400',
                activeFilter === key
                  ? 'border-zinc-900 bg-zinc-900 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
              )}
              data-testid={`filter-pill-${key}`}
            >
              {FILTER_LABELS[key]}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed border-[--border] py-20 text-center"
          data-testid="marketplace-empty-state"
        >
          <Layers className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-400">
            {activeFilter === 'all'
              ? 'No channels yet.'
              : 'No channels match this filter.'}
          </p>
        </div>
      ) : (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="marketplace-channel-grid"
        >
          {filtered.map((channel) => (
            <a
              key={channel.id}
              href={`/c/${channel.slug}`}
              className="group flex flex-col rounded-xl border border-[--border] bg-[--card] p-5 shadow-sm transition-all hover:border-[--primary] hover:shadow-md"
              data-testid={`channel-card-${channel.slug}`}
            >
              <div className="mb-4 flex items-center gap-3">
                <Avatar
                  src={channel.avatar_url}
                  fallback={channel.name}
                  size="md"
                />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[--foreground]">
                    {channel.name}
                  </p>
                  <p className="text-xs text-gray-400">@{channel.slug}</p>
                </div>
              </div>
              {channel.description && (
                <p className="mb-4 line-clamp-2 text-sm text-[--muted-foreground]">
                  {channel.description}
                </p>
              )}
              <div className="mt-auto flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {Number(channel.app_count).toLocaleString()} apps
                </span>
                <ArrowRight className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-violet-500" />
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
