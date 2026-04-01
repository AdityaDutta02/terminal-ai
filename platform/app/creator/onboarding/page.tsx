'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [channelId, setChannelId] = useState('')

  function slugify(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  async function handleCreate() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/creator/onboarding/channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug, description }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setChannelId(data.channelId)
      setStep(2)
    } finally {
      setLoading(false)
    }
  }

  if (step === 1) {
    return (
      <div className="max-w-md mx-auto pt-20 px-6">
        <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight mb-1">Create your channel</h1>
        <p className="text-[14px] text-slate-400 mb-8">Your channel is where your AI apps live.</p>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div>
            <label className="block text-[12px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Channel Name</label>
            <input
              value={name}
              onChange={e => { setName(e.target.value); setSlug(slugify(e.target.value)) }}
              placeholder="My AI Studio"
              className="w-full h-[44px] px-4 border border-slate-200 rounded-xl bg-white text-[14px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Channel Slug</label>
            <input
              value={slug}
              onChange={e => setSlug(slugify(e.target.value))}
              placeholder="my-ai-studio"
              className="w-full h-[44px] px-4 border border-slate-200 rounded-xl bg-white text-[14px] text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
            />
            <p className="text-[12px] text-slate-400 mt-1.5">terminalai.app/c/{slug || 'your-slug'}</p>
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="What kind of AI apps do you build?"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white text-[14px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors resize-none"
            />
          </div>
          {error && <p className="text-red-500 text-[13px]">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={!name || !slug || loading}
            className="w-full h-[44px] bg-[#FF6B00] text-white rounded-xl text-[14px] font-semibold disabled:opacity-50 hover:bg-[#E55F00] transition-colors"
          >
            {loading ? 'Creating...' : 'Create Channel'}
          </button>
        </div>
      </div>
    )
  }

  // Step 2: Deploy instructions
  return (
    <div className="max-w-lg mx-auto pt-20 px-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">&#10003;</span>
        </div>
        <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight mb-1">Channel created!</h1>
        <p className="text-[14px] text-slate-400">Now deploy your first app using the Terminal AI MCP tool.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <p className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider mb-3">In your MCP client:</p>
        <div className="bg-slate-50 rounded-xl p-4 font-mono text-[13px]">
          <p className="text-slate-700">scaffold_app</p>
          <p className="text-slate-400 mt-1">&#8594; channel_id: <span className="text-orange-600">{channelId}</span></p>
        </div>
      </div>

      <div className="flex justify-center gap-4">
        <button
          onClick={() => router.push('/creator')}
          className="h-[40px] px-5 bg-[#FF6B00] text-white rounded-xl text-[14px] font-semibold hover:bg-[#E55F00] transition-colors"
        >
          Go to Dashboard
        </button>
        <a
          href="/developers"
          className="h-[40px] px-5 border border-slate-200 rounded-xl text-[14px] font-medium text-slate-600 hover:bg-slate-50 transition-colors flex items-center"
        >
          Developer Docs
        </a>
      </div>
    </div>
  )
}
