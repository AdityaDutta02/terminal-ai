'use client'

import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { Label } from '@/components/ui/label'

export function AccountPasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setStatus('error')
      setMessage('New passwords do not match.')
      return
    }
    if (newPassword.length < 8) {
      setStatus('error')
      setMessage('Password must be at least 8 characters.')
      return
    }
    setStatus('loading')
    setMessage('')
    const result = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: false,
    })
    if (result.error) {
      setStatus('error')
      setMessage(result.error.message ?? 'Failed to update password.')
    } else {
      setStatus('success')
      setMessage('Password updated successfully.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }
  }
  const inputClassName =
    'w-full h-[44px] px-4 rounded-xl border border-slate-200 text-[14px] text-slate-700 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 transition-all'

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
      <div className="space-y-1.5">
        <Label htmlFor="current-password" className="text-[13px] font-medium text-slate-600">
          Current password
        </Label>
        <input
          id="current-password"
          type="password"
          className={inputClassName}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-password" className="text-[13px] font-medium text-slate-600">
          New password
        </Label>
        <input
          id="new-password"
          type="password"
          className={inputClassName}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-password" className="text-[13px] font-medium text-slate-600">
          Confirm new password
        </Label>
        <input
          id="confirm-password"
          type="password"
          className={inputClassName}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>
      {message && (
        <p className={`text-[13px] ${status === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={status === 'loading'}
        className="h-[40px] px-5 rounded-xl bg-slate-900 text-white text-[14px] font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors"
      >
        {status === 'loading' ? 'Updating\u2026' : 'Update password'}
      </button>
    </form>
  )
}
