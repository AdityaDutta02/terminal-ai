import { describe, it, expect } from 'vitest'
import { parseFilters, buildWhereClause, PostgRestParseError, SUPPORTED_OPS } from './postgrest-parser'

describe('parseFilters', () => {
  it('parses eq filter', () => {
    const result = parseFilters({ status: 'eq.active' })
    expect(result).toEqual([{ column: 'status', op: 'eq', value: 'active' }])
  })

  it('parses in filter as array', () => {
    const result = parseFilters({ id: 'in.(1,2,3)' })
    expect(result).toEqual([{ column: 'id', op: 'in', value: ['1', '2', '3'] }])
  })

  it('parses is.null', () => {
    const result = parseFilters({ deleted_at: 'is.null' })
    expect(result).toEqual([{ column: 'deleted_at', op: 'is', value: null }])
  })

  it('parses multiple filters', () => {
    const result = parseFilters({ status: 'eq.active', age: 'gt.18' })
    expect(result).toHaveLength(2)
  })

  it('throws PostgRestParseError on unsupported operator', () => {
    expect(() => parseFilters({ x: 'contains.foo' })).toThrow(PostgRestParseError)
  })

  it('ignores select, order, limit, offset params', () => {
    const result = parseFilters({ select: '*', order: 'id.asc', limit: '10', offset: '0', status: 'eq.x' })
    expect(result).toEqual([{ column: 'status', op: 'eq', value: 'x' }])
  })
})

describe('buildWhereClause', () => {
  it('builds single eq clause', () => {
    const filters = parseFilters({ status: 'eq.active' })
    const { clause, params } = buildWhereClause(filters)
    expect(clause).toBe('"status" = $1')
    expect(params).toEqual(['active'])
  })

  it('builds in clause', () => {
    const filters = parseFilters({ id: 'in.(1,2,3)' })
    const { clause, params } = buildWhereClause(filters)
    expect(clause).toBe('"id" = ANY($1)')
    expect(params).toEqual([['1','2','3']])
  })

  it('builds is null clause', () => {
    const filters = parseFilters({ deleted_at: 'is.null' })
    const { clause, params } = buildWhereClause(filters)
    expect(clause).toBe('"deleted_at" IS NULL')
    expect(params).toEqual([])
  })

  it('returns empty string with no filters', () => {
    const { clause, params } = buildWhereClause([])
    expect(clause).toBe('')
    expect(params).toEqual([])
  })

  it('respects startIndex offset', () => {
    const filters = parseFilters({ status: 'eq.active' })
    const { clause, params } = buildWhereClause(filters, 3)
    expect(clause).toBe('"status" = $3')
    expect(params).toEqual(['active'])
  })
})
