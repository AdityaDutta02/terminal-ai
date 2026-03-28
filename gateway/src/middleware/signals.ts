import type { Pool } from 'pg'
interface SignalParams {
  db: Pool
  userId: string
  appId: string
  sessionId: string
  apiCallId: string
  responseTimeMs: number
  inputTokens: number
  outputTokens: number
  model: string
  provider: string
  userSignal?: 'thumbs_up' | 'thumbs_down' | 'inline_correction' | 'none'
}
export async function collectSignal(params: SignalParams): Promise<void> {
  await params.db.query(
    `INSERT INTO optimizer.behavioral_signals
      (user_id, app_id, session_id, api_call_id, response_time_ms,
       input_tokens, output_tokens, model, provider, user_signal)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      params.userId,
      params.appId,
      params.sessionId,
      params.apiCallId,
      params.responseTimeMs,
      params.inputTokens,
      params.outputTokens,
      params.model,
      params.provider,
      params.userSignal ?? 'none',
    ]
  )
}
