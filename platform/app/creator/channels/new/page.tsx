'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { logger } from '@/lib/logger'
export default function NewChannelPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    const body = {
      name: fd.get('name') as string,
      slug: fd.get('slug') as string,
      description: fd.get('description') as string,
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
    <div className="max-w-xl">
      <div className="mb-8">
        <a href="/creator" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">← Dashboard</a>
        <h1 className="mt-4 text-2xl font-bold text-gray-900">Create a channel</h1>
        <p className="mt-1 text-sm text-gray-500">A channel groups your AI apps under one brand</p>
      </div>
      <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
        {error && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="name">Channel name</label>
          <input
            id="name"
            name="name"
            required
            maxLength={80}
            placeholder="My AI Studio"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="slug">URL slug</label>
          <div className="flex items-center rounded-lg border border-gray-200 focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100">
            <span className="pl-3 text-sm text-gray-400">terminalai.app/c/</span>
            <input
              id="slug"
              name="slug"
              required
              pattern="[a-z0-9-]+"
              maxLength={60}
              placeholder="my-ai-studio"
              className="flex-1 rounded-lg px-2 py-2 text-sm outline-none"
            />
          </div>
          <p className="mt-1 text-xs text-gray-400">Lowercase letters, numbers, and hyphens only</p>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            rows={3}
            maxLength={500}
            placeholder="What kind of apps do you build?"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none resize-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
          />
        </div>
        <div className="flex items-center justify-end gap-3 pt-2">
          <a href="/creator" className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            Cancel
          </a>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 hover:bg-violet-700 transition-colors"
          >
            {saving ? 'Creating…' : 'Create channel'}
          </button>
        </div>
      </form>
    </div>
  )
}
