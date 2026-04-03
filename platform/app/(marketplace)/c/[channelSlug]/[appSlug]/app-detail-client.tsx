'use client'

import { ShareButton } from '@/components/share-button'
import { Sparkles, ArrowUpRight } from 'lucide-react'

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

export function AppDetailClient(props: AppDetailClientProps) {
  const { appName, appDescription, channelName, channelSlug, appSlug, credits, isLoggedIn } = props
  const bugReportHref = `mailto:support@studioionique.com?subject=Bug Report: ${encodeURIComponent(appName)}&body=Please describe the issue you encountered:`

  return (
    <div className="flex flex-col lg:flex-row gap-12 items-start">
      {/* Left column — description */}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold uppercase tracking-widest text-[#1e1e1f]/30 mb-4">
          About
        </p>
        <p className="text-[15px] text-[#1e1e1f]/55 leading-[1.7] max-w-[560px]">
          {appDescription}
        </p>

        {/* Details — horizontal, minimal */}
        <div className="mt-10 pt-8 border-t border-[#1e1e1f]/8">
          <p className="text-[12px] font-semibold uppercase tracking-widest text-[#1e1e1f]/30 mb-5">
            Details
          </p>
          <div className="grid grid-cols-2 gap-y-4 gap-x-8 max-w-[400px]">
            <span className="text-[13px] text-[#1e1e1f]/35">Category</span>
            <span className="text-[13px] font-medium text-[#1e1e1f]">AI App</span>
            <span className="text-[13px] text-[#1e1e1f]/35">Channel</span>
            <a
              href={`/c/${channelSlug}`}
              className="text-[13px] font-medium text-[#FF6B00] hover:text-[#E55D00] transition-colors"
            >
              {channelName}
            </a>
            <span className="text-[13px] text-[#1e1e1f]/35">Cost</span>
            <span className="text-[13px] font-medium text-[#1e1e1f] font-mono">
              {credits} credits / session
            </span>
          </div>
        </div>

        {/* Report bug — tucked away at bottom */}
        <div className="mt-10">
          <a
            href={bugReportHref}
            className="text-[12px] text-[#1e1e1f]/25 hover:text-[#1e1e1f]/50 transition-colors"
            data-testid="report-bug-link"
          >
            Report a bug
          </a>
        </div>
      </div>

      {/* Right column — sticky action area */}
      <div className="w-full lg:w-[300px] flex-shrink-0 lg:sticky lg:top-24 space-y-5">
        {/* Credits */}
        <div className="bg-white rounded-[20px] p-6 border border-[#1e1e1f]/5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-[#FF6B00]" />
            <span className="text-[12px] font-semibold uppercase tracking-widest text-[#1e1e1f]/30">
              Per session
            </span>
          </div>
          <p className="text-[32px] font-display text-[#1e1e1f] tracking-[-0.02em]">{credits} credits</p>
        </div>

        {/* CTA */}
        {isLoggedIn ? (
          <a
            href={`/viewer/${channelSlug}/${appSlug}`}
            className="flex items-center justify-center gap-2 w-full bg-[#1e1e1f] hover:bg-[#333] text-white font-medium py-3.5 rounded-full text-[15px] hover:shadow-lg hover:shadow-black/15 active:scale-[0.98] transition-all duration-200"
          >
            Open App
            <ArrowUpRight className="w-4 h-4" />
          </a>
        ) : (
          <div className="space-y-3">
            <a
              href={`/login?next=/viewer/${channelSlug}/${appSlug}`}
              className="flex items-center justify-center gap-2 w-full bg-[#1e1e1f] hover:bg-[#333] text-white font-medium py-3.5 rounded-full text-[15px] hover:shadow-lg hover:shadow-black/15 active:scale-[0.98] transition-all duration-200"
            >
              Sign in to launch
              <ArrowUpRight className="w-4 h-4" />
            </a>
            <p className="text-[12px] text-[#1e1e1f]/30 text-center">
              New users get 10 free credits.{' '}
              <a href="/signup" className="text-[#FF6B00] hover:text-[#E55D00] transition-colors">
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
      </div>
    </div>
  )
}
