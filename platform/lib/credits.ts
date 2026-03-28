import { db } from './db'

// Shared CTE: looks up the most recent ledger balance for a user
const BALANCE_CTE = `WITH current AS (
  SELECT COALESCE(
    (SELECT balance_after FROM subscriptions.credit_ledger
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1),
    0
  ) AS balance
)`

export async function deductCredits(
  userId: string,
  delta: number,
  reason: string,
  appId?: string,
  apiCallId?: string,
): Promise<number> {
  const sql = `${BALANCE_CTE},
    check_balance AS (SELECT balance FROM current WHERE balance >= $2),
    inserted AS (
      INSERT INTO subscriptions.credit_ledger
        (user_id, delta, balance_after, reason, app_id, api_call_id)
      SELECT $1, -$2, balance - $2, $3, $4, $5 FROM check_balance
      RETURNING balance_after
    )
    SELECT balance_after FROM inserted`
  const result = await db.query<{ balance_after: number }>(
    sql,
    [userId, delta, reason, appId ?? null, apiCallId ?? null],
  )
  if (!result.rows[0]) throw new Error('Insufficient credits')
  return result.rows[0].balance_after
}

export async function grantCredits(
  userId: string,
  delta: number,
  reason: string,
): Promise<number> {
  const sql = `${BALANCE_CTE},
    inserted AS (
      INSERT INTO subscriptions.credit_ledger (user_id, delta, balance_after, reason)
      SELECT $1, $2, balance + $2, $3 FROM current
      RETURNING balance_after
    )
    SELECT balance_after FROM inserted`
  const result = await db.query<{ balance_after: number }>(sql, [userId, delta, reason])
  return result.rows[0].balance_after
}

export async function getBalance(userId: string): Promise<number> {
  const result = await db.query<{ balance_after: number }>(
    `SELECT balance_after FROM subscriptions.credit_ledger
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId],
  )
  return result.rows[0]?.balance_after ?? 0
}
