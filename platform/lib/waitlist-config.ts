import { db } from './db'

let cached: { value: boolean; expiresAt: number } | null = null
const TTL_MS = 30_000

export async function isWaitlistMode(): Promise<boolean> {
  const now = Date.now()
  if (cached && now < cached.expiresAt) return cached.value

  try {
    const result = await db.query<{ value: string }>(
      `SELECT value FROM platform.config WHERE key = 'waitlist_mode' LIMIT 1`,
    )
    const value = result.rows[0]?.value !== 'false'
    cached = { value, expiresAt: now + TTL_MS }
    return value
  } catch {
    // On DB error, default to waitlist mode (safe fallback)
    return true
  }
}

export function invalidateWaitlistCache(): void {
  cached = null
}
