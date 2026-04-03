'use client'

import { useState, useRef } from 'react'

interface ShareButtonProps {
  url: string
  title: string
  description?: string
  type: 'channel' | 'app'
}

export function ShareButton({ url }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const copyLink = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url)
      } else {
        const ta = document.createElement('textarea')
        ta.value = url
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore clipboard errors */
    }
  }

  return (
    <div className="relative">
      <button
        onClick={copyLink}
        className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#1e1e1f] text-white hover:bg-[#333] text-[13px] font-medium transition-all duration-200 hover:shadow-lg hover:shadow-black/15 active:scale-[0.97]"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        {copied ? 'Copied!' : 'Share'}
      </button>

      {/* Toast */}
      {copied && (
        <div className="absolute right-0 top-12 bg-[#1e1e1f] text-white text-[12px] font-medium px-3 py-1.5 rounded-lg shadow-lg animate-[menuIn_0.15s_ease-out] whitespace-nowrap">
          Link copied to clipboard
        </div>
      )}
    </div>
  )
}
