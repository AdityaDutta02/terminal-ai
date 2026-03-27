import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 10,
})

export const db = {
  query: <T = unknown>(text: string, params?: unknown[]) =>
    pool.query<T>(text, params),
}
