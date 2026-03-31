import { db, type TxClient } from './db'

// Shared CTE: reads most recent ledger balance, falls back to user.credits for accounts with no ledger entries
const BALANCE_CTE = `WITH current AS (
  SELECT COALESCE(
    (SELECT balance_after FROM subscriptions.credit_ledger
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1),
    (SELECT credits FROM public."user" WHERE id = $1),
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
  client?: TxClient,
): Promise<number> {
  const sql = `${BALANCE_CTE},
    inserted AS (
      INSERT INTO subscriptions.credit_ledger (user_id, delta, balance_after, reason)
      SELECT $1, $2, balance + $2, $3 FROM current
      RETURNING balance_after
    )
    SELECT balance_after FROM inserted`
  const queryFn = client ?? db
  const result = await queryFn.query<{ balance_after: number }>(sql, [userId, delta, reason])
  if (!result.rows[0]) throw new Error(`grantCredits: no ledger row inserted for user ${userId}`)
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
