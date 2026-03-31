import { Pool, PoolClient } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 10,
})

export const db = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(text: string, params?: unknown[]) =>
    pool.query<T>(text, params),
}

export type TxClient = Pick<PoolClient, 'query'>

export async function withTransaction<T>(fn: (client: TxClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
