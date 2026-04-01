'use client'

import { useState } from 'react'
import { SidebarNav } from '@/components/sidebar-nav'
import { ApiKeyManager } from './components/ApiKeyManager'
import { McpConnectionGuide } from './components/McpConnectionGuide'
import { ApiReferenceSection } from './components/ApiReferenceSection'
import { Copy, ChevronDown } from 'lucide-react'

const creatorTabs = [
  { id: 'dashboard', label: 'Dashboard', icon: 'BarChart3', href: '/creator' },
  { id: 'channels', label: 'Channels', icon: 'Layers', href: '/creator' },
  { id: 'developer', label: 'Developer API', icon: 'Cpu', href: '/developers' },
]

const TAB_IDS = ['getting-started', 'api-keys', 'mcp-setup', 'api-reference'] as const
type TabId = typeof TAB_IDS[number]

const TAB_LABELS: Record<TabId, string> = {
  'getting-started': 'Getting Started',
  'api-keys': 'API Keys',
  'mcp-setup': 'MCP Setup',
  'api-reference': 'API Reference',
}

const GETTING_STARTED_STEPS = [
  {
    number: '01',
    title: 'Create an API Key',
    description: 'Generate a key in the API Keys tab. Each key is hashed on our side and shown only once.',
  },
  {
    number: '02',
    title: 'Connect your editor',
    description: 'Add the MCP server config to Claude Code, Cursor, Windsurf, or any MCP-compatible editor.',
  },
  {
    number: '03',
    title: 'Scaffold your first app',
    description: 'Ask your editor to scaffold a Next.js app using Terminal AI tools. It handles the rest.',
  },
  {
    number: '04',
    title: 'Deploy and share',
    description: 'Deploy to your channel with a single prompt. Get a live URL in seconds.',
  },
]

const MCP_SERVER_CONFIG = `Transport    Streamable HTTP
Endpoint     http://178.104.124.224:3003/mcp
Auth         Bearer <your-api-key>
Tools        scaffold_app, create_channel, deploy_app,
             get_deployment_status, list_supported_providers`

function copyToClipboard(text: string): void {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => {
      /* clipboard unavailable */
    })
    return
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
}

export default function DevelopersPage() {
  const [activeTab, setActiveTab] = useState<TabId>('getting-started')
  const [copied, setCopied] = useState(false)

  function handleCopyConfig(): void {
    copyToClipboard(MCP_SERVER_CONFIG)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex gap-8">
        <SidebarNav title="Creator Studio" tabs={creatorTabs} />

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="mb-8">
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-[12px] font-semibold text-blue-700 mb-3">
              Developer API
            </span>
            <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight">
              Build apps with your AI editor
            </h1>
            <p className="text-[14px] text-slate-400 mt-1 max-w-xl">
              Connect Claude, Cursor, or any MCP-compatible editor to Terminal AI. Scaffold, publish, and deploy apps from a single prompt.
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-0 border-b border-slate-200 mb-8">
            {TAB_IDS.map((tabId) => (
              <button
                key={tabId}
                onClick={() => setActiveTab(tabId)}
                className={`px-4 py-3 text-[14px] font-medium transition-colors relative ${
                  activeTab === tabId
                    ? 'text-orange-700'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {TAB_LABELS[tabId]}
                {activeTab === tabId && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600 rounded-t" />
                )}
              </button>
            ))}
          </div>

          {/* Getting Started Tab */}
          {activeTab === 'getting-started' && (
            <div className="space-y-4">
              {GETTING_STARTED_STEPS.map((step) => (
                <div
                  key={step.number}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-start gap-4"
                >
                  <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-[14px] font-bold text-orange-700">{step.number}</span>
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-slate-900">{step.title}</h3>
                    <p className="text-[13px] text-slate-400 mt-1">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* API Keys Tab */}
          {activeTab === 'api-keys' && (
            <div>
              <p className="text-[14px] text-slate-400 mb-6">
                Generate keys to authenticate your MCP client. Each key is hashed and cannot be recovered after creation.
              </p>
              <ApiKeyManager />
            </div>
          )}

          {/* MCP Setup Tab */}
          {activeTab === 'mcp-setup' && (
            <div>
              <p className="text-[14px] text-slate-400 mb-6">
                Add the MCP server to your editor. See the Getting Started tab for step-by-step instructions.
              </p>
              <div className="bg-slate-900 rounded-2xl p-6 relative">
                <button
                  onClick={handleCopyConfig}
                  className="absolute top-4 right-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 text-[12px] font-medium text-white hover:bg-orange-700 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <pre className="font-mono text-[13px] text-slate-100 leading-relaxed whitespace-pre">
                  {MCP_SERVER_CONFIG}
                </pre>
              </div>
              <div className="mt-8">
                <h3 className="text-[15px] font-semibold text-slate-900 mb-4">Editor-specific setup</h3>
                <McpConnectionGuide />
              </div>
            </div>
          )}

          {/* API Reference Tab */}
          {activeTab === 'api-reference' && (
            <div>
              <p className="text-[14px] text-slate-400 mb-6">
                REST endpoints available on the platform.
              </p>
              <ApiReferenceSection />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
