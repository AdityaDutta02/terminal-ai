export const SUPPORTED_OPS = ['eq','neq','gt','gte','lt','lte','like','ilike','is','in'] as const
export type SupportedOp = typeof SUPPORTED_OPS[number]

export interface ParsedFilter {
  column: string
  op: SupportedOp
  value: string | null | string[]
}

export class PostgRestParseError extends Error {
  constructor(
    public readonly operator: string,
    public readonly column: string,
  ) {
    super(
      `Unsupported PostgREST operator "${operator}" on column "${column}". ` +
      `Supported operators: ${SUPPORTED_OPS.join(', ')}`
    )
    this.name = 'PostgRestParseError'
  }
}

// Params that control query shape, not row filtering
const NON_FILTER_PARAMS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict'])

export function parseFilters(queryParams: Record<string, string>): ParsedFilter[] {
  const filters: ParsedFilter[] = []

  for (const [column, raw] of Object.entries(queryParams)) {
    if (NON_FILTER_PARAMS.has(column)) continue

    const dotIndex = raw.indexOf('.')
    if (dotIndex === -1) continue

    const op = raw.slice(0, dotIndex)
    const rawValue = raw.slice(dotIndex + 1)

    if (!(SUPPORTED_OPS as readonly string[]).includes(op)) {
      throw new PostgRestParseError(op, column)
    }

    const typedOp = op as SupportedOp

    let value: string | null | string[]
    if (typedOp === 'is') {
      value = rawValue === 'null' ? null : rawValue
    } else if (typedOp === 'in') {
      // in.(a,b,c) → ['a','b','c']
      const inner = rawValue.replace(/^\(|\)$/g, '')
      value = inner.split(',').map((s) => s.trim())
    } else {
      value = rawValue
    }

    filters.push({ column, op: typedOp, value })
  }

  return filters
}

export function buildWhereClause(
  filters: ParsedFilter[],
  startIndex = 1,
): { clause: string; params: unknown[] } {
  if (filters.length === 0) return { clause: '', params: [] }

  const parts: string[] = []
  const params: unknown[] = []
  let idx = startIndex

  for (const { column, op, value } of filters) {
    const col = `"${column}"`

    if (op === 'is') {
      if (value === null) {
        parts.push(`${col} IS NULL`)
      } else {
        parts.push(`${col} IS NOT NULL`)
      }
    } else if (op === 'in') {
      parts.push(`${col} = ANY($${idx++})`)
      params.push(value)
    } else if (op === 'neq') {
      parts.push(`${col} != $${idx++}`)
      params.push(value)
    } else if (op === 'gt') {
      parts.push(`${col} > $${idx++}`)
      params.push(value)
    } else if (op === 'gte') {
      parts.push(`${col} >= $${idx++}`)
      params.push(value)
    } else if (op === 'lt') {
      parts.push(`${col} < $${idx++}`)
      params.push(value)
    } else if (op === 'lte') {
      parts.push(`${col} <= $${idx++}`)
      params.push(value)
    } else if (op === 'like') {
      parts.push(`${col} LIKE $${idx++}`)
      params.push(value)
    } else if (op === 'ilike') {
      parts.push(`${col} ILIKE $${idx++}`)
      params.push(value)
    } else {
      // eq
      parts.push(`${col} = $${idx++}`)
      params.push(value)
    }
  }

  return { clause: parts.join(' AND '), params }
}
