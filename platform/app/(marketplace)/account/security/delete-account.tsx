'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

export function DeleteAccountSection() {
  const router = useRouter()
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const confirmed = confirmText === 'DELETE'

  async function handleDelete() {
    if (!confirmed) return
    setDeleting(true)
    try {
      const res = await fetch('/api/account/delete', { method: 'DELETE' })
      if (res.ok) {
        router.push('/signup')
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string }
        alert(data.error ?? 'Failed to delete account')
      }
    } catch {
      alert('Network error. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-red-200 p-6">
      <div className="flex items-center gap-3 mb-3">
        <Trash2 className="w-5 h-5 text-red-500" />
        <h2 className="text-[16px] font-bold text-red-700">Delete Account</h2>
      </div>
      <p className="text-[14px] text-slate-500 mb-4">
        This will permanently delete your account, all credits, and usage history. This action cannot be undone.
      </p>
      <div className="space-y-3">
        <div>
          <label className="text-[13px] text-slate-500 mb-1 block">
            Type <strong>DELETE</strong> to confirm
          </label>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            className="w-full h-[40px] px-3 rounded-lg border border-slate-200 text-[14px] text-slate-700 font-mono outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
          />
        </div>
        <button
          onClick={handleDelete}
          disabled={!confirmed || deleting}
          className="bg-red-500 hover:bg-red-600 text-white rounded-lg py-2 px-5 text-[14px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {deleting ? 'Deleting...' : 'Delete my account'}
        </button>
      </div>
    </div>
  )
}
