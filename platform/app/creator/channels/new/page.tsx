'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ImageIcon } from 'lucide-react'
import { logger } from '@/lib/logger'

const CATEGORIES = [
  'AI Tools',
  'Productivity',
  'Developer Tools',
  'Education',
  'Entertainment',
  'Business',
  'Design',
  'Other',
]

export default function NewChannelPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slug, setSlug] = useState('')

  function handleSlugChange(value: string): void {
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    const body = {
      name: fd.get('name') as string,
      slug: slug,
      description: fd.get('description') as string,
      category: fd.get('category') as string,
    }
    try {
      const res = await fetch('/api/creator/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setError(data.error ?? 'Failed to create channel')
        return
      }
      const data = await res.json() as { slug: string }
      router.push(`/creator/channels/${data.slug}`)
    } catch (err) {
      logger.error({ msg: 'create_channel_failed', err: String(err) })
      setError('Unexpected error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-[600px] mx-auto px-6 py-8">
      {/* Back breadcrumb */}
      <a
        href="/creator"
        className="inline-flex items-center gap-1.5 text-[13px] text-slate-400 hover:text-slate-600 transition-colors mb-6"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Dashboard
      </a>

      <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight">Create a channel</h1>
      <p className="text-[14px] text-slate-400 mt-1 mb-6">A channel groups your AI apps under one brand</p>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8">
        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[14px] text-red-700 mb-6">
            {error}
          </div>
        )}

        {/* Avatar upload area */}
        <div className="mb-6">
          <label className="block text-[13px] font-medium text-slate-700 mb-2">Channel avatar</label>
          <div className="w-20 h-20 bg-slate-100 rounded-2xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:border-orange-300 hover:bg-orange-50/30 transition-colors">
            <ImageIcon className="w-6 h-6 text-slate-300" />
            <span className="text-[11px] text-slate-400 mt-1">Avatar</span>
          </div>
        </div>

        {/* Channel name */}
        <div className="mb-5">
          <label className="block text-[13px] font-medium text-slate-700 mb-1.5" htmlFor="name">
            Channel name
          </label>
          <input
            id="name"
            name="name"
            required
            maxLength={80}
            placeholder="My AI Studio"
            className="w-full h-[44px] px-4 rounded-xl border border-slate-200 text-[14px] outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 transition-colors"
          />
        </div>

        {/* URL slug */}
        <div className="mb-5">
          <label className="block text-[13px] font-medium text-slate-700 mb-1.5" htmlFor="slug">
            URL slug
          </label>
          <div className="flex items-center h-[44px] rounded-xl border border-slate-200 focus-within:border-orange-300 focus-within:ring-2 focus-within:ring-orange-100 transition-colors">
            <span className="pl-4 text-[14px] text-slate-400 select-none whitespace-nowrap">terminal.app/c/</span>
            <input
              id="slug"
              name="slug"
              required
              pattern="[a-z0-9-]+"
              maxLength={60}
              placeholder="my-ai-studio"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              className="flex-1 h-full px-1 text-[14px] outline-none bg-transparent"
            />
          </div>
          <p className="mt-1 text-[12px] text-slate-400">Lowercase letters, numbers, and hyphens only</p>
        </div>

        {/* Description */}
        <div className="mb-5">
          <label className="block text-[13px] font-medium text-slate-700 mb-1.5" htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            maxLength={500}
            placeholder="What kind of apps do you build?"
            className="w-full h-[100px] px-4 py-3 rounded-xl border border-slate-200 text-[14px] outline-none resize-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 transition-colors"
          />
        </div>

        {/* Category */}
        <div className="mb-5">
          <label className="block text-[13px] font-medium text-slate-700 mb-1.5" htmlFor="category">
            Category
          </label>
          <select
            id="category"
            name="category"
            className="w-full h-[44px] px-4 rounded-xl border border-slate-200 text-[14px] outline-none bg-white focus:border-orange-300 focus:ring-2 focus:ring-orange-100 transition-colors appearance-none"
          >
            <option value="">Select a category</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat.toLowerCase().replace(/\s+/g, '-')}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="border-t border-slate-100 mt-8 pt-6 flex items-center justify-end gap-3">
          <a
            href="/creator"
            className="h-[40px] px-5 rounded-xl text-[14px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center"
          >
            Cancel
          </a>
          <button
            type="submit"
            disabled={saving}
            className="h-[40px] px-5 rounded-xl bg-[#FF6B00] text-[14px] font-semibold text-white disabled:opacity-60 hover:bg-[#E55F00] transition-colors"
          >
            {saving ? 'Creating...' : 'Create Channel'}
          </button>
        </div>
      </form>
    </div>
  )
}
