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
const GATEWAY_SDK = `// Terminal AI Gateway SDK
const GATEWAY_URL = process.env.TERMINAL_AI_GATEWAY_URL!
export async function* streamChat(
  messages: { role: string; content: string }[],
  embedToken: string
) {
  const res = await fetch(\`\${GATEWAY_URL}/proxy\`, {
    method: 'POST',
    headers: { Authorization: \`Bearer \${embedToken}\`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'openrouter', model: 'claude-3-5-haiku', messages, stream: true }),
  })
  if (!res.ok) throw new Error(\`Gateway error: \${res.status}\`)
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    yield decoder.decode(value)
  }
}`
function buildNextjsFiles(input: ScaffoldInput): Record<string, string> {
  const files: Record<string, string> = {}
  files['app/api/health/route.ts'] = `import { NextResponse } from 'next/server'\nexport async function GET() {\n  return NextResponse.json({ ok: true })\n}`
  files['.env.example'] = `TERMINAL_AI_GATEWAY_URL=\nTERMINAL_AI_APP_ID=`
  if (input.uses_ai) {
    files['lib/terminal-ai.ts'] = GATEWAY_SDK
  }
  return files
}
function buildPythonFiles(input: ScaffoldInput): Record<string, string> {
  const files: Record<string, string> = {}
  if (input.framework === 'streamlit') {
    files['app.py'] = `import streamlit as st\nimport os\n\nst.title("${input.app_name}")\n`
    files['requirements.txt'] = 'streamlit>=1.32\nhttpx>=0.27\n'
  } else {
    files['app.py'] = `from fastapi import FastAPI\nimport os\n\napp = FastAPI()\n\n@app.get("/health")\ndef health():\n    return {"ok": True}\n`
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
    min_credits_per_session: 10,
  }
  const frameworkFiles = input.framework === 'nextjs' ? buildNextjsFiles(input) : buildPythonFiles(input)
  const files: Record<string, string> = {
    'terminal-ai.config.json': JSON.stringify(config, null, 2),
    ...frameworkFiles,
  }
  return {
    files,
    instructions: '1. Clone this scaffold\n2. Add your logic\n3. Push to GitHub\n4. Deploy via Terminal AI dashboard',
    required_env_vars: ['TERMINAL_AI_GATEWAY_URL', 'TERMINAL_AI_APP_ID'],
    notes: [
      'Do NOT call OpenAI/Anthropic directly — all AI calls go through TERMINAL_AI_GATEWAY_URL',
      'Health endpoint is required and must return 200',
      'Never store the embed token in localStorage or cookies',
    ],
  }
}
