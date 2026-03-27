import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 10,
})

export const db = {
  query: async <T = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<T>> => pool.query<T>(text, values),
}
