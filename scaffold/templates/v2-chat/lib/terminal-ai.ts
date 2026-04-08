/**
 * Terminal AI v2 gateway client.
 * Uses category/tier routing — no model string needed.
 */

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface GenerateOptions {
  system?: string
  maxTokens?: number
  temperature?: number
}

interface GenerateResult {
  content: string
  modelUsed: string
  creditsCharged: number
  latencyMs: number
}

export async function generate(
  token: string,
  messages: Message[],
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const config = getConfig()

  const res = await fetch(`${config.gatewayUrl}/v1/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      category: config.category,
      tier: config.tier,
      messages,
      system: options.system,
      options: {
        max_tokens: options.maxTokens,
        temperature: options.temperature,
      },
    }),
  })

  if (!res.ok) {
    const error = await res.json() as { error: string }
    throw new Error(error.error ?? `Gateway error: ${res.status}`)
  }

  const data = await res.json() as {
    content: string
    model_used: string
    credits_charged: number
    latency_ms: number
  }

  return {
    content: data.content,
    modelUsed: data.model_used,
    creditsCharged: data.credits_charged,
    latencyMs: data.latency_ms,
  }
}

interface AppConfig {
  category: string
  tier: string
  gatewayUrl: string
  appId: string
}

function getConfig(): AppConfig {
  // In a real app, load from terminal-ai.config.json or env vars
  return {
    category: process.env.TERMINAL_AI_CATEGORY ?? 'chat',
    tier: process.env.TERMINAL_AI_TIER ?? 'good',
    gatewayUrl: process.env.TERMINAL_AI_GATEWAY_URL ?? '',
    appId: process.env.TERMINAL_AI_APP_ID ?? '',
  }
}
