'use client'

import { useState, useRef, useEffect } from 'react'

interface ShareButtonProps {
  url: string
  title: string
  description?: string
  type: 'channel' | 'app'
}

export function ShareButton({ url, title, description = '', type }: ShareButtonProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
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
      setTimeout(() => setCopied(false), 2000)
    } catch {
      console.warn('[ShareButton] Failed to copy link to clipboard')
    }
  }
  const shareX = () => {
    const text = title + ' on Terminal AI — ' + description.slice(0, 100)
    window.open('https://twitter.com/intent/tweet?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text), '_blank')
  }
  const shareLinkedIn = () => {
    window.open('https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(url), '_blank')
  }
  const shareWhatsApp = () => {
    window.open('https://wa.me/?text=' + encodeURIComponent(title + ' on Terminal AI: ' + url), '_blank')
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white text-sm font-medium transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        Share
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-52 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <p className="text-sm font-medium text-white">Share this {type}</p>
          </div>
          <div className="py-1">
            <button onClick={copyLink}
              className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
              {copied ? '✓ Copied!' : '📋 Copy link'}
            </button>
            <button onClick={shareX}
              className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
              𝕏 Share on X
            </button>
            <button onClick={shareLinkedIn}
              className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
              💼 Share on LinkedIn
            </button>
            <button onClick={shareWhatsApp}
              className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
              💬 Share on WhatsApp
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
