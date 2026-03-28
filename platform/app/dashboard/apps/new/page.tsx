'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
export default function DeployNewAppPage() {
  const router = useRouter()
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    description: '',
    githubRepo: '',
    branch: 'main',
    channelId: '',
  })
  useEffect(() => {
    fetch('/api/creator/channels')
      .then((r) => r.json())
      .then((data: { channels: { id: string; name: string }[] }) => setChannels(data.channels ?? []))
      .catch(() => setChannels([]))
  }, [])
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/creator/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json() as { appId?: string; error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Failed to deploy')
        return
      }
      router.push('/dashboard')
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className="max-w-lg mx-auto py-12 px-4">
      <h1 className="text-2xl font-bold text-white mb-8">Deploy New App</h1>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">App Name</label>
          <input
            type="text"
            required
            minLength={3}
            maxLength={60}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">Description</label>
          <textarea
            maxLength={500}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">GitHub Repo (owner/repo)</label>
          <input
            type="text"
            required
            placeholder="owner/repo"
            value={form.githubRepo}
            onChange={(e) => setForm({ ...form, githubRepo: e.target.value })}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">Branch</label>
          <input
            type="text"
            value={form.branch}
            onChange={(e) => setForm({ ...form, branch: e.target.value })}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">Channel</label>
          <select
            required
            value={form.channelId}
            onChange={(e) => setForm({ ...form, channelId: e.target.value })}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
            <option value="">Select a channel…</option>
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>{ch.name}</option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors">
          {loading ? 'Queuing deploy…' : 'Deploy App'}
        </button>
      </form>
    </div>
  )
}
