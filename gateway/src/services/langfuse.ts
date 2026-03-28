import { createHash } from 'node:crypto'
interface LangfuseClient {
  trace: (params: Record<string, unknown>) => { id: string }
  flushAsync: () => Promise<void>
}
function langfuseClient(): LangfuseClient {
  const enabled = !!(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY)
  if (!enabled) {
    return {
      trace: () => ({ id: 'noop' }),
      flushAsync: async () => {},
    }
  }
  // Lazy import to avoid startup failure when env vars absent
  const { Langfuse } = require('langfuse') as { Langfuse: new (opts: Record<string, string>) => LangfuseClient }
  return new Langfuse({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
    secretKey: process.env.LANGFUSE_SECRET_KEY!,
    baseUrl: process.env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com',
  })
}
function hashId(id: string): string {
  const salt = process.env.LANGFUSE_HASH_SALT ?? 'default-salt'
  return createHash('sha256').update(id + salt).digest('hex').slice(0, 16)
}
interface TraceParams {
  name: string
  userId: string
  sessionId: string
  appId: string
}
interface Trace {
  id: string
  flush: () => Promise<void>
}
export function createTrace(params: TraceParams): Trace {
  const client = langfuseClient()
  const trace = client.trace({
    name: params.name,
    userId: hashId(params.userId),
    sessionId: hashId(params.sessionId),
    tags: [`app:${params.appId}`],
  })
  return { id: trace.id, flush: () => client.flushAsync() }
}
export async function flushTrace(): Promise<void> {
  await langfuseClient().flushAsync()
}
