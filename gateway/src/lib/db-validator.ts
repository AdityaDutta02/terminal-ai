import { db } from '../db.js'

export class ValidationError extends Error {
  constructor(public status: 400 | 404, message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export function assertIdentifier(value: string, label: string): void {
  if (!IDENTIFIER_RE.test(value)) {
    throw new ValidationError(400, `Invalid ${label}: '${value}'`)
  }
}

export function toSchemaName(appId: string): string {
  return `app_data_${appId.replaceAll('-', '_')}`
}

export async function validateTable(schema: string, table: string): Promise<void> {
  assertIdentifier(table, 'table name')
  const { rows } = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = $1 AND table_name = $2`,
    [schema, table],
  )
  if (rows.length === 0) throw new ValidationError(404, `Table '${table}' not found`)
}

export async function validateColumns(schema: string, table: string, columns: string[]): Promise<void> {
  if (columns.length === 0) return
  for (const col of columns) assertIdentifier(col, 'column')
  const { rows } = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2`,
    [schema, table],
  )
  const valid = new Set(rows.map((r) => r.column_name))
  for (const col of columns) {
    if (!valid.has(col)) throw new ValidationError(400, `Unknown column: '${col}'`)
  }
}
