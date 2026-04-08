import { describe, it, expect, vi, beforeEach } from 'vitest'
import { assertIdentifier, validateTable, validateColumns, toSchemaName, ValidationError } from './db-validator.js'

vi.mock('../db.js', () => ({
  db: {
    query: vi.fn(),
  },
}))

import { db } from '../db.js'
const mockDb = vi.mocked(db)

beforeEach(() => vi.clearAllMocks())

describe('toSchemaName', () => {
  it('replaces hyphens with underscores', () => {
    expect(toSchemaName('550e8400-e29b-41d4-a716-446655440000'))
      .toBe('app_data_550e8400_e29b_41d4_a716_446655440000')
  })
})

describe('assertIdentifier', () => {
  it('accepts valid identifiers', () => {
    expect(() => assertIdentifier('items', 'table')).not.toThrow()
    expect(() => assertIdentifier('my_table_1', 'table')).not.toThrow()
  })
  it('rejects identifiers with special characters', () => {
    expect(() => assertIdentifier("'; DROP TABLE items; --", 'table'))
      .toThrow(ValidationError)
    expect(() => assertIdentifier('public.users', 'table')).toThrow(ValidationError)
    expect(() => assertIdentifier('', 'table')).toThrow(ValidationError)
  })
})

describe('validateTable', () => {
  it('resolves when table exists', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ table_name: 'items' }] } as never)
    await expect(validateTable('app_data_abc', 'items')).resolves.toBeUndefined()
  })
  it('throws ValidationError 404 when table not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] } as never)
    await expect(validateTable('app_data_abc', 'missing')).rejects.toMatchObject({
      status: 404,
      message: "Table 'missing' not found",
    })
  })
})

describe('validateColumns', () => {
  it('resolves when all columns are valid', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ column_name: 'id' }, { column_name: 'name' }] } as never)
    await expect(validateColumns('app_data_abc', 'items', ['id', 'name'])).resolves.toBeUndefined()
  })
  it('throws ValidationError 400 for unknown column', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ column_name: 'id' }] } as never)
    await expect(validateColumns('app_data_abc', 'items', ['id', 'evil'])).rejects.toMatchObject({
      status: 400,
      message: "Unknown column: 'evil'",
    })
  })
  it('resolves immediately for empty column list', async () => {
    await expect(validateColumns('app_data_abc', 'items', [])).resolves.toBeUndefined()
    expect(mockDb.query).not.toHaveBeenCalled()
  })
})
