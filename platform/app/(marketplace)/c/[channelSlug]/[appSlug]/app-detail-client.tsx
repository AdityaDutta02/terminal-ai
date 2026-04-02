'use client'

import { useState } from 'react'
import {
  Star,
  Sparkles,
  Share2,
  ExternalLink,
  Heart,
  Flag,
  ImageIcon,
} from 'lucide-react'

interface AppDetailClientProps {
  appName: string
  appDescription: string
  channelName: string
  channelSlug: string
  appSlug: string
  credits: number
  isLoggedIn: boolean
  appUrl: string
}

const placeholderReviews = [
  {
    user: 'Sarah Chen',
    avatar: 'SC',
    rating: 5,
    date: '2 days ago',
    text: 'Incredibly accurate. Helped me plan with real data.',
  },
  {
    user: 'Marcus Reid',
    avatar: 'MR',
    rating: 4,
    date: '1 week ago',
    text: 'Great tool overall. Solid analysis.',
  },
]

const placeholderFeatures = [
  'Real-time data processing',
  'Intelligent analysis engine',
  'Export to multiple formats',
  'Customizable parameters',
  'Session history tracking',
  'Collaborative sharing',
]

type TabId = 'overview' | 'screenshots' | 'reviews'

export function AppDetailClient({
  appName,
  appDescription,
  channelName,
  channelSlug,
  appSlug,
  credits,
  isLoggedIn,
  appUrl,
}: AppDetailClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [saved, setSaved] = useState(false)

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'screenshots', label: 'Screenshots' },
    { id: 'reviews', label: 'Reviews' },
  ]

  const averageRating = 4.5
  const totalReviews = placeholderReviews.length

  return (
    <div className="flex gap-8 items-start">
      {/* Left column */}
      <div className="flex-1 min-w-0">
        {/* Tab bar */}
        <div className="flex items-center gap-6 border-b border-slate-100 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium transition-colors relative ${
                activeTab === tab.id
                  ? 'text-orange-600'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {activeTab === 'overview' && (
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-3">About this app</h3>
            <p className="text-slate-600 leading-relaxed mb-8">{appDescription}</p>

            <h3 className="text-lg font-semibold text-slate-900 mb-4">Features</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {placeholderFeatures.map((feature) => (
                <div key={feature} className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-2 flex-shrink-0" />
                  <span className="text-sm text-slate-600">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Screenshots tab */}
        {activeTab === 'screenshots' && (
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Screenshots</h3>
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="aspect-video bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center"
                >
                  <ImageIcon className="w-8 h-8 text-slate-300" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reviews tab */}
        {activeTab === 'reviews' && (
          <div>
            {/* Rating summary */}
            <div className="flex items-center gap-4 mb-6 p-4 bg-slate-50 rounded-xl">
              <div className="text-center">
                <p className="text-3xl font-bold text-slate-900">{averageRating}</p>
                <div className="flex items-center gap-0.5 mt-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`w-3.5 h-3.5 ${
                        s <= Math.round(averageRating)
                          ? 'text-orange-400 fill-orange-400'
                          : 'text-slate-200'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-1">{totalReviews} reviews</p>
              </div>

              <div className="flex-1 space-y-1">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = placeholderReviews.filter((r) => r.rating === star).length
                  const pct = totalReviews > 0 ? (count / totalReviews) * 100 : 0
                  return (
                    <div key={star} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-3">{star}</span>
                      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-orange-400 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Review cards */}
            <div className="space-y-4">
              {placeholderReviews.map((review) => (
                <div
                  key={review.user}
                  className="p-4 border border-slate-100 rounded-xl"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                      <span className="text-xs font-semibold text-orange-700">
                        {review.avatar}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{review.user}</p>
                      <p className="text-xs text-slate-400">{review.date}</p>
                    </div>
                    <div className="ml-auto flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-3 h-3 ${
                            s <= review.rating
                              ? 'text-orange-400 fill-orange-400'
                              : 'text-slate-200'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-slate-600">{review.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right column - sticky sidebar */}
      <div className="w-[320px] flex-shrink-0 sticky top-24 space-y-4">
        {/* Credits cost */}
        <div className="bg-slate-50 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-orange-500" />
            <span className="text-sm font-medium text-slate-500">Credits per session</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{credits}</p>
        </div>

        {/* CTA */}
        {isLoggedIn ? (
          <a
            href={`/viewer/${channelSlug}/${appSlug}`}
            className="flex items-center justify-center gap-2 w-full bg-[#FF6B00] hover:bg-[#E55D00] text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-orange-200/50 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Open App
          </a>
        ) : (
          <div className="space-y-2">
            <a
              href={`/login?next=/viewer/${channelSlug}/${appSlug}`}
              className="flex items-center justify-center gap-2 w-full bg-[#FF6B00] hover:bg-[#E55D00] text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-orange-200/50 transition-colors"
            >
              Sign in to launch
            </a>
            <p className="text-xs text-slate-400 text-center">
              New users get 10 free credits.{' '}
              <a href="/signup" className="text-orange-600 hover:underline">
                Create account
              </a>
            </p>
          </div>
        )}

        {/* Share + Save */}
        <div className="flex gap-2">
          <button className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium transition-colors">
            <Share2 className="w-4 h-4" />
            Share
          </button>
          <button
            onClick={() => setSaved((s) => !s)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              saved
                ? 'bg-orange-50 text-orange-600 border border-orange-200'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}
          >
            <Heart className={`w-4 h-4 ${saved ? 'fill-orange-600' : ''}`} />
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>

        {/* Details */}
        <div className="border border-slate-100 rounded-xl p-5 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
            Details
          </h4>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Category</span>
            <span className="font-medium text-slate-700">AI App</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Channel</span>
            <a href={`/c/${channelSlug}`} className="font-medium text-orange-600 hover:underline">
              {channelName}
            </a>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Sessions</span>
            <span className="font-medium text-slate-700">--</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Rating</span>
            <div className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5 text-orange-400 fill-orange-400" />
              <span className="font-medium text-slate-700">4.5</span>
            </div>
          </div>
        </div>

        {/* Report */}
        <button className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors mx-auto">
          <Flag className="w-3 h-3" />
          Report this app
        </button>
      </div>
    </div>
  )
}
