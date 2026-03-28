interface Provider {
  provider: string
  model: string
  credits: number
  unit: string
  note: string
}
function haiku(): Provider {
  return { provider: 'openrouter', model: 'claude-3-5-haiku', credits: 1, unit: 'per_1k_tokens', note: 'fast responses' }
}
function sonnet(): Provider {
  return { provider: 'openrouter', model: 'claude-3-5-sonnet', credits: 3, unit: 'per_1k_tokens', note: 'complex tasks' }
}
function gptMini(): Provider {
  return { provider: 'openrouter', model: 'gpt-4o-mini', credits: 1, unit: 'per_1k_tokens', note: 'cost-effective chat' }
}
function serper(): Provider {
  return { provider: 'serper', model: 'search', credits: 2, unit: 'per_call', note: 'real-time web search' }
}
export function getProvidersJson(): string {
  const parts = [JSON.stringify(haiku()), JSON.stringify(sonnet()), JSON.stringify(gptMini()), JSON.stringify(serper())]
  return '[' + parts.join(',') + ']'
}
