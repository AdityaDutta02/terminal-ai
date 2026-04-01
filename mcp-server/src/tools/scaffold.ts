interface ScaffoldInput {
  framework: 'nextjs' | 'python' | 'streamlit' | 'static'
  app_name: string
  description: string
  category: string
  uses_ai: boolean
  uses_file_upload: boolean
  generates_artifacts: boolean
}
interface ScaffoldOutput {
  files: Record<string, string>
  instructions: string
  required_env_vars: string[]
  notes: string[]
}
function isPython(framework: string): boolean {
  return framework === 'python' || framework === 'streamlit'
}
const GATEWAY_SDK = `// Terminal AI Gateway SDK — server-side only
// The embed token is received from the viewer shell via postMessage,
// sent by the client to your API route, and used here as the Bearer token.
import config from './validate-config'

const GATEWAY_URL = process.env.TERMINAL_AI_GATEWAY_URL!

export async function callGateway(
  messages: { role: string; content: string }[],
  embedToken: string,
): Promise<Response> {
  if (!embedToken) throw new Error('Missing embed token')
  const res = await fetch(\`\${GATEWAY_URL}/v1/chat/completions\`, {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${embedToken}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: config.model_tier, messages, stream: true }),
  })
  if (res.status === 401) {
    throw Object.assign(new Error('Session expired. The viewer will deliver a fresh token automatically — retry your request in a moment.'), { code: 'TOKEN_EXPIRED', retryable: true })
  }
  return res
}

export async function* streamChat(
  messages: { role: string; content: string }[],
  embedToken: string,
) {
  const res = await callGateway(messages, embedToken)
  if (!res.ok) throw new Error(\`Gateway error: \${res.status}\`)
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    yield decoder.decode(value)
  }
}`

// Client-side hook that listens for the embed token from the Terminal AI viewer shell.
// The viewer shell sends the token via postMessage after the iframe loads.
// This hook MUST be used in the root layout or page component.
const USE_EMBED_TOKEN_HOOK = `'use client'
import { useState, useEffect } from 'react'

/**
 * Listens for the embed token delivered by the Terminal AI viewer shell
 * via window.postMessage. The token is used to authenticate API calls
 * to the Terminal AI gateway.
 *
 * Usage:
 *   const embedToken = useEmbedToken()
 *   // Pass embedToken to your API routes; they forward it to the gateway
 */
export function useEmbedToken(): string | null {
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'TERMINAL_AI_TOKEN' && typeof event.data.token === 'string') {
        setToken(event.data.token)
      }
    }
    window.addEventListener('message', handleMessage)

    // Signal to the viewer shell that this app is ready to receive the token.
    // Handles the race condition where the app loads after the initial delivery.
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'TERMINAL_AI_READY' }, '*')
    }

    return () => window.removeEventListener('message', handleMessage)
  }, [])

  return token
}`

// Example API route that receives the embed token from the client and calls the gateway
const EXAMPLE_API_ROUTE = `import { NextRequest, NextResponse } from 'next/server'
import { callGateway } from '@/lib/terminal-ai'

export async function POST(request: NextRequest) {
  const body = await request.json() as { prompt?: string; embedToken?: string }
  const { prompt, embedToken } = body

  if (!embedToken) {
    return NextResponse.json({ error: 'Missing embed token' }, { status: 401 })
  }
  if (!prompt) {
    return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })
  }

  const res = await callGateway(
    [{ role: 'user', content: prompt }],
    embedToken,
  )

  // Stream the response back to the client
  return new Response(res.body, {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}
`
const NEXTJS_DOCKERFILE = `FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM base AS builder
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"
CMD ["node", "server.js"]
`

function buildNextjsFiles(input: ScaffoldInput): Record<string, string> {
  const files: Record<string, string> = {}
  files['app/api/health/route.ts'] = `import { NextResponse } from 'next/server'\nexport async function GET() {\n  return NextResponse.json({ ok: true })\n}`
  files['.env.example'] = `TERMINAL_AI_GATEWAY_URL=\nTERMINAL_AI_APP_ID=`
  files['next.config.js'] = `/** @type {import('next').NextConfig} */\nconst nextConfig = {\n  output: 'standalone',\n}\nmodule.exports = nextConfig\n`
  files['Dockerfile'] = NEXTJS_DOCKERFILE
  // Always include the embed token hook — every app needs it to receive auth from the viewer
  files['hooks/use-embed-token.ts'] = USE_EMBED_TOKEN_HOOK
  files['lib/validate-config.ts'] = `// Validates terminal-ai.config.json at import time
import config from '../terminal-ai.config.json' assert { type: 'json' }

const REQUIRED_KEYS = ['app_name', 'framework', 'health_check_path', 'model_tier'] as const

for (const key of REQUIRED_KEYS) {
  if (!config[key as keyof typeof config]) {
    throw new Error(\`terminal-ai.config.json is missing required key: "\${key}"\`)
  }
}

export default config
`
  if (input.uses_ai) {
    files['lib/terminal-ai.ts'] = GATEWAY_SDK
    files['app/api/ai/route.ts'] = EXAMPLE_API_ROUTE
  }
  return files
}
function buildPythonFiles(input: ScaffoldInput): Record<string, string> {
  const files: Record<string, string> = {}
  if (input.framework === 'streamlit') {
    files['app.py'] = `import streamlit as st\nimport os\n\nst.title("${input.app_name}")\n`
    files['requirements.txt'] = 'streamlit>=1.32\nhttpx>=0.27\n'
  } else {
    files['app.py'] = `from fastapi import FastAPI\nimport os\nimport json\nimport sys\n\n_config_path = os.path.join(os.path.dirname(__file__), 'terminal-ai.config.json')\nif os.path.exists(_config_path):\n    with open(_config_path) as f:\n        _config = json.load(f)\n    for key in ('app_name', 'framework', 'health_check_path', 'model_tier'):\n        if not _config.get(key):\n            sys.exit(f'terminal-ai.config.json missing required key: "{key}"')\n\napp = FastAPI()\n\n@app.get("/health")\ndef health():\n    return {"ok": True}\n`
    files['requirements.txt'] = 'fastapi>=0.110\nuvicorn>=0.29\nhttpx>=0.27\n'
  }
  files['.env.example'] = `TERMINAL_AI_GATEWAY_URL=\nTERMINAL_AI_APP_ID=`
  return files
}
export function scaffoldApp(input: ScaffoldInput): ScaffoldOutput {
  const config = {
    app_name: input.app_name,
    framework: input.framework,
    gateway_version: '1',
    health_check_path: isPython(input.framework) ? '/health' : '/api/health',
    port: isPython(input.framework) ? 8000 : 3000,
    requires_file_upload: input.uses_file_upload,
    generates_artifacts: input.generates_artifacts,
    model_tier: 'standard',
  }
  const frameworkFiles = input.framework === 'nextjs' ? buildNextjsFiles(input) : buildPythonFiles(input)
  const files: Record<string, string> = {
    'terminal-ai.config.json': JSON.stringify(config, null, 2),
    ...frameworkFiles,
  }
  return {
    files,
    instructions: '1. Clone this scaffold\n2. Add your logic\n3. Ensure next.config.js has output: "standalone"\n4. Push to GitHub\n5. Deploy via Terminal AI: use create_channel then deploy_app',
    required_env_vars: ['TERMINAL_AI_GATEWAY_URL', 'TERMINAL_AI_APP_ID'],
    notes: [
      'CRITICAL: Use the useEmbedToken() hook in your root client component to receive the auth token from the Terminal AI viewer shell via postMessage',
      'Pass the embed token from the client to your API routes, which forward it as Bearer token to the gateway',
      'Do NOT call OpenAI/Anthropic directly — all AI calls go through TERMINAL_AI_GATEWAY_URL',
      'Health endpoint is required and must return 200',
      'Never store the embed token in localStorage or cookies',
      'The token expires after 15 minutes — the viewer shell auto-refreshes it via postMessage',
    ],
  }
}
