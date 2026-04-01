'use client'

import { useState, useEffect } from 'react'
import { Copy, Trash2, Plus, Eye, EyeOff } from 'lucide-react'

type ApiKey = {
  id: string
  name: string
  prefix: string
  created_at: string
  last_used_at: string | null
}

function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text)
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  try {
    document.execCommand('copy')
  } finally {
    document.body.removeChild(textarea)
  }
  return Promise.resolve()
}

export function ApiKeyManager() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [creating, setCreating] = useState(false)
  const [revealedTokens, setRevealedTokens] = useState<Map<string, string>>(new Map())
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadKeys() {
    const res = await fetch('/api/developer/keys')
    if (!res.ok) throw new Error('Failed to load keys')
    const data = await res.json() as { keys: ApiKey[] }
    setKeys(data.keys)
  }

  useEffect(() => {
    loadKeys().catch(() => setError('Failed to load keys'))
  }, [])

  async function createKey() {
    if (!newKeyName.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/developer/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Failed to create key')
      }
      const created = await res.json() as { id: string; token: string; prefix: string }
      setRevealedTokens(prev => new Map(prev).set(created.id, created.token))
      setVisibleIds(prev => new Set(prev).add(created.id))
      setNewKeyName('')
      await loadKeys()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setCreating(false)
    }
  }

  async function revokeKey(id: string) {
    if (!confirm('Revoke this API key? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/developer/keys/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to revoke key')
      setKeys(prev => prev.filter(k => k.id !== id))
      setRevealedTokens(prev => { const m = new Map(prev); m.delete(id); return m })
      setVisibleIds(prev => { const s = new Set(prev); s.delete(id); return s })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke key')
    }
  }

  async function copyKey(id: string, token: string) {
    try {
      await copyToClipboard(token)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      setError('Failed to copy to clipboard')
    }
  }

  function toggleVisible(id: string) {
    setVisibleIds(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  return (
    <div className="space-y-6" data-testid="api-key-manager">
      <div className="flex gap-3">
        <input
          type="text"
          value={newKeyName}
          onChange={e => setNewKeyName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && createKey()}
          placeholder="Key name (e.g. cursor-local)"
          data-testid="key-name-input"
          className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30"
        />
        <button
          onClick={createKey}
          disabled={creating || !newKeyName.trim()}
          data-testid="generate-key-button"
          className="flex items-center gap-2 rounded-lg bg-[#FF6B00] px-4 py-2 text-sm font-medium text-[#0A0A0A] hover:bg-[#E55D00] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {creating ? 'Creating…' : 'Generate Key'}
        </button>
      </div>

      {error && <p className="text-sm text-red-500" data-testid="key-error">{error}</p>}

      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white" data-testid="keys-list">
        {keys.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            No API keys yet. Generate one above.
          </div>
        )}
        {keys.map(key => {
          const token = revealedTokens.get(key.id)
          const visible = visibleIds.has(key.id)
          return (
            <div key={key.id} className="space-y-2 px-4 py-3" data-testid="key-row">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{key.name}</p>
                  <p className="text-xs text-gray-400">
                    {key.prefix}… · Created {new Date(key.created_at).toLocaleDateString()}
                    {key.last_used_at && ` · Last used ${new Date(key.last_used_at).toLocaleDateString()}`}
                  </p>
                </div>
                <button
                  onClick={() => revokeKey(key.id)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500"
                  title="Revoke key"
                  aria-label={`Revoke key ${key.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {token && (
                <div className="flex items-center gap-2 rounded-lg border border-orange-100 bg-orange-50 px-3 py-2">
                  <code className="flex-1 truncate text-xs text-orange-900">
                    {visible ? token : '•'.repeat(48)}
                  </code>
                  <button
                    onClick={() => toggleVisible(key.id)}
                    className="shrink-0 text-orange-400 hover:text-orange-700"
                    aria-label={visible ? 'Hide token' : 'Show token'}
                  >
                    {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => copyKey(key.id, token)}
                    className="shrink-0 text-orange-400 hover:text-orange-700"
                    aria-label="Copy token"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  {copiedId === key.id && <span className="shrink-0 text-xs text-[#FF6B00]">Copied!</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
