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

export function ApiKeyManager() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [copied, setCopied] = useState(false)
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
      setNewToken(created.token)
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke key')
    }
  }

  async function copyToken() {
    if (!newToken) return
    try {
      await navigator.clipboard.writeText(newToken)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Failed to copy to clipboard')
    }
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
          className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
        />
        <button
          onClick={createKey}
          disabled={creating || !newKeyName.trim()}
          data-testid="generate-key-button"
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {creating ? 'Creating…' : 'Generate Key'}
        </button>
      </div>

      {error && <p className="text-sm text-red-500" data-testid="key-error">{error}</p>}

      {newToken && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4" data-testid="new-token-banner">
          <p className="mb-2 text-sm font-semibold text-violet-800">
            Copy your new API key — it will only be shown once.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2">
            <code className="flex-1 text-sm text-violet-900">
              {showToken ? newToken : '•'.repeat(40)}
            </code>
            <button
              onClick={() => setShowToken(s => !s)}
              className="text-violet-400 hover:text-violet-700"
              aria-label={showToken ? 'Hide token' : 'Show token'}
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button
              onClick={copyToken}
              className="text-violet-400 hover:text-violet-700"
              aria-label="Copy token"
            >
              <Copy className="h-4 w-4" />
            </button>
            {copied && <span className="text-xs text-violet-600">Copied!</span>}
          </div>
        </div>
      )}

      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white" data-testid="keys-list">
        {keys.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            No API keys yet. Generate one above.
          </div>
        )}
        {keys.map(key => (
          <div key={key.id} className="flex items-center justify-between px-4 py-3" data-testid="key-row">
            <div>
              <p className="text-sm font-medium text-gray-900">{key.name}</p>
              <p className="text-xs text-gray-400">
                {key.prefix}… · Created {new Date(key.created_at).toLocaleDateString()}
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
        ))}
      </div>
    </div>
  )
}
