'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

const USE_CASE = {
  title: 'Embed a Terminal AI app in your website',
  steps: [
    {
      label: '1. Fetch a channel by slug',
      code: `const res = await fetch('https://terminalai.app/api/creator/channels/my-channel')
const { apps } = await res.json()
// apps = [{ id, name, slug, description }]`,
    },
    {
      label: '2. Get the embed URL for a specific app',
      code: `const appRes = await fetch(\`https://terminalai.app/api/creator/apps/\${apps[0].id}\`)
const app = await appRes.json()
// app = { id, name, embed_url, channel }`,
    },
    {
      label: '3. Embed in your page',
      code: `<iframe
  src={app.embed_url}
  width="100%"
  height="600"
  style={{ border: 'none', borderRadius: '12px' }}
  allow="clipboard-write"
/>`,
    },
  ],
}

type Method = 'GET' | 'POST' | 'DELETE' | 'PATCH'

type Endpoint = {
  method: Method
  path: string
  description: string
  auth: string
  body?: string
  response: string
}

const ENDPOINTS: Endpoint[] = [
  {
    method: 'GET',
    path: '/api/channels',
    description: 'List all public channels',
    auth: 'None',
    response: '{ channels: [{ id, name, slug, description, subscriber_count }] }',
  },
  {
    method: 'GET',
    path: '/api/channels/:slug',
    description: 'Get a single channel by slug',
    auth: 'None',
    response: '{ id, name, slug, description, apps: [...] }',
  },
  {
    method: 'POST',
    path: '/api/channels',
    description: 'Create a new channel (creator only)',
    auth: 'Session cookie (must be logged in)',
    body: '{ name: string, description?: string }',
    response: '{ id, slug }',
  },
  {
    method: 'GET',
    path: '/api/apps',
    description: 'List apps (supports ?channelId=)',
    auth: 'None',
    response: '{ apps: [{ id, name, description, channel_id }] }',
  },
  {
    method: 'GET',
    path: '/api/apps/:id',
    description: 'Get a single app by ID',
    auth: 'None',
    response: '{ id, name, description, embed_url, channel }',
  },
  {
    method: 'GET',
    path: '/api/developer/keys',
    description: 'List your MCP API keys',
    auth: 'Session cookie',
    response: '{ keys: [{ id, name, prefix, created_at, last_used_at }] }',
  },
  {
    method: 'POST',
    path: '/api/developer/keys',
    description: 'Generate a new MCP API key',
    auth: 'Session cookie',
    body: '{ name: string }',
    response: '{ id, token, prefix } — token shown once only',
  },
  {
    method: 'DELETE',
    path: '/api/developer/keys/:id',
    description: 'Revoke an MCP API key',
    auth: 'Session cookie',
    response: '{ revoked: true }',
  },
]

const METHOD_COLORS: Record<Method, string> = {
  GET: 'bg-blue-100 text-blue-700',
  POST: 'bg-green-100 text-green-700',
  DELETE: 'bg-red-100 text-red-700',
  PATCH: 'bg-yellow-100 text-yellow-700',
}

export function ApiReferenceSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [tab, setTab] = useState<'endpoints' | 'usecase'>('usecase')

  function handleToggle(index: number) {
    setOpenIndex(prev => (prev === index ? null : index))
  }

  return (
    <div className="space-y-4" data-testid="api-reference-section">
      <div className="flex gap-2">
        {(['usecase', 'endpoints'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t
                ? 'bg-violet-600 text-white'
                : 'border border-gray-200 bg-white text-gray-600 hover:border-violet-300'
            }`}
          >
            {t === 'usecase' ? 'Use Case' : 'Endpoints'}
          </button>
        ))}
      </div>

      {tab === 'usecase' && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
          <div>
            <p className="text-sm font-semibold text-gray-900">{USE_CASE.title}</p>
            <p className="text-xs text-gray-500 mt-1">
              No API key required — public channels and apps are readable without auth.
            </p>
          </div>
          {USE_CASE.steps.map(step => (
            <div key={step.label} className="space-y-2">
              <p className="text-xs font-medium text-gray-700">{step.label}</p>
              <pre className="overflow-x-auto rounded-lg bg-gray-950 p-4 text-xs text-gray-100">{step.code}</pre>
            </div>
          ))}
        </div>
      )}

      {tab === 'endpoints' && (
      <div
        className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white"
      >
      {ENDPOINTS.map((ep, i) => (
        <div key={`${ep.method}-${ep.path}`}>
          <button
            onClick={() => handleToggle(i)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
            aria-expanded={openIndex === i}
          >
            <span className={`rounded px-2 py-0.5 text-xs font-bold ${METHOD_COLORS[ep.method]}`}>
              {ep.method}
            </span>
            <code className="flex-1 text-xs text-gray-700">{ep.path}</code>
            <span className="text-xs text-gray-400 hidden sm:block">{ep.description}</span>
            {openIndex === i
              ? <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0" />
              : <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
            }
          </button>
          {openIndex === i && (
            <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-2 text-xs" data-testid="endpoint-detail">
              <p>
                <span className="font-semibold text-gray-700">Auth:</span>{' '}
                <span className="text-gray-600">{ep.auth}</span>
              </p>
              {ep.body && (
                <p>
                  <span className="font-semibold text-gray-700">Body:</span>{' '}
                  <code className="text-gray-600">{ep.body}</code>
                </p>
              )}
              <p>
                <span className="font-semibold text-gray-700">Response:</span>{' '}
                <code className="text-gray-600">{ep.response}</code>
              </p>
            </div>
          )}
        </div>
      ))}
      </div>
      )}
    </div>
  )
}
