'use client'

import { useState, useEffect, useCallback } from 'react'
import { Pencil, Trash2, Check, X, Plus, AlertTriangle } from 'lucide-react'

interface EnvVar {
  key: string
  value: string
}

type RowEditState = {
  editing: false
} | {
  editing: true
  draft: string
}

type DeleteConfirmState = {
  confirming: false
} | {
  confirming: true
}

interface RowState {
  editState: RowEditState
  deleteState: DeleteConfirmState
  saving: boolean
  deleting: boolean
  error: string | null
}

const KEY_REGEX = /^[A-Z_][A-Z0-9_]*$/

const FORBIDDEN_KEYS = new Set([
  'TERMINAL_AI_GATEWAY_URL',
  'TERMINAL_AI_APP_ID',
  'APP_DB_SCHEMA',
  'TERMINAL_AI_STORAGE_PREFIX',
])

function validateKey(key: string): string | null {
  if (!KEY_REGEX.test(key)) {
    return 'Key must be uppercase letters, numbers, and underscores only'
  }
  if (FORBIDDEN_KEYS.has(key)) {
    return 'This key is reserved and cannot be set'
  }
  return null
}

function sanitizeKeyInput(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9_]/g, '')
}

function SkeletonRow() {
  return (
    <tr className="border-b border-slate-100">
      <td className="py-3 px-4">
        <div className="h-4 w-32 bg-slate-100 rounded animate-pulse" />
      </td>
      <td className="py-3 px-4">
        <div className="h-4 w-48 bg-slate-100 rounded animate-pulse" />
      </td>
      <td className="py-3 px-4">
        <div className="h-4 w-16 bg-slate-100 rounded animate-pulse" />
      </td>
    </tr>
  )
}

export default function EnvVarsSection({ appId }: { appId: string }) {
  const [vars, setVars] = useState<EnvVar[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({})
  const [showRedeployBanner, setShowRedeployBanner] = useState(false)

  // Add variable form state
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const getRowState = useCallback(
    (key: string): RowState =>
      rowStates[key] ?? {
        editState: { editing: false },
        deleteState: { confirming: false },
        saving: false,
        deleting: false,
        error: null,
      },
    [rowStates],
  )

  const setRowState = useCallback((key: string, patch: Partial<RowState>) => {
    setRowStates((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? {
        editState: { editing: false },
        deleteState: { confirming: false },
        saving: false,
        deleting: false,
        error: null,
      }), ...patch },
    }))
  }, [])

  const fetchVars = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch(`/api/creator/apps/${appId}/env-vars`)
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setFetchError(body.error ?? 'Failed to load environment variables')
        return
      }
      const data = (await res.json()) as { vars: EnvVar[] }
      setVars(data.vars.slice(0, 50))
    } catch {
      setFetchError('Network error. Please refresh.')
    } finally {
      setLoading(false)
    }
  }, [appId])

  useEffect(() => {
    void fetchVars()
  }, [fetchVars])

  async function handleSaveEdit(key: string) {
    const state = getRowState(key)
    if (!state.editState.editing) return
    const newVal = state.editState.draft

    setRowState(key, { saving: true, error: null })
    try {
      const res = await fetch(`/api/creator/apps/${appId}/env-vars`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: newVal }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setRowState(key, {
          saving: false,
          error: body.error ?? 'Failed to save',
        })
        return
      }
      setVars((prev) =>
        prev.map((v) => (v.key === key ? { key, value: newVal } : v)),
      )
      setRowState(key, {
        saving: false,
        editState: { editing: false },
        error: null,
      })
      setShowRedeployBanner(true)
    } catch {
      setRowState(key, { saving: false, error: 'Network error. Please try again.' })
    }
  }

  async function handleDelete(key: string) {
    // Optimistic remove
    setVars((prev) => prev.filter((v) => v.key !== key))
    setRowState(key, { deleting: true, error: null })

    try {
      const res = await fetch(
        `/api/creator/apps/${appId}/env-vars/${encodeURIComponent(key)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        // Restore the var
        void fetchVars()
        setRowState(key, {
          deleting: false,
          deleteState: { confirming: false },
          error: body.error ?? 'Failed to delete',
        })
        return
      }
      setRowStates((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      setShowRedeployBanner(true)
    } catch {
      void fetchVars()
      setRowState(key, {
        deleting: false,
        deleteState: { confirming: false },
        error: 'Network error. Please try again.',
      })
    }
  }

  async function handleAdd() {
    setAddError(null)
    const trimmedKey = newKey.trim()
    const keyError = validateKey(trimmedKey)
    if (keyError) {
      setAddError(keyError)
      return
    }
    if (vars.length >= 50) {
      setAddError('Maximum 50 variables reached')
      return
    }
    if (vars.some((v) => v.key === trimmedKey)) {
      setAddError('A variable with this key already exists')
      return
    }

    setAdding(true)
    try {
      const res = await fetch(`/api/creator/apps/${appId}/env-vars`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: trimmedKey, value: newValue }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        const status = res.status
        if (status === 429) {
          setAddError('Maximum 50 variables reached')
        } else if (status === 400) {
          setAddError(body.error ?? 'Key must be uppercase letters, numbers, and underscores only')
        } else {
          setAddError(body.error ?? 'Failed to add variable')
        }
        return
      }
      setVars((prev) => [...prev, { key: trimmedKey, value: newValue }])
      setNewKey('')
      setNewValue('')
      setShowRedeployBanner(true)
    } catch {
      setAddError('Network error. Please try again.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div
      data-testid="env-vars-section"
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6"
    >
      <h2 className="text-[16px] font-bold text-slate-900 mb-5">
        Environment Variables
      </h2>

      {/* Redeploy banner */}
      {showRedeployBanner && (
        <div
          data-testid="redeploy-banner"
          className="bg-amber-50 border border-amber-200 text-amber-800 text-[13px] rounded-xl px-4 py-3 mb-5 flex items-center justify-between"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            Environment variables updated. Redeploy this app for changes to take effect.
          </span>
          <button
            onClick={() => setShowRedeployBanner(false)}
            aria-label="Dismiss banner"
            className="ml-4 text-amber-700 hover:text-amber-900 transition-colors shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Fetch error */}
      {fetchError && (
        <div
          data-testid="fetch-error"
          className="bg-red-50 border border-red-200 text-red-700 text-[13px] rounded-xl px-4 py-3 mb-5"
        >
          {fetchError}
        </div>
      )}

      {/* Variables table */}
      <div className="overflow-x-auto mb-6">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="py-2 px-4 text-[12px] font-semibold text-slate-500 uppercase tracking-wide w-[40%]">
                Key
              </th>
              <th className="py-2 px-4 text-[12px] font-semibold text-slate-500 uppercase tracking-wide">
                Value
              </th>
              <th className="py-2 px-4 text-[12px] font-semibold text-slate-500 uppercase tracking-wide w-[120px]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : vars.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="py-8 px-4 text-center text-[13px] italic text-slate-400"
                  data-testid="empty-state"
                >
                  No environment variables set. Add your first variable below.
                </td>
              </tr>
            ) : (
              vars.map((envVar) => {
                const state = getRowState(envVar.key)
                const { editState, deleteState, saving, deleting, error } = state

                return (
                  <tr
                    key={envVar.key}
                    data-testid={`env-row-${envVar.key}`}
                    className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors"
                  >
                    {/* Key */}
                    <td className="py-3 px-4">
                      <span className="font-mono text-[13px] text-slate-800">
                        {envVar.key}
                      </span>
                    </td>

                    {/* Value */}
                    <td className="py-3 px-4">
                      {editState.editing ? (
                        <input
                          data-testid={`value-input-${envVar.key}`}
                          type="text"
                          value={editState.draft}
                          onChange={(e) =>
                            setRowState(envVar.key, {
                              editState: { editing: true, draft: e.target.value },
                            })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleSaveEdit(envVar.key)
                            if (e.key === 'Escape')
                              setRowState(envVar.key, {
                                editState: { editing: false },
                                error: null,
                              })
                          }}
                          autoFocus
                          className="w-full h-[36px] px-3 rounded-lg border border-slate-200 font-mono text-[13px] text-slate-700 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all bg-white"
                          disabled={saving}
                        />
                      ) : (
                        <span className="font-mono text-[13px] text-slate-600 bg-slate-50 px-2 py-1 rounded-lg">
                          {envVar.value || <span className="italic text-slate-400">empty</span>}
                        </span>
                      )}

                      {/* Inline row error */}
                      {error && (
                        <p
                          data-testid={`row-error-${envVar.key}`}
                          className="text-[12px] text-red-600 mt-1"
                        >
                          {error}
                        </p>
                      )}

                      {/* Delete confirm */}
                      {deleteState.confirming && !editState.editing && (
                        <div
                          data-testid={`delete-confirm-${envVar.key}`}
                          className="mt-2 flex items-center gap-2"
                        >
                          <span className="text-[12px] text-slate-600">Are you sure?</span>
                          <button
                            onClick={() => void handleDelete(envVar.key)}
                            disabled={deleting}
                            className="text-[12px] font-semibold text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
                          >
                            {deleting ? 'Deleting…' : 'Yes, delete'}
                          </button>
                          <button
                            onClick={() =>
                              setRowState(envVar.key, {
                                deleteState: { confirming: false },
                              })
                            }
                            disabled={deleting}
                            className="text-[12px] font-semibold text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {editState.editing ? (
                          <>
                            <button
                              data-testid={`save-btn-${envVar.key}`}
                              onClick={() => void handleSaveEdit(envVar.key)}
                              disabled={saving}
                              aria-label="Save value"
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                            >
                              <Check className="w-4 h-4" aria-hidden="true" />
                            </button>
                            <button
                              data-testid={`cancel-btn-${envVar.key}`}
                              onClick={() =>
                                setRowState(envVar.key, {
                                  editState: { editing: false },
                                  error: null,
                                })
                              }
                              disabled={saving}
                              aria-label="Cancel edit"
                              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-50"
                            >
                              <X className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              data-testid={`edit-btn-${envVar.key}`}
                              onClick={() =>
                                setRowState(envVar.key, {
                                  editState: { editing: true, draft: envVar.value },
                                  deleteState: { confirming: false },
                                  error: null,
                                })
                              }
                              aria-label={`Edit ${envVar.key}`}
                              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                            >
                              <Pencil className="w-4 h-4" aria-hidden="true" />
                            </button>
                            <button
                              data-testid={`delete-btn-${envVar.key}`}
                              onClick={() =>
                                setRowState(envVar.key, {
                                  deleteState: { confirming: true },
                                  editState: { editing: false },
                                  error: null,
                                })
                              }
                              aria-label={`Delete ${envVar.key}`}
                              className="p-1.5 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add variable */}
      <div data-testid="add-var-form">
        <p className="text-[13px] font-medium text-slate-700 mb-3">Add variable</p>
        <div className="flex gap-3 items-start">
          <div className="flex-1">
            <input
              data-testid="new-key-input"
              type="text"
              value={newKey}
              onChange={(e) => {
                setNewKey(sanitizeKeyInput(e.target.value))
                setAddError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAdd()
              }}
              placeholder="KEY_NAME"
              maxLength={100}
              className="w-full h-[44px] px-4 rounded-xl border border-slate-200 font-mono text-[14px] text-slate-700 placeholder-slate-400 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all"
              disabled={adding}
              aria-label="New variable key"
            />
          </div>
          <div className="flex-1">
            <input
              data-testid="new-value-input"
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAdd()
              }}
              placeholder="value"
              className="w-full h-[44px] px-4 rounded-xl border border-slate-200 text-[14px] text-slate-700 placeholder-slate-400 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all"
              disabled={adding}
              aria-label="New variable value"
            />
          </div>
          <button
            data-testid="add-var-btn"
            type="button"
            onClick={() => void handleAdd()}
            disabled={adding || !newKey.trim()}
            className="bg-[#FF6B00] hover:bg-[#E55D00] text-white rounded-xl py-2.5 px-5 text-[14px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 h-[44px] shrink-0"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>

        {addError && (
          <p
            data-testid="add-error"
            className="text-[12px] text-red-600 mt-2"
          >
            {addError}
          </p>
        )}
      </div>
    </div>
  )
}
