// gateway/src/lib/openrouter.ts

interface OpenRouterMessage {
  role: string
  content: string
}

interface OpenRouterResponse {
  content: string
  usage: { prompt_tokens: number; completion_tokens: number }
}

export async function callOpenRouter(
  model: string,
  messages: OpenRouterMessage[],
  system?: string,
  options?: { max_tokens?: number; temperature?: number }
): Promise<OpenRouterResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set')

  const body: Record<string, unknown> = {
    model,
    messages: system
      ? [{ role: 'system', content: system }, ...messages]
      : messages,
    max_tokens: options?.max_tokens ?? 2048,
    temperature: options?.temperature ?? 0.7,
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://terminalai.app',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenRouter error: ${res.status} ${text}`)
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>
    usage: { prompt_tokens: number; completion_tokens: number }
  }

  return {
    content: data.choices[0]?.message?.content ?? '',
    usage: data.usage,
  }
}
