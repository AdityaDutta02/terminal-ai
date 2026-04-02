'use client'

import { ShareButton } from '@/components/share-button'
import { Star, Sparkles, ExternalLink } from 'lucide-react'

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

const placeholderFeatures = [
  'Real-time data processing',
  'Intelligent analysis engine',
  'Export to multiple formats',
  'Customizable parameters',
  'Session history tracking',
  'Collaborative sharing',
]

export function AppDetailClient({
  appName,
  appDescription,
  channelName,
  channelSlug,
  appSlug,
  credits,
  isLoggedIn,
}: AppDetailClientProps) {
  const bugReportHref = `mailto:support@studioionique.com?subject=Bug Report: ${encodeURIComponent(appName)}&body=Please describe the issue you encountered:`

  return (
    <div className="flex gap-8 items-start">
      {/* Left column */}
      <div className="flex-1 min-w-0">
        {/* Overview content */}
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

        {/* Share */}
        <ShareButton
          url={`https://terminalai.studioionique.com/c/${channelSlug}/${appSlug}`}
          title={appName}
          description={appDescription}
          type="app"
        />

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

        {/* Report a Bug */}
        <a
          href={bugReportHref}
          className="block text-center text-xs text-slate-400 hover:text-slate-600 transition-colors"
          data-testid="report-bug-link"
        >
          Report a Bug
        </a>
      </div>
    </div>
  )
}
