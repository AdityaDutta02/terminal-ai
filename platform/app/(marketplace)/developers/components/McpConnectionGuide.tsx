'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Copy } from 'lucide-react'

type Editor = 'claude-code' | 'cursor' | 'windsurf' | 'continue'

const EDITOR_CONFIGS: Record<Editor, { label: string; config: string; path: string }> = {
  'claude-code': {
    label: 'Claude Code',
    path: 'Run in terminal:',
    config: `claude mcp add --transport sse terminal-ai https://terminalai.app/mcp`,
  },
  cursor: {
    label: 'Cursor',
    path: '~/.cursor/mcp.json',
    config: JSON.stringify({
      mcpServers: {
        'terminal-ai': {
          transport: 'sse',
          url: 'https://terminalai.app/mcp',
          headers: { Authorization: 'Bearer YOUR_API_KEY' },
        },
      },
    }, null, 2),
  },
  windsurf: {
    label: 'Windsurf',
    path: '~/.codeium/windsurf/mcp_config.json',
    config: JSON.stringify({
      mcpServers: {
        'terminal-ai': {
          transport: 'sse',
          url: 'https://terminalai.app/mcp',
          headers: { Authorization: 'Bearer YOUR_API_KEY' },
        },
      },
    }, null, 2),
  },
  continue: {
    label: 'Continue.dev',
    path: '~/.continue/config.json (mcpServers section)',
    config: JSON.stringify({
      name: 'terminal-ai',
      transport: { type: 'sse', url: 'https://terminalai.app/mcp' },
      headers: { Authorization: 'Bearer YOUR_API_KEY' },
    }, null, 2),
  },
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative rounded-lg bg-gray-950 p-4" data-testid="code-block">
      <button
        onClick={handleCopy}
        className="absolute right-3 top-3 text-gray-500 hover:text-gray-200"
        aria-label="Copy code"
      >
        <Copy className="h-4 w-4" />
      </button>
      {copied && <span className="absolute right-10 top-3 text-xs text-green-400">Copied!</span>}
      <pre className="overflow-x-auto text-sm text-gray-100">{code}</pre>
    </div>
  )
}

function StepCard({
  number,
  title,
  body,
  defaultOpen = false,
}: {
  number: string
  title: string
  body: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden" data-testid="step-card">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-gray-50"
        aria-expanded={open}
      >
        <span className="text-xs font-bold text-violet-500">{number}</span>
        <span className="flex-1 text-sm font-semibold text-gray-900">{title}</span>
        {open
          ? <ChevronUp className="h-4 w-4 text-gray-400" />
          : <ChevronDown className="h-4 w-4 text-gray-400" />
        }
      </button>
      {open && (
        <div className="border-t border-gray-100 px-5 py-4 text-sm text-gray-600">
          {typeof body === 'string' ? <p>{body}</p> : body}
        </div>
      )}
    </div>
  )
}

export function McpConnectionGuide() {
  const [editor, setEditor] = useState<Editor>('claude-code')

  return (
    <div className="space-y-4" data-testid="mcp-connection-guide">
      <StepCard
        number="01"
        title="Generate an API key"
        defaultOpen
        body="Scroll up to the API Keys section and click Generate Key. Copy the key — it is only shown once."
      />
      <StepCard
        number="02"
        title="Add the MCP server to your editor"
        body={
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(EDITOR_CONFIGS) as Editor[]).map(e => (
                <button
                  key={e}
                  onClick={() => setEditor(e)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    editor === e
                      ? 'bg-violet-600 text-white'
                      : 'border border-gray-200 bg-white text-gray-600 hover:border-violet-300'
                  }`}
                >
                  {EDITOR_CONFIGS[e].label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500">{EDITOR_CONFIGS[editor].path}</p>
            <CodeBlock code={EDITOR_CONFIGS[editor].config.replace('YOUR_API_KEY', '<your-api-key>')} />
            <p className="text-xs text-gray-500">
              Replace <code className="rounded bg-gray-100 px-1">{'<your-api-key>'}</code> with the key you copied in step 1.
            </p>
          </div>
        }
      />
      <StepCard
        number="03"
        title="Reload your editor"
        body="Restart your editor or reload the MCP servers list. You should see terminal-ai appear with 5 available tools."
      />
      <StepCard
        number="04"
        title="Build and deploy your first app"
        body={
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Open a new chat and paste this prompt:</p>
            <CodeBlock code={`Use the terminal-ai MCP to scaffold a Next.js app called "my-app" with a simple landing page. Then create a channel called "My Apps" and deploy the app to it. Commit everything to GitHub and trigger the deployment. Let me know the URL when it's live.`} />
            <p className="text-xs text-gray-500">
              The AI will call scaffold_app → create_channel → deploy_app automatically. No manual steps needed.
            </p>
          </div>
        }
      />
    </div>
  )
}
