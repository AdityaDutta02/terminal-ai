interface ScaffoldInput {
  framework: 'nextjs' | 'python' | 'streamlit' | 'static'
  app_name: string
  description: string
  category: string
  uses_ai: boolean
  uses_file_upload: boolean
  generates_artifacts: boolean
  /** v2 API category — defaults to 'chat' */
  api_category?: 'chat' | 'coding' | 'image' | 'web_search' | 'web_scrape'
  /** v2 API tier — defaults to 'good' */
  api_tier?: 'fast' | 'good' | 'quality'
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
// The embed token is received from the viewer shell via postMessage.
// It identifies the APP (not the user) — all users share the same DB and storage.
// sent by the client to your API route, and used here as the Bearer token.
import config from './validate-config'

const GATEWAY_URL = process.env.TERMINAL_AI_GATEWAY_URL!

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, options)
    if (res.status !== 429) return res
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '0', 10)
    const delayMs = retryAfter > 0 ? retryAfter * 1000 : Math.pow(2, attempt + 1) * 1000
    await new Promise<void>((r) => setTimeout(r, delayMs))
  }
  throw new Error('Gateway is busy. Please try again in a moment.')
}

interface GenerateResponse {
  id: string
  content: string
  model_used: string
  usage: { input_tokens: number; output_tokens: number }
  credits_charged: number
}

// Use category+tier for automatic model routing (recommended):
//   callGateway(messages, token)
//   callGateway(messages, token, { category: 'web_search', tier: 'good' })
// Use a direct model name for specific model selection:
//   callGateway(messages, token, { model: 'openai/gpt-4o-search-preview' })
// See list_supported_providers for available models and categories.
export async function callGateway(
  messages: { role: string; content: string }[],
  embedToken: string,
  options?: { category?: string; tier?: string; model?: string; system?: string },
): Promise<GenerateResponse> {
  if (!embedToken) throw new Error('Missing embed token')
  const routing = options?.model
    ? { model: options.model }
    : { category: options?.category ?? config.category, tier: options?.tier ?? config.tier }
  const res = await fetchWithRetry(\`\${GATEWAY_URL}/v1/generate\`, {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${embedToken}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...routing,
      messages,
      ...(options?.system ? { system: options.system } : {}),
    }),
  })
  if (res.status === 401) {
    throw Object.assign(
      new Error('Session expired. The viewer will deliver a fresh token automatically — retry your request in a moment.'),
      { code: 'TOKEN_EXPIRED', retryable: true },
    )
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as Record<string, string>
    throw new Error(\`Gateway error (\${res.status}): \${err.error ?? res.statusText}\`)
  }
  return res.json() as Promise<GenerateResponse>
}`

const DB_MIGRATIONS_TEMPLATE = `-- db-migrations.sql
-- This file runs once at deploy time against your app's isolated Postgres schema.
-- Do not use schema-qualified names — the schema is set automatically.
-- PostgreSQL 16: gen_random_uuid() and JSONB are available out of the box.

CREATE TABLE IF NOT EXISTS items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data       JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`

const DB_SDK = `// lib/db.ts — Terminal AI Database SDK (server-side only)
// Calls /db/* on the Terminal AI gateway using the embed token.
// IMPORTANT: The database is scoped per-APP, not per-user. All users of this app
// share the same tables. The embed token identifies the app for schema routing.
// If you need per-user data isolation, add a user_id column and filter on it.

const GATEWAY_URL = process.env.TERMINAL_AI_GATEWAY_URL!

async function dbRequest(method: string, path: string, body?: unknown, embedToken: string = ''): Promise<Response> {
  const res = await fetch(\`\${GATEWAY_URL}/db/\${path}\`, {
    method,
    headers: { Authorization: \`Bearer \${embedToken}\`, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error((err as { error: string }).error ?? \`DB error \${res.status}\`)
  }
  return res
}

export async function dbList<T = Record<string, unknown>>(table: string, filters: Record<string, string> = {}, embedToken: string): Promise<T[]> {
  const params = new URLSearchParams(filters)
  const res = await dbRequest('GET', \`\${table}?\${params}\`, undefined, embedToken)
  return res.json() as Promise<T[]>
}

export async function dbGet<T = Record<string, unknown>>(table: string, id: string, embedToken: string): Promise<T> {
  const res = await dbRequest('GET', \`\${table}/\${id}\`, undefined, embedToken)
  return res.json() as Promise<T>
}

export async function dbInsert<T = Record<string, unknown>>(table: string, row: Record<string, unknown>, embedToken: string): Promise<T> {
  const res = await dbRequest('POST', table, row, embedToken)
  return res.json() as Promise<T>
}

export async function dbUpdate<T = Record<string, unknown>>(table: string, id: string, patch: Record<string, unknown>, embedToken: string): Promise<T> {
  const res = await dbRequest('PATCH', \`\${table}/\${id}\`, patch, embedToken)
  return res.json() as Promise<T>
}

export async function dbDelete(table: string, id: string, embedToken: string): Promise<void> {
  await dbRequest('DELETE', \`\${table}/\${id}\`, undefined, embedToken)
}
`

const STORAGE_SDK = `// lib/storage.ts — Terminal AI Storage SDK (server-side only)
// Calls /storage/* on the Terminal AI gateway using the embed token.

const GATEWAY_URL = process.env.TERMINAL_AI_GATEWAY_URL!

export async function storageUpload(key: string, buffer: Buffer, contentType: string, embedToken: string): Promise<{ key: string }> {
  const res = await fetch(\`\${GATEWAY_URL}/storage/\${key}\`, {
    method: 'PUT',
    headers: { Authorization: \`Bearer \${embedToken}\`, 'Content-Type': contentType },
    body: buffer,
  })
  if (!res.ok) throw new Error(\`Storage upload failed: \${res.status}\`)
  return res.json() as Promise<{ key: string }>
}

export async function storageGet(key: string, embedToken: string): Promise<Response> {
  const res = await fetch(\`\${GATEWAY_URL}/storage/\${key}\`, {
    headers: { Authorization: \`Bearer \${embedToken}\` },
  })
  if (!res.ok) throw new Error(\`Storage get failed: \${res.status}\`)
  return res
}

export async function storageList(embedToken: string): Promise<Array<{ key: string; size: number; lastModified: string }>> {
  const res = await fetch(\`\${GATEWAY_URL}/storage\`, {
    headers: { Authorization: \`Bearer \${embedToken}\` },
  })
  if (!res.ok) throw new Error(\`Storage list failed: \${res.status}\`)
  return res.json() as Promise<Array<{ key: string; size: number; lastModified: string }>>
}

export async function storageDelete(key: string, embedToken: string): Promise<void> {
  const res = await fetch(\`\${GATEWAY_URL}/storage/\${key}\`, {
    method: 'DELETE',
    headers: { Authorization: \`Bearer \${embedToken}\` },
  })
  if (!res.ok) throw new Error(\`Storage delete failed: \${res.status}\`)
}
`

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

  const result = await callGateway(
    [{ role: 'user', content: prompt }],
    embedToken,
  )

  return NextResponse.json({ content: result.content })
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

const REQUIRED_KEYS = ['app_name', 'framework', 'health_check_path', 'category', 'tier'] as const

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
  // Always inject DB and storage SDKs — every app has access to these
  files['lib/db.ts'] = DB_SDK
  files['lib/storage.ts'] = STORAGE_SDK
  files['db-migrations.sql'] = DB_MIGRATIONS_TEMPLATE
  files['lib/email-sdk.ts'] = `const GATEWAY = process.env.TERMINAL_AI_GATEWAY_URL!;

/** Send an email to the authenticated user. The gateway resolves the recipient
 *  email from the embed token — apps never see the user's email address. */
export async function sendEmail(
  subject: string,
  html: string,
  embedToken: string,
): Promise<{ sent: boolean; messageId: string }> {
  const res = await fetch(\`\${GATEWAY}/email/send\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: \`Bearer \${embedToken}\`,
    },
    body: JSON.stringify({ subject, html }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(\`Email send failed (\${res.status}): \${(err as Record<string, string>).error ?? res.statusText}\`);
  }
  return res.json();
}
`
  files['lib/task-sdk.ts'] = `const GATEWAY = process.env.TERMINAL_AI_GATEWAY_URL!;

interface CreateTaskParams {
  name: string;
  schedule: string;
  callbackPath: string;
  payload?: Record<string, unknown>;
  timezone?: string;
}

export async function createTask(
  params: CreateTaskParams,
  embedToken: string,
): Promise<{ id: string; nextRunAt: string }> {
  const res = await fetch(\`\${GATEWAY}/tasks\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: \`Bearer \${embedToken}\`,
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(\`Task creation failed (\${res.status}): \${(err as Record<string, string>).error ?? res.statusText}\`);
  }
  return res.json();
}

export async function listTasks(
  embedToken: string,
): Promise<Array<{ id: string; name: string; schedule: string; enabled: boolean; nextRunAt: string | null }>> {
  const res = await fetch(\`\${GATEWAY}/tasks\`, {
    headers: { Authorization: \`Bearer \${embedToken}\` },
  });
  if (!res.ok) throw new Error(\`Task list failed: \${res.status}\`);
  return res.json();
}

export async function deleteTask(
  taskId: string,
  embedToken: string,
): Promise<{ deleted: boolean }> {
  const res = await fetch(\`\${GATEWAY}/tasks/\${taskId}\`, {
    method: 'DELETE',
    headers: { Authorization: \`Bearer \${embedToken}\` },
  });
  if (!res.ok) throw new Error(\`Task delete failed: \${res.status}\`);
  return res.json();
}
`
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
    gateway_version: '2',
    health_check_path: isPython(input.framework) ? '/health' : '/api/health',
    port: isPython(input.framework) ? 8000 : 3000,
    requires_file_upload: input.uses_file_upload,
    generates_artifacts: input.generates_artifacts,
    model_tier: 'standard',
    category: input.api_category ?? 'chat',
    tier: input.api_tier ?? 'good',
  }
  const frameworkFiles = input.framework === 'nextjs' ? buildNextjsFiles(input) : buildPythonFiles(input)
  const files: Record<string, string> = {
    'terminal-ai.config.json': JSON.stringify(config, null, 2),
    ...frameworkFiles,
  }
  return {
    files,
    instructions: '1. Clone this scaffold\n2. Add your logic\n3. Edit db-migrations.sql to define your tables\n4. Ensure next.config.js has output: "standalone"\n5. Push to GitHub\n6. Deploy via Terminal AI: use create_channel then deploy_app',
    required_env_vars: ['TERMINAL_AI_GATEWAY_URL', 'TERMINAL_AI_APP_ID'],
    notes: [
      'CRITICAL: Use the useEmbedToken() hook in your root client component to receive the auth token from the Terminal AI viewer shell via postMessage',
      'Pass the embed token from the client to your API routes, which forward it as Bearer token to the gateway',
      'Do NOT call OpenAI/Anthropic directly — all AI calls go through TERMINAL_AI_GATEWAY_URL',
      'Your app has an isolated Postgres schema (per-app, NOT per-user) — all users of your app share the same tables. The embed token identifies the app, not the user. If you need per-user data, add a user_id column and filter manually. Edit db-migrations.sql to define your tables before first deploy.',
      'Your app has an isolated storage prefix — use lib/storage.ts helpers to upload, download, list, and delete files via the gateway',
      'Health endpoint is required and must return 200',
      'Never store the embed token in localStorage or cookies',
      'The token expires after 15 minutes — the viewer shell auto-refreshes it via postMessage',
      'Use lib/email-sdk.ts to send emails to the authenticated user — the gateway resolves the email from the token, apps never see user emails',
      'Use lib/task-sdk.ts to register cron schedules — the gateway will POST to your callback path on schedule',
      'Task callbacks receive a short-lived token in the Authorization header — use it for AI and email calls',
    ],
  }
}
