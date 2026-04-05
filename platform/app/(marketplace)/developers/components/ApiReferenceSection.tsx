'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

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
    path: '/api/search?q=',
    description: 'Search apps by keyword',
    auth: 'None',
    response: '{ hits: [{ id, name, description, channel }], estimatedTotalHits }',
  },
  {
    method: 'GET',
    path: '/api/creator/channels',
    description: 'List your channels',
    auth: 'Session cookie',
    response: '{ channels: [{ id, name, slug }] }',
  },
  {
    method: 'POST',
    path: '/api/creator/channels',
    description: 'Create a channel',
    auth: 'Session cookie (creator role)',
    body: '{ name: string, slug: string, description?: string }',
    response: '{ slug }',
  },
  {
    method: 'PATCH',
    path: '/api/creator/channels/:slug',
    description: 'Update channel metadata',
    auth: 'Session cookie (owner)',
    body: '{ name?: string, description?: string }',
    response: '{ ok: true }',
  },
  {
    method: 'POST',
    path: '/api/creator/channels/:slug/apps',
    description: 'Add an iframe app to a channel',
    auth: 'Session cookie (owner)',
    body: '{ name, slug, iframeUrl, description?, creditsPerSession? }',
    response: '{ ok: true }',
  },
  {
    method: 'POST',
    path: '/api/creator/apps',
    description: 'Deploy a GitHub repo as an app - queues build',
    auth: 'Session cookie',
    body: '{ name, githubRepo, channelId, branch?, description? }',
    response: '202 { appId, deploymentId, subdomain }',
  },
  {
    method: 'PATCH',
    path: '/api/creator/apps/:id',
    description: 'Update app name or description',
    auth: 'Session cookie (owner)',
    body: '{ name?: string, description?: string }',
    response: '{ ok: true }',
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
    response: '{ id, token, prefix } - token shown once only',
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

  function handleToggle(index: number) {
    setOpenIndex(prev => (prev === index ? null : index))
  }

  return (
    <div
      className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white"
      data-testid="api-reference-section"
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
  )
}
