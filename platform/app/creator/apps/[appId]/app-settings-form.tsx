'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ModelTier } from '@/lib/pricing'
import { MODEL_TIER_CREDITS } from '@/lib/pricing'

type AppStatus = 'live' | 'draft' | 'coming_soon'

export type AppSettingsData = {
  id: string
  name: string
  description: string | null
  status: AppStatus
  model_tier: ModelTier
  is_free: boolean
}

function getTierLabel(tier: ModelTier): string {
  if (tier === 'standard') return 'Standard'
  if (tier === 'advanced') return 'Advanced'
  if (tier === 'premium') return 'Premium'
  if (tier === 'image-fast') return 'Image Fast'
  return 'Image Pro'
}

const MODEL_TIER_OPTIONS = Object.keys(MODEL_TIER_CREDITS) as ModelTier[]

type ToastState = { type: 'success' | 'error'; message: string } | null

function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  if (!toast) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] font-medium border ${
        toast.type === 'success'
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : 'bg-red-50 border-red-200 text-red-700'
      }`}
    >
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={onDismiss}
        className="text-current opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}

export function AppSettingsForm({ app }: { app: AppSettingsData }) {
  const router = useRouter()
  const [name, setName] = useState(app.name)
  const [description, setDescription] = useState(app.description ?? '')
  const [status, setStatus] = useState<AppStatus>(app.status)
  const [modelTier, setModelTier] = useState<ModelTier>(app.model_tier)
  const [isFree, setIsFree] = useState(app.is_free)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<ToastState>(null)

  // Danger zone state
  const [deleteNameInput, setDeleteNameInput] = useState('')
  const [deleting, setDeleting] = useState(false)

  const descLength = description.length
  const deleteConfirmed = deleteNameInput.trim() === app.name.trim()

  async function handleSave() {
    if (!name.trim()) {
      setToast({ type: 'error', message: 'App name is required.' })
      return
    }
    setSaving(true)
    setToast(null)
    try {
      const res = await fetch(`/api/creator/apps/${app.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          status,
          model_tier: modelTier,
          is_free: isFree,
        }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setToast({ type: 'error', message: body.error ?? 'Failed to save changes.' })
        return
      }
      setToast({ type: 'success', message: 'Settings saved successfully.' })
    } catch {
      setToast({ type: 'error', message: 'Network error. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteConfirmed) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/creator/apps/${app.id}`, { method: 'DELETE' })
      if (res.ok) {
        router.push('/creator/apps')
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setToast({ type: 'error', message: data.error ?? 'Failed to delete app' })
      }
    } catch {
      setToast({ type: 'error', message: 'Network error. Please try again.' })
    } finally {
      setDeleting(false)
      setDeleteNameInput('')
    }
  }

  return (
    <div className="space-y-6">
      {/* App Info */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-[16px] font-bold text-slate-900 mb-5">App Settings</h2>

        <div className="space-y-5">
          {/* Name */}
          <div>
            <label className="block text-[13px] font-medium text-slate-700 mb-1.5" htmlFor="app-name">
              App Name
            </label>
            <input
              id="app-name"
              data-testid="app-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="w-full h-[44px] px-4 rounded-xl border border-slate-200 text-[14px] text-slate-700 placeholder-slate-400 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all"
              placeholder="My AI App"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[13px] font-medium text-slate-700 mb-1.5" htmlFor="app-description">
              Description
              <span className="ml-2 text-[12px] font-normal text-slate-400">
                {descLength}/500
              </span>
            </label>
            <textarea
              id="app-description"
              data-testid="app-description-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[14px] text-slate-700 placeholder-slate-400 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all resize-none"
              placeholder="Describe what your app does…"
            />
          </div>

          {/* Model Tier */}
          <div>
            <label className="block text-[13px] font-medium text-slate-700 mb-1.5" htmlFor="model-tier">
              Model Tier
            </label>
            <select
              id="model-tier"
              data-testid="model-tier-select"
              value={modelTier}
              onChange={(e) => setModelTier(e.target.value as ModelTier)}
              className="w-full h-[44px] px-4 rounded-xl border border-slate-200 text-[14px] text-slate-700 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all bg-white appearance-none"
            >
              {MODEL_TIER_OPTIONS.map((tier) => (
                <option key={tier} value={tier}>
                  {getTierLabel(tier)} - {MODEL_TIER_CREDITS[tier]} cr/session
                </option>
              ))}
            </select>
          </div>

          {/* Status toggle */}
          <div>
            <p className="text-[13px] font-medium text-slate-700 mb-2">Status</p>
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1">
              <button
                data-testid="status-live-btn"
                type="button"
                onClick={() => setStatus('live')}
                className={`px-5 py-1.5 rounded-lg text-[13px] font-semibold transition-all ${
                  status === 'live'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Live
              </button>
              <button
                data-testid="status-draft-btn"
                type="button"
                onClick={() => setStatus('draft')}
                className={`px-5 py-1.5 rounded-lg text-[13px] font-semibold transition-all ${
                  status === 'draft'
                    ? 'bg-slate-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Draft
              </button>
              <button
                data-testid="status-coming-soon-btn"
                type="button"
                onClick={() => setStatus('coming_soon')}
                className={`px-5 py-1.5 rounded-lg text-[13px] font-semibold transition-all ${
                  status === 'coming_soon'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Coming Soon
              </button>
            </div>
          </div>

          {/* Free app checkbox */}
          <div className="flex items-start gap-3">
            <input
              id="is-free"
              data-testid="is-free-checkbox"
              type="checkbox"
              checked={isFree}
              onChange={(e) => setIsFree(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-orange-600 focus:ring-orange-400 accent-orange-600 cursor-pointer"
            />
            <div>
              <label htmlFor="is-free" className="text-[13px] font-medium text-slate-700 cursor-pointer">
                Free app
              </label>
              <p className="text-[12px] text-slate-400 mt-0.5">
                Free apps don't deduct credits from users
              </p>
            </div>
          </div>
        </div>

        {/* Toast feedback */}
        {toast && (
          <div className="mt-5">
            <Toast toast={toast} onDismiss={() => setToast(null)} />
          </div>
        )}

        {/* Save button */}
        <div className="mt-6 flex justify-end">
          <button
            data-testid="save-settings-btn"
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="bg-[#FF6B00] hover:bg-[#E55D00] text-white rounded-xl py-2.5 px-6 text-[14px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-[16px] font-bold text-slate-900 mb-4">Quick Links</h2>
        <a
          href={`/creator/apps/${app.id}/deployments`}
          data-testid="deployments-link"
          className="inline-flex items-center gap-2 text-[14px] font-medium text-orange-600 hover:text-orange-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
          </svg>
          View Deployment History
        </a>
      </div>

      {/* Danger Zone */}
      <div
        data-testid="danger-zone"
        className="bg-white rounded-2xl border border-red-200 shadow-sm p-6"
      >
        <h2 className="text-[16px] font-bold text-red-600 mb-1">Danger Zone</h2>
        <p className="text-[13px] text-slate-500 mb-5">
          Deleting an app is permanent and cannot be undone.
        </p>

        <div className="space-y-3">
          <label
            htmlFor="delete-confirm-input"
            className="block text-[13px] font-medium text-slate-700"
          >
            Type <span className="font-mono font-semibold text-slate-900">{app.name}</span> to confirm
          </label>
          <input
            id="delete-confirm-input"
            data-testid="delete-confirm-input"
            type="text"
            value={deleteNameInput}
            onChange={(e) => setDeleteNameInput(e.target.value)}
            className="w-full h-[44px] px-4 rounded-xl border border-slate-200 text-[14px] text-slate-700 placeholder-slate-400 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition-all"
            placeholder={app.name}
          />
          <button
            data-testid="delete-app-btn"
            type="button"
            onClick={handleDelete}
            disabled={!deleteConfirmed || deleting}
            className="bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 px-6 text-[14px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deleting ? 'Deleting…' : 'Delete this app'}
          </button>
        </div>
      </div>
    </div>
  )
}
