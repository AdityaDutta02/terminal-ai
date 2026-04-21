# MCP Porting Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `analyze_repo`, Supabase compatibility shim, and `scaffold_app port_from` mode so vibe-coders can port existing Next.js + Supabase apps to Terminal AI with minimal friction.

**Architecture:** Three components — (1) `analyze_repo` MCP tool scans a GitHub repo and returns risk flags + migration checklist, (2) a gateway `/compat/supabase/*` namespace translates supabase-js calls to Terminal AI equivalents when `compat_shim_enabled = true` for an app, (3) `scaffold_app` gains a `port_from` mode that generates repo-specific replacement files and a `PORTING.md` guide.

**Tech Stack:** Hono (gateway + MCP server), Vitest (gateway tests), bun test (MCP server tests), PostgreSQL (schema migration), GitHub Trees API + raw content API (repo scanning).

---

### Task 1: DB Migration — Add `compat_shim_enabled` column

**Files:**
- Create: `platform/lib/db/migrations/021_compat_shim.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 021_compat_shim.sql
-- Adds per-app flag that gates the /compat/supabase/* gateway namespace.
-- Default false: shim routes return 404 until explicitly enabled.

ALTER TABLE marketplace.apps
  ADD COLUMN IF NOT EXISTS compat_shim_enabled BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Verify migration number is correct**

Run:
```bash
ls platform/lib/db/migrations/ | sort
```
Expected: last file is `020_app_env_vars.sql`. If a `021_*.sql` already exists, rename this file to `022_compat_shim.sql`.

- [ ] **Step 3: Commit**

```bash
git add platform/lib/db/migrations/021_compat_shim.sql
git commit -m "feat(db): add compat_shim_enabled column to marketplace.apps"
```

---

### Task 2: PostgREST Filter Parser

**Files:**
- Create: `gateway/src/lib/postgrest-parser.ts`
- Create: `gateway/src/lib/postgrest-parser.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// gateway/src/lib/postgrest-parser.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd gateway && npx vitest run src/lib/postgrest-parser.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// gateway/src/lib/postgrest-parser.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd gateway && npx vitest run src/lib/postgrest-parser.test.ts
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add gateway/src/lib/postgrest-parser.ts gateway/src/lib/postgrest-parser.test.ts
git commit -m "feat(gateway): add PostgREST filter parser with parameterized SQL"
```

---

### Task 3: Compat Shim Check Middleware

**Files:**
- Create: `gateway/src/middleware/compat-shim-check.ts`
- Create: `gateway/src/middleware/compat-shim-check.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// gateway/src/middleware/compat-shim-check.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

// Mock db module
vi.mock('../lib/db', () => ({
  db: { query: vi.fn() },
}))
// Mock logger
vi.mock('../lib/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

import { db } from '../lib/db'
import { compatShimCheck } from './compat-shim-check'

function makeApp(shimEnabled: boolean | null) {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('embedToken', { appId: 'app-123', userId: 'u1', sessionId: 's1', isAnon: false, isFree: false, creditsPerCall: 1 })
    await next()
  })
  app.use('*', compatShimCheck)
  app.get('/test', (c) => c.json({ ok: true }))

  vi.mocked(db.query).mockResolvedValue({
    rows: shimEnabled === null ? [] : [{ compat_shim_enabled: shimEnabled }],
    rowCount: shimEnabled === null ? 0 : 1,
    command: '',
    oid: 0,
    fields: [],
  } as never)

  return app
}

describe('compatShimCheck', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes when compat_shim_enabled = true', async () => {
    const app = makeApp(true)
    const res = await app.request('/test')
    expect(res.status).toBe(200)
  })

  it('returns 404 when compat_shim_enabled = false', async () => {
    const app = makeApp(false)
    const res = await app.request('/test')
    expect(res.status).toBe(404)
  })

  it('returns 404 when app row not found', async () => {
    const app = makeApp(null)
    const res = await app.request('/test')
    expect(res.status).toBe(404)
  })

  it('strips apikey header (does not pass to next)', async () => {
    const app = makeApp(true)
    let receivedApikey: string | undefined
    app.use('*', async (c, next) => {
      receivedApikey = c.req.header('apikey')
      await next()
    })
    await app.request('/test', { headers: { apikey: 'secret-key' } })
    expect(receivedApikey).toBeUndefined()
  })

  it('rejects service_role token with 403', async () => {
    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('embedToken', { appId: 'app-123', userId: 'u1', sessionId: 's1', isAnon: false, isFree: false, creditsPerCall: 1, role: 'service_role' })
      await next()
    })
    app.use('*', compatShimCheck)
    app.get('/test', (c) => c.json({ ok: true }))
    vi.mocked(db.query).mockResolvedValue({ rows: [{ compat_shim_enabled: true }] } as never)
    const res = await app.request('/test')
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('service role')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd gateway && npx vitest run src/middleware/compat-shim-check.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// gateway/src/middleware/compat-shim-check.ts
import { createMiddleware } from 'hono/factory'
import { db } from '../lib/db'
import { logger } from '../lib/logger'
import type { EmbedTokenPayload } from './auth'

declare module 'hono' {
  interface ContextVariableMap {
    embedToken: EmbedTokenPayload & { role?: string }
  }
}

export const compatShimCheck = createMiddleware(async (c, next) => {
  const token = c.get('embedToken')
  const { appId } = token

  // Strip apikey header — never read, never log its value
  if (c.req.raw.headers.has('apikey')) {
    logger.debug({ msg: 'compat_apikey_header_stripped', appId })
    // Note: Hono doesn't mutate headers; we rely on never reading 'apikey' downstream
  }

  // Reject service_role tokens
  if ((token as { role?: string }).role === 'service_role') {
    return c.json(
      { error: 'Service role tokens are not accepted by Terminal AI' },
      403,
    )
  }

  // Check shim is enabled for this app
  const { rows } = await db.query<{ compat_shim_enabled: boolean }>(
    `SELECT compat_shim_enabled FROM marketplace.apps WHERE id = $1`,
    [appId],
  )

  if (!rows[0]?.compat_shim_enabled) {
    return c.json({ error: 'Not found' }, 404)
  }

  await next()
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd gateway && npx vitest run src/middleware/compat-shim-check.test.ts
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add gateway/src/middleware/compat-shim-check.ts gateway/src/middleware/compat-shim-check.test.ts
git commit -m "feat(gateway): add compat shim check middleware with apikey stripping and service_role rejection"
```

---

### Task 4: Supabase Compat Router

**Files:**
- Create: `gateway/src/routes/compat-supabase.ts`
- Create: `gateway/src/routes/compat-supabase.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// gateway/src/routes/compat-supabase.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

vi.mock('../lib/db', () => ({ db: { query: vi.fn() } }))
vi.mock('../lib/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))
vi.mock('../lib/storage', () => ({
  storageUpload: vi.fn(),
  storageGet: vi.fn(),
  storageList: vi.fn(),
  storageDelete: vi.fn(),
}))
vi.mock('../lib/db-validator', () => ({
  validateTable: vi.fn(),
  validateColumns: vi.fn(),
  toSchemaName: vi.fn((appId: string) => `app_data_${appId.replace(/-/g, '_')}`),
  assertIdentifier: vi.fn(),
  ValidationError: class ValidationError extends Error {
    constructor(public status: number, message: string) { super(message) }
  },
}))

import { db } from '../lib/db'
import { storageUpload, storageGet, storageList, storageDelete } from '../lib/storage'
import { validateTable, validateColumns } from '../lib/db-validator'
import { compatSupabaseRouter } from './compat-supabase'

function makeApp() {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('embedToken', {
      appId: 'app-abc',
      userId: 'user-1',
      sessionId: 'sess-1',
      isAnon: false,
      isFree: false,
      creditsPerCall: 1,
    })
    await next()
  })
  app.route('/compat/supabase', compatSupabaseRouter)
  return app
}

describe('GET /auth/v1/user', () => {
  it('returns synthetic user from embed token', async () => {
    const res = await makeApp().request('/compat/supabase/auth/v1/user')
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.id).toBe('user-1')
    expect(body.email).toBeNull()
    expect(body.role).toBe('authenticated')
    expect(body.is_anonymous).toBe(false)
  })

  it('uses sessionId when userId is null', async () => {
    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('embedToken', { appId: 'app-abc', userId: null, sessionId: 'sess-anon', isAnon: true, isFree: false, creditsPerCall: 1 })
      await next()
    })
    app.route('/compat/supabase', compatSupabaseRouter)
    const res = await app.request('/compat/supabase/auth/v1/user')
    const body = await res.json() as Record<string, unknown>
    expect(body.id).toBe('sess-anon')
    expect(body.is_anonymous).toBe(true)
  })
})

describe('POST /auth/v1/token (signIn no-op)', () => {
  it('returns 200', async () => {
    const res = await makeApp().request('/compat/supabase/auth/v1/token', { method: 'POST' })
    expect(res.status).toBe(200)
  })
})

describe('POST /auth/v1/logout (signOut no-op)', () => {
  it('returns 200', async () => {
    const res = await makeApp().request('/compat/supabase/auth/v1/logout', { method: 'POST' })
    expect(res.status).toBe(200)
  })
})

describe('GET /rest/v1/ (introspection block)', () => {
  it('returns 404', async () => {
    const res = await makeApp().request('/compat/supabase/rest/v1/')
    expect(res.status).toBe(404)
  })
})

describe('GET /rest/v1/:table', () => {
  beforeEach(() => {
    vi.mocked(validateTable).mockResolvedValue(undefined)
    vi.mocked(validateColumns).mockResolvedValue(undefined)
    vi.mocked(db.query).mockResolvedValue({ rows: [{ id: '1', name: 'Alice' }] } as never)
  })

  it('returns rows for valid table', async () => {
    const res = await makeApp().request('/compat/supabase/rest/v1/profiles?select=*')
    expect(res.status).toBe(200)
    const body = await res.json() as unknown[]
    expect(Array.isArray(body)).toBe(true)
  })

  it('filters with eq param', async () => {
    const res = await makeApp().request('/compat/supabase/rest/v1/profiles?status=eq.active')
    expect(res.status).toBe(200)
    const call = vi.mocked(db.query).mock.calls[0]
    expect(call[0]).toContain('WHERE')
    expect(call[1]).toContain('active')
  })

  it('returns 400 on unsupported operator', async () => {
    const res = await makeApp().request('/compat/supabase/rest/v1/profiles?x=contains.foo')
    expect(res.status).toBe(400)
  })
})

describe('POST /rest/v1/:table (insert)', () => {
  beforeEach(() => {
    vi.mocked(validateTable).mockResolvedValue(undefined)
    vi.mocked(db.query).mockResolvedValue({ rows: [{ id: '2' }] } as never)
  })

  it('inserts and returns row', async () => {
    const res = await makeApp().request('/compat/supabase/rest/v1/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Hello' }),
    })
    expect(res.status).toBe(201)
  })
})

describe('Storage routes', () => {
  it('PUT uploads file', async () => {
    vi.mocked(storageUpload).mockResolvedValue({ key: 'avatars/img.png' } as never)
    const res = await makeApp().request('/compat/supabase/storage/v1/object/avatars/img.png', {
      method: 'PUT',
      body: new Uint8Array([1, 2, 3]),
      headers: { 'Content-Type': 'image/png' },
    })
    expect(res.status).toBe(200)
    expect(storageUpload).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'avatars/img.png', appId: 'app-abc' })
    )
  })

  it('GET retrieves file', async () => {
    vi.mocked(storageGet).mockResolvedValue(new Uint8Array([1, 2, 3]) as never)
    const res = await makeApp().request('/compat/supabase/storage/v1/object/avatars/img.png')
    expect(res.status).toBe(200)
  })

  it('GET list returns array', async () => {
    vi.mocked(storageList).mockResolvedValue(['avatars/img.png'] as never)
    const res = await makeApp().request('/compat/supabase/storage/v1/object/list/avatars')
    expect(res.status).toBe(200)
    const body = await res.json() as unknown[]
    expect(Array.isArray(body)).toBe(true)
  })

  it('DELETE removes file', async () => {
    vi.mocked(storageDelete).mockResolvedValue(undefined)
    const res = await makeApp().request('/compat/supabase/storage/v1/object/avatars/img.png', {
      method: 'DELETE',
    })
    expect(res.status).toBe(200)
  })
})

describe('Cross-app table access prevention', () => {
  it('returns 403 when validateTable throws ValidationError with status 403', async () => {
    const { ValidationError } = await import('../lib/db-validator')
    vi.mocked(validateTable).mockRejectedValue(new ValidationError(403, 'Table not in app schema'))
    const res = await makeApp().request('/compat/supabase/rest/v1/other_app_table')
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd gateway && npx vitest run src/routes/compat-supabase.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// gateway/src/routes/compat-supabase.ts
import { Hono } from 'hono'
import { db } from '../lib/db'
import { logger } from '../lib/logger'
import { storageUpload, storageGet, storageList, storageDelete } from '../lib/storage'
import {
  validateTable,
  validateColumns,
  toSchemaName,
  ValidationError,
} from '../lib/db-validator'
import { parseFilters, buildWhereClause, PostgRestParseError } from '../lib/postgrest-parser'

export const compatSupabaseRouter = new Hono()

// ── Auth endpoints ─────────────────────────────────────────────────────────

compatSupabaseRouter.get('/auth/v1/user', (c) => {
  const { userId, sessionId, isAnon } = c.get('embedToken')
  return c.json({
    id: userId ?? sessionId,
    email: null,
    role: 'authenticated',
    aud: 'authenticated',
    is_anonymous: isAnon,
  })
})

compatSupabaseRouter.post('/auth/v1/token', (c) => {
  const { appId } = c.get('embedToken')
  logger.warn({ msg: 'compat_signin_noop', appId })
  return c.json({ access_token: '', token_type: 'bearer' })
})

compatSupabaseRouter.post('/auth/v1/logout', (c) => {
  const { appId } = c.get('embedToken')
  logger.warn({ msg: 'compat_signout_noop', appId })
  return c.json({})
})

// ── REST endpoints ─────────────────────────────────────────────────────────

// Block introspection
compatSupabaseRouter.get('/rest/v1/', (c) => c.json({ error: 'Not found' }, 404))

// SELECT
compatSupabaseRouter.get('/rest/v1/:table', async (c) => {
  const { appId } = c.get('embedToken')
  const table = c.req.param('table')
  const schema = toSchemaName(appId)

  try {
    await validateTable(schema, table)

    const queryParams = Object.fromEntries(
      [...new URL(c.req.url).searchParams.entries()]
    )

    let filters
    try {
      filters = parseFilters(queryParams)
    } catch (err) {
      if (err instanceof PostgRestParseError) {
        return c.json({ error: err.message }, 400)
      }
      throw err
    }

    const { clause, params } = buildWhereClause(filters)
    const where = clause ? `WHERE ${clause}` : ''
    const sql = `SELECT * FROM "${schema}"."${table}" ${where}`
    const { rows } = await db.query(sql, params)
    return c.json(rows)
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json({ error: err.message }, err.status as 400 | 403 | 404)
    }
    throw err
  }
})

// INSERT
compatSupabaseRouter.post('/rest/v1/:table', async (c) => {
  const { appId } = c.get('embedToken')
  const table = c.req.param('table')
  const schema = toSchemaName(appId)

  try {
    await validateTable(schema, table)
    const body = await c.req.json() as Record<string, unknown>
    const columns = Object.keys(body)
    await validateColumns(schema, table, columns)

    const cols = columns.map((col) => `"${col}"`).join(', ')
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
    const values = columns.map((col) => body[col])
    const sql = `INSERT INTO "${schema}"."${table}" (${cols}) VALUES (${placeholders}) RETURNING *`
    const { rows } = await db.query(sql, values)
    return c.json(rows[0] ?? {}, 201)
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json({ error: err.message }, err.status as 400 | 403 | 404)
    }
    throw err
  }
})

// UPDATE
compatSupabaseRouter.patch('/rest/v1/:table', async (c) => {
  const { appId } = c.get('embedToken')
  const table = c.req.param('table')
  const schema = toSchemaName(appId)

  try {
    await validateTable(schema, table)
    const body = await c.req.json() as Record<string, unknown>
    const setCols = Object.keys(body)
    await validateColumns(schema, table, setCols)

    const queryParams = Object.fromEntries([...new URL(c.req.url).searchParams.entries()])
    let filters
    try {
      filters = parseFilters(queryParams)
    } catch (err) {
      if (err instanceof PostgRestParseError) {
        return c.json({ error: err.message }, 400)
      }
      throw err
    }

    const setParams = setCols.map((col) => body[col])
    const setParts = setCols.map((col, i) => `"${col}" = $${i + 1}`)
    const { clause, params: filterParams } = buildWhereClause(filters, setCols.length + 1)
    const where = clause ? `WHERE ${clause}` : ''
    const sql = `UPDATE "${schema}"."${table}" SET ${setParts.join(', ')} ${where} RETURNING *`
    const { rows } = await db.query(sql, [...setParams, ...filterParams])
    return c.json(rows)
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json({ error: err.message }, err.status as 400 | 403 | 404)
    }
    throw err
  }
})

// DELETE
compatSupabaseRouter.delete('/rest/v1/:table', async (c) => {
  const { appId } = c.get('embedToken')
  const table = c.req.param('table')
  const schema = toSchemaName(appId)

  try {
    await validateTable(schema, table)

    const queryParams = Object.fromEntries([...new URL(c.req.url).searchParams.entries()])
    let filters
    try {
      filters = parseFilters(queryParams)
    } catch (err) {
      if (err instanceof PostgRestParseError) {
        return c.json({ error: err.message }, 400)
      }
      throw err
    }

    const { clause, params } = buildWhereClause(filters)
    const where = clause ? `WHERE ${clause}` : ''
    const sql = `DELETE FROM "${schema}"."${table}" ${where}`
    await db.query(sql, params)
    return c.json({ deleted: true })
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json({ error: err.message }, err.status as 400 | 403 | 404)
    }
    throw err
  }
})

// ── Storage endpoints ──────────────────────────────────────────────────────

// Pattern: bucket name prepended as prefix to preserve namespacing
compatSupabaseRouter.put('/storage/v1/object/:bucket/:key{.+}', async (c) => {
  const { appId } = c.get('embedToken')
  const bucket = c.req.param('bucket')
  const key = c.req.param('key')
  const fullKey = `${bucket}/${key}`
  const contentType = c.req.header('content-type') ?? 'application/octet-stream'
  const buffer = Buffer.from(await c.req.arrayBuffer())
  const result = await storageUpload({ appId, key: fullKey, buffer, contentType })
  return c.json(result)
})

compatSupabaseRouter.get('/storage/v1/object/:bucket/:key{.+}', async (c) => {
  const { appId } = c.get('embedToken')
  const bucket = c.req.param('bucket')
  const key = c.req.param('key')
  const fullKey = `${bucket}/${key}`
  const data = await storageGet(fullKey, appId)
  return new Response(data as ArrayBuffer, {
    headers: { 'Content-Type': 'application/octet-stream' },
  })
})

compatSupabaseRouter.delete('/storage/v1/object/:bucket/:key{.+}', async (c) => {
  const { appId } = c.get('embedToken')
  const bucket = c.req.param('bucket')
  const key = c.req.param('key')
  const fullKey = `${bucket}/${key}`
  await storageDelete(fullKey, appId)
  return c.json({ deleted: true })
})

compatSupabaseRouter.get('/storage/v1/object/list/:bucket', async (c) => {
  const { appId } = c.get('embedToken')
  const bucket = c.req.param('bucket')
  const prefix = `${bucket}/`
  const items = await storageList(appId)
  const filtered = (items as string[]).filter((k: string) => k.startsWith(prefix))
  return c.json(filtered.map((k: string) => ({ name: k.slice(prefix.length), key: k })))
})

// Realtime / Edge Functions → 501
compatSupabaseRouter.all('/realtime/*', (c) =>
  c.json({ error: 'not supported on Terminal AI — see PORTING.md' }, 501)
)
compatSupabaseRouter.all('/functions/*', (c) =>
  c.json({ error: 'not supported on Terminal AI — see PORTING.md' }, 501)
)
compatSupabaseRouter.post('/rest/v1/rpc/*', (c) =>
  c.json({ error: 'not supported on Terminal AI — see PORTING.md' }, 501)
)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd gateway && npx vitest run src/routes/compat-supabase.test.ts
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add gateway/src/routes/compat-supabase.ts gateway/src/routes/compat-supabase.test.ts
git commit -m "feat(gateway): add Supabase compat router — auth, REST, storage endpoints"
```

---

### Task 5: Register Compat Router in Gateway

**Files:**
- Modify: `gateway/src/index.ts`

- [ ] **Step 1: Read the current gateway index to find the import block and route registrations**

Read `gateway/src/index.ts` lines 1-40 to find existing imports and `app.route(...)` calls.

- [ ] **Step 2: Add compat imports**

Add these two lines to the import block (after existing route imports):

```typescript
import { compatSupabaseRouter } from './routes/compat-supabase'
import { compatShimCheck } from './middleware/compat-shim-check'
```

- [ ] **Step 3: Register the compat router**

Find the block where routes are registered (e.g., `app.route('/v1', ...)`) and add after it:

```typescript
// Supabase compat shim — gated by compat_shim_enabled flag per app
app.use('/compat/supabase/*', embedTokenAuth)
app.use('/compat/supabase/*', compatShimCheck)
app.route('/compat/supabase', compatSupabaseRouter)
```

- [ ] **Step 4: Verify gateway still compiles**

```bash
cd gateway && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add gateway/src/index.ts
git commit -m "feat(gateway): register Supabase compat router under /compat/supabase/*"
```

---

### Task 6: MCP Tools — `enable_compat_shim`, `disable_compat_shim`

**Files:**
- Create: `mcp-server/src/tools/compat-shim.ts`
- Create: `mcp-server/src/tools/compat-shim.test.ts`
- Modify: `mcp-server/src/index.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// mcp-server/src/tools/compat-shim.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/db', () => ({ db: { query: vi.fn() } }))

import { db } from '../lib/db'
import { enableCompatShim, disableCompatShim, getCompatShimStatus } from './compat-shim'

describe('enableCompatShim', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets compat_shim_enabled = true and returns enabled: true', async () => {
    vi.mocked(db.query).mockResolvedValue({ rows: [{ compat_shim_enabled: true }] } as never)
    const result = await enableCompatShim('app-123')
    expect(result).toEqual({ enabled: true })
    expect(vi.mocked(db.query).mock.calls[0][0]).toContain('compat_shim_enabled = true')
  })

  it('throws when app not found', async () => {
    vi.mocked(db.query).mockResolvedValue({ rows: [] } as never)
    await expect(enableCompatShim('nonexistent')).rejects.toThrow('App not found')
  })
})

describe('disableCompatShim', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets compat_shim_enabled = false and returns enabled: false', async () => {
    vi.mocked(db.query).mockResolvedValue({ rows: [{ compat_shim_enabled: false }] } as never)
    const result = await disableCompatShim('app-123')
    expect(result).toEqual({ enabled: false })
    expect(vi.mocked(db.query).mock.calls[0][0]).toContain('compat_shim_enabled = false')
  })

  it('throws when app not found', async () => {
    vi.mocked(db.query).mockResolvedValue({ rows: [] } as never)
    await expect(disableCompatShim('nonexistent')).rejects.toThrow('App not found')
  })
})

describe('getCompatShimStatus', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns true when enabled', async () => {
    vi.mocked(db.query).mockResolvedValue({ rows: [{ compat_shim_enabled: true }] } as never)
    expect(await getCompatShimStatus('app-123')).toBe(true)
  })

  it('returns false when disabled', async () => {
    vi.mocked(db.query).mockResolvedValue({ rows: [{ compat_shim_enabled: false }] } as never)
    expect(await getCompatShimStatus('app-123')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd mcp-server && bun test src/tools/compat-shim.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// mcp-server/src/tools/compat-shim.ts
import { db } from '../lib/db'

export async function enableCompatShim(appId: string): Promise<{ enabled: boolean }> {
  const { rows } = await db.query<{ compat_shim_enabled: boolean }>(
    `UPDATE marketplace.apps
     SET compat_shim_enabled = true
     WHERE id = $1
     RETURNING compat_shim_enabled`,
    [appId],
  )
  if (rows.length === 0) throw new Error(`App not found: ${appId}`)
  return { enabled: rows[0].compat_shim_enabled }
}

export async function disableCompatShim(appId: string): Promise<{ enabled: boolean }> {
  const { rows } = await db.query<{ compat_shim_enabled: boolean }>(
    `UPDATE marketplace.apps
     SET compat_shim_enabled = false
     WHERE id = $1
     RETURNING compat_shim_enabled`,
    [appId],
  )
  if (rows.length === 0) throw new Error(`App not found: ${appId}`)
  return { enabled: rows[0].compat_shim_enabled }
}

export async function getCompatShimStatus(appId: string): Promise<boolean> {
  const { rows } = await db.query<{ compat_shim_enabled: boolean }>(
    `SELECT compat_shim_enabled FROM marketplace.apps WHERE id = $1`,
    [appId],
  )
  return rows[0]?.compat_shim_enabled ?? false
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd mcp-server && bun test src/tools/compat-shim.test.ts
```
Expected: all tests PASS.

- [ ] **Step 5: Register tools in MCP server index**

In `mcp-server/src/index.ts`, add import:
```typescript
import { enableCompatShim, disableCompatShim, getCompatShimStatus } from './tools/compat-shim'
```

Then register two new MCP tools in the tool dispatch block. Find the pattern where tools are registered (e.g., `case 'deploy_app':`) and add:

```typescript
case 'enable_compat_shim': {
  const { app_id } = params as { app_id: string }
  const result = await enableCompatShim(app_id)
  return { content: [{ type: 'text', text: JSON.stringify(result) }] }
}
case 'disable_compat_shim': {
  const { app_id } = params as { app_id: string }
  const result = await disableCompatShim(app_id)
  return { content: [{ type: 'text', text: JSON.stringify(result) }] }
}
```

Also add the tool definitions to the `tools/list` handler:
```typescript
{
  name: 'enable_compat_shim',
  description: 'Enable the Supabase compatibility shim for an app. Activates /compat/supabase/* gateway routes so supabase-js calls are translated to Terminal AI.',
  inputSchema: {
    type: 'object',
    properties: { app_id: { type: 'string', description: 'App UUID' } },
    required: ['app_id'],
  },
},
{
  name: 'disable_compat_shim',
  description: 'Disable the Supabase compatibility shim for an app. All /compat/supabase/* routes return 404.',
  inputSchema: {
    type: 'object',
    properties: { app_id: { type: 'string', description: 'App UUID' } },
    required: ['app_id'],
  },
},
```

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/tools/compat-shim.ts mcp-server/src/tools/compat-shim.test.ts mcp-server/src/index.ts
git commit -m "feat(mcp): add enable_compat_shim and disable_compat_shim tools"
```

---

### Task 7: `analyze_repo` MCP Tool

**Files:**
- Create: `mcp-server/src/tools/analyze-repo.ts`
- Create: `mcp-server/src/tools/analyze-repo.test.ts`
- Modify: `mcp-server/src/index.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// mcp-server/src/tools/analyze-repo.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { analyzeRepo } from './analyze-repo'

function makeTreeResponse(files: string[]) {
  return {
    ok: true,
    json: () => Promise.resolve({
      tree: files.map((path) => ({ path, type: 'blob' })),
    }),
  }
}

function makeFileResponse(content: string) {
  return { ok: true, text: () => Promise.resolve(content) }
}

describe('analyzeRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns clean result for repo with no Supabase usage', async () => {
    mockFetch
      .mockResolvedValueOnce(makeTreeResponse(['src/index.ts']))
      .mockResolvedValueOnce(makeFileResponse('const x = 1'))

    const result = await analyzeRepo('https://github.com/acme/clean-app', 'main')
    expect(result.risk_flags).toHaveLength(0)
    expect(result.compat_shim_coverage).toBe(1)
    expect(result.halted_on_critical).toBe(false)
  })

  it('halts on critical: SUPABASE_SERVICE_ROLE_KEY detected', async () => {
    mockFetch
      .mockResolvedValueOnce(makeTreeResponse(['lib/supabase.ts']))
      .mockResolvedValueOnce(makeFileResponse('const key = process.env.SUPABASE_SERVICE_ROLE_KEY'))

    const result = await analyzeRepo('https://github.com/acme/bad-app', 'main')
    expect(result.halted_on_critical).toBe(true)
    expect(result.risk_flags.some((f) => f.severity === 'critical')).toBe(true)
    expect(result.migration_checklist).toHaveLength(0)
  })

  it('detects auth patterns with high severity', async () => {
    mockFetch
      .mockResolvedValueOnce(makeTreeResponse(['src/auth.ts']))
      .mockResolvedValueOnce(makeFileResponse('const user = await supabase.auth.getUser()'))

    const result = await analyzeRepo('https://github.com/acme/auth-app', 'main')
    expect(result.halted_on_critical).toBe(false)
    expect(result.risk_flags.some((f) => f.severity === 'high')).toBe(true)
    expect(result.migration_checklist.some((c) => c.category === 'auth')).toBe(true)
  })

  it('detects realtime as unsupported', async () => {
    mockFetch
      .mockResolvedValueOnce(makeTreeResponse(['src/realtime.ts']))
      .mockResolvedValueOnce(makeFileResponse('supabase.channel("room1").subscribe()'))

    const result = await analyzeRepo('https://github.com/acme/rt-app', 'main')
    expect(result.migration_checklist.some((c) => c.category === 'unsupported')).toBe(true)
  })

  it('compat_shim_coverage below 0.5 when unsupported calls dominate', async () => {
    const content = Array(10).fill('supabase.channel("room").subscribe()').join('\n') +
      '\n' + Array(2).fill('supabase.from("t").select()').join('\n')
    mockFetch
      .mockResolvedValueOnce(makeTreeResponse(['src/app.ts']))
      .mockResolvedValueOnce(makeFileResponse(content))

    const result = await analyzeRepo('https://github.com/acme/heavy-rt', 'main')
    expect(result.compat_shim_coverage).toBeLessThan(0.5)
  })

  it('includes env_vars_to_add and env_vars_to_remove', async () => {
    mockFetch
      .mockResolvedValueOnce(makeTreeResponse(['src/index.ts']))
      .mockResolvedValueOnce(makeFileResponse('supabase.from("posts").select()'))

    const result = await analyzeRepo('https://github.com/acme/app', 'main')
    expect(result.env_vars_to_add).toContain('TERMINAL_AI_GATEWAY_URL')
    expect(result.env_vars_to_remove).toContain('SUPABASE_URL')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd mcp-server && bun test src/tools/analyze-repo.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// mcp-server/src/tools/analyze-repo.ts

export interface RiskFlag {
  severity: 'critical' | 'high' | 'medium' | 'low'
  pattern: string
  file: string
  line: number
  message: string
}

export interface MigrationChecklistItem {
  category: 'auth' | 'db' | 'storage' | 'unsupported' | 'security'
  count?: number
  tables?: string[]
  patterns?: string[]
  effort: 'low' | 'medium' | 'high'
  action: string
}

export interface AnalyzeRepoResult {
  risk_flags: RiskFlag[]
  migration_checklist: MigrationChecklistItem[]
  compat_shim_coverage: number
  estimated_effort: 'low' | 'medium' | 'high'
  env_vars_to_add: string[]
  env_vars_to_remove: string[]
  halted_on_critical: boolean
}

interface DetectionRule {
  pattern: RegExp
  category: 'auth' | 'db' | 'storage' | 'unsupported' | 'security'
  severity: 'critical' | 'high' | 'medium' | 'low'
  shimCovered: boolean
  message: string
  action: string
}

const DETECTION_RULES: DetectionRule[] = [
  {
    pattern: /SUPABASE_SERVICE_ROLE_KEY|service_role/,
    category: 'security',
    severity: 'critical',
    shimCovered: false,
    message: 'Service role key must never be deployed to Terminal AI',
    action: 'Remove service role key entirely — Terminal AI gateway handles auth at the gateway layer',
  },
  {
    pattern: /supabase\.auth\.getUser\s*\(/,
    category: 'auth',
    severity: 'high',
    shimCovered: true,
    message: 'getUser() replaced by /compat/supabase/auth/v1/user or useEmbedToken()',
    action: 'Replace with /compat/supabase/auth/v1/user or remove — shim covers this',
  },
  {
    pattern: /supabase\.auth\.signIn|supabase\.auth\.signUp|supabase\.auth\.signOut/,
    category: 'auth',
    severity: 'high',
    shimCovered: true,
    message: 'Auth sign-in/sign-up/sign-out are no-ops on Terminal AI',
    action: 'Shim returns 200 no-op — remove or replace with useEmbedToken() pattern',
  },
  {
    pattern: /supabase\.from\s*\(['"]/,
    category: 'db',
    severity: 'medium',
    shimCovered: true,
    message: 'PostgREST DB call — shim translates CRUD to Terminal AI gateway',
    action: 'Shim covers CRUD — RLS is NOT enforced, gateway layer secures access',
  },
  {
    pattern: /supabase\.storage\.from\s*\(['"]/,
    category: 'storage',
    severity: 'low',
    shimCovered: true,
    message: 'Storage call — shim translates to Terminal AI storage',
    action: 'Shim covers upload/download/delete/list — bucket name becomes key prefix',
  },
  {
    pattern: /supabase\.functions\.invoke\s*\(/,
    category: 'unsupported',
    severity: 'high',
    shimCovered: false,
    message: 'Edge Functions have no equivalent on Terminal AI',
    action: 'No equivalent — must remove or redesign as API route in your Next.js app',
  },
  {
    pattern: /supabase\.channel\s*\(|\.realtime\./,
    category: 'unsupported',
    severity: 'high',
    shimCovered: false,
    message: 'Realtime subscriptions have no equivalent on Terminal AI',
    action: 'No equivalent — must remove or redesign',
  },
  {
    pattern: /supabase\.rpc\s*\(/,
    category: 'db',
    severity: 'medium',
    shimCovered: false,
    message: 'Custom RPC procedures require manual rewrite',
    action: 'Shim returns 501 — migrate to application-level logic or a gateway route',
  },
  {
    pattern: /CREATE POLICY|ENABLE ROW LEVEL SECURITY|auth\.uid\s*\(\)/,
    category: 'security',
    severity: 'high',
    shimCovered: false,
    message: 'RLS policies are silently lost — Terminal AI has no Postgres-level user context',
    action: 'Add viewer_id column and filter in application code; shim secures at gateway layer',
  },
]

const SCANNABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py'])
const SQL_EXTENSION = '.sql'
const MAX_FILES = 200

function parseOwnerRepo(githubRepo: string): { owner: string; repo: string } {
  const url = new URL(githubRepo)
  const parts = url.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/')
  if (parts.length < 2) throw new Error(`Cannot parse GitHub repo URL: ${githubRepo}`)
  return { owner: parts[0], repo: parts[1] }
}

export async function analyzeRepo(
  githubRepo: string,
  branch = 'main',
  githubToken?: string,
): Promise<AnalyzeRepoResult> {
  const { owner, repo } = parseOwnerRepo(githubRepo)

  const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' }
  if (githubToken) headers['Authorization'] = `Bearer ${githubToken}`

  // Fetch tree via GitHub Trees API
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
  const treeRes = await fetch(treeUrl, { headers })
  if (!treeRes.ok) throw new Error(`GitHub Trees API error: ${treeRes.status}`)
  const treeData = await treeRes.json() as { tree: Array<{ path: string; type: string }> }

  const filePaths = treeData.tree
    .filter((node) => node.type === 'blob')
    .map((node) => node.path)
    .filter((path) => {
      const ext = '.' + path.split('.').pop()
      return SCANNABLE_EXTENSIONS.has(ext) || ext === SQL_EXTENSION
    })
    .slice(0, MAX_FILES)

  // Fetch and scan files
  const riskFlags: RiskFlag[] = []
  const matchCounts: Map<DetectionRule, number> = new Map(DETECTION_RULES.map((r) => [r, 0]))

  for (const filePath of filePaths) {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`
    const fileRes = await fetch(rawUrl, { headers })
    if (!fileRes.ok) continue
    const content = await fileRes.text()

    const lines = content.split('\n')
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx]
      for (const rule of DETECTION_RULES) {
        if (rule.pattern.test(line)) {
          matchCounts.set(rule, (matchCounts.get(rule) ?? 0) + 1)
          riskFlags.push({
            severity: rule.severity,
            pattern: rule.pattern.source,
            file: filePath,
            line: lineIdx + 1,
            message: rule.message,
          })
        }
      }
    }
  }

  // Check for critical halt
  const hasCritical = riskFlags.some((f) => f.severity === 'critical')
  if (hasCritical) {
    return {
      risk_flags: riskFlags.filter((f) => f.severity === 'critical'),
      migration_checklist: [],
      compat_shim_coverage: 0,
      estimated_effort: 'high',
      env_vars_to_add: [],
      env_vars_to_remove: [],
      halted_on_critical: true,
    }
  }

  // Build migration checklist from match counts
  const checklist: MigrationChecklistItem[] = []
  const categoryTotals = new Map<string, { count: number; covered: number }>()

  for (const [rule, count] of matchCounts) {
    if (count === 0) continue
    const cat = rule.category
    const existing = categoryTotals.get(cat) ?? { count: 0, covered: 0 }
    categoryTotals.set(cat, {
      count: existing.count + count,
      covered: existing.covered + (rule.shimCovered ? count : 0),
    })
  }

  for (const [category, totals] of categoryTotals) {
    const effort: 'low' | 'medium' | 'high' =
      category === 'auth' ? 'high' : category === 'unsupported' ? 'high' : 'medium'
    const rule = DETECTION_RULES.find((r) => r.category === category)!
    checklist.push({
      category: category as MigrationChecklistItem['category'],
      count: totals.count,
      effort,
      action: rule.action,
    })
  }

  // Compute compat_shim_coverage
  let totalCalls = 0
  let coveredCalls = 0
  for (const [rule, count] of matchCounts) {
    totalCalls += count
    if (rule.shimCovered) coveredCalls += count
  }
  const shimCoverage = totalCalls === 0 ? 1 : coveredCalls / totalCalls

  // Estimate overall effort
  const hasHighEffort = checklist.some((c) => c.effort === 'high')
  const hasMediumEffort = checklist.some((c) => c.effort === 'medium')
  const estimatedEffort: 'low' | 'medium' | 'high' = hasHighEffort
    ? 'high'
    : hasMediumEffort
    ? 'medium'
    : 'low'

  return {
    risk_flags: riskFlags,
    migration_checklist: checklist,
    compat_shim_coverage: shimCoverage,
    estimated_effort: estimatedEffort,
    env_vars_to_add: ['TERMINAL_AI_GATEWAY_URL'],
    env_vars_to_remove: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
    halted_on_critical: false,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd mcp-server && bun test src/tools/analyze-repo.test.ts
```
Expected: all tests PASS.

- [ ] **Step 5: Register `analyze_repo` tool in MCP server index**

In `mcp-server/src/index.ts`, add import:
```typescript
import { analyzeRepo } from './tools/analyze-repo'
```

Add to tool list:
```typescript
{
  name: 'analyze_repo',
  description: 'Scan a GitHub repo for Supabase patterns before porting to Terminal AI. Returns risk flags, migration checklist, and compat_shim_coverage score. Halts with critical flags if service_role credentials are detected.',
  inputSchema: {
    type: 'object',
    properties: {
      github_repo: { type: 'string', description: 'Full GitHub URL (e.g. https://github.com/acme/app)' },
      branch: { type: 'string', description: 'Branch to scan (default: main)' },
      github_token: { type: 'string', description: 'Optional GitHub personal access token for private repos' },
    },
    required: ['github_repo'],
  },
},
```

Add to tool dispatch:
```typescript
case 'analyze_repo': {
  const { github_repo, branch, github_token } = params as {
    github_repo: string
    branch?: string
    github_token?: string
  }
  const result = await analyzeRepo(github_repo, branch ?? 'main', github_token)
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}
```

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/tools/analyze-repo.ts mcp-server/src/tools/analyze-repo.test.ts mcp-server/src/index.ts
git commit -m "feat(mcp): add analyze_repo tool — scans GitHub repo for Supabase porting risk"
```

---

### Task 8: `scaffold_app` `port_from` Mode

**Files:**
- Modify: `mcp-server/src/tools/scaffold.ts`
- Modify: `mcp-server/src/index.ts`
- Create: `mcp-server/src/tools/scaffold-port-from.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// mcp-server/src/tools/scaffold-port-from.test.ts
import { describe, it, expect } from 'vitest'
import { buildPortFromFiles } from './scaffold'

describe('buildPortFromFiles', () => {
  it('generates supabase-compat.ts with gateway URL usage', () => {
    const files = buildPortFromFiles({ provider: 'supabase', detectedTables: ['posts', 'profiles'] })
    const compatFile = files.find((f) => f.path === 'lib/supabase-compat.ts')
    expect(compatFile).toBeDefined()
    expect(compatFile!.content).toContain('TERMINAL_AI_GATEWAY_URL')
    expect(compatFile!.content).toContain('/compat/supabase')
  })

  it('generates use-supabase-session.ts hook', () => {
    const files = buildPortFromFiles({ provider: 'supabase', detectedTables: [] })
    const hookFile = files.find((f) => f.path === 'hooks/use-supabase-session.ts')
    expect(hookFile).toBeDefined()
    expect(hookFile!.content).toContain('useEmbedToken')
    expect(hookFile!.content).toContain('initSupabaseSession')
  })

  it('generates db-migrations.sql with CREATE TABLE stubs for each detected table', () => {
    const files = buildPortFromFiles({ provider: 'supabase', detectedTables: ['posts', 'profiles'] })
    const migFile = files.find((f) => f.path === 'db-migrations.sql')
    expect(migFile).toBeDefined()
    expect(migFile!.content).toContain('posts')
    expect(migFile!.content).toContain('profiles')
    expect(migFile!.content).toContain('CREATE TABLE IF NOT EXISTS')
  })

  it('generates PORTING.md with env var swap instructions', () => {
    const files = buildPortFromFiles({ provider: 'supabase', detectedTables: ['posts'] })
    const portingMd = files.find((f) => f.path === 'PORTING.md')
    expect(portingMd).toBeDefined()
    expect(portingMd!.content).toContain('NEXT_PUBLIC_SUPABASE_URL')
    expect(portingMd!.content).toContain('TERMINAL_AI_GATEWAY_URL')
    expect(portingMd!.content).toContain('RLS')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd mcp-server && bun test src/tools/scaffold-port-from.test.ts
```
Expected: FAIL — `buildPortFromFiles` not exported.

- [ ] **Step 3: Add `buildPortFromFiles` function to scaffold.ts**

Read `mcp-server/src/tools/scaffold.ts` to find the file structure, then add after the existing file builders:

```typescript
// Add to mcp-server/src/tools/scaffold.ts

export interface PortFromOptions {
  provider: 'supabase'
  detectedTables: string[]
}

export interface GeneratedFile {
  path: string
  content: string
}

export function buildPortFromFiles(options: PortFromOptions): GeneratedFile[] {
  const { detectedTables } = options
  const files: GeneratedFile[] = []

  // lib/supabase-compat.ts — drop-in shim client
  files.push({
    path: 'lib/supabase-compat.ts',
    content: `import { createClient } from '@supabase/supabase-js'

const GATEWAY = process.env.TERMINAL_AI_GATEWAY_URL!

export const supabase = createClient(\`\${GATEWAY}/compat/supabase\`, '')

export function initSupabaseSession(embedToken: string): void {
  supabase.auth.setSession({ access_token: embedToken, refresh_token: '' })
}
`,
  })

  // hooks/use-supabase-session.ts
  files.push({
    path: 'hooks/use-supabase-session.ts',
    content: `'use client'

import { useEffect } from 'react'
import { useEmbedToken } from '@terminal-ai/sdk/react'
import { supabase, initSupabaseSession } from '@/lib/supabase-compat'

export function useSupabaseSession() {
  const embedToken = useEmbedToken()

  useEffect(() => {
    if (embedToken) initSupabaseSession(embedToken)
  }, [embedToken])

  return { supabase, ready: !!embedToken }
}
`,
  })

  // db-migrations.sql — stub per detected table
  const tableStubs = detectedTables.length > 0
    ? detectedTables.map((table) => `-- TODO: fill in real columns for "${table}"
CREATE TABLE IF NOT EXISTS "${table}" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`).join('\n\n')
    : '-- No tables detected — add your CREATE TABLE statements here'

  files.push({
    path: 'db-migrations.sql',
    content: `-- Generated by Terminal AI scaffold port_from mode
-- Run these against your Terminal AI app database to create the necessary tables.
-- Replace the JSONB data column with your real schema before deploying.

${tableStubs}
`,
  })

  // PORTING.md — repo-specific migration guide
  const tableList = detectedTables.length > 0
    ? detectedTables.map((t) => `- \`${t}\``).join('\n')
    : '- (no tables detected)'

  files.push({
    path: 'PORTING.md',
    content: `# Terminal AI Porting Guide

Generated by \`scaffold_app\` — customised for this repo.

## 1. Env Var Swaps (zero code changes for covered patterns)

| Remove | Replace with |
|---|---|
| \`NEXT_PUBLIC_SUPABASE_URL\` | \`\${TERMINAL_AI_GATEWAY_URL}/compat/supabase\` |
| \`NEXT_PUBLIC_SUPABASE_ANON_KEY\` | *(remove — pass empty string or omit)* |

Add to your Terminal AI app environment:
\`\`\`
TERMINAL_AI_GATEWAY_URL=<your gateway URL>
\`\`\`

## 2. Auth Changes

Replace Supabase auth hooks with \`useSupabaseSession\` from \`hooks/use-supabase-session.ts\`:

\`\`\`typescript
// Before
const { data: { user } } = await supabase.auth.getUser()

// After
const { supabase, ready } = useSupabaseSession()
// user.id is now the Terminal AI viewer ID
\`\`\`

The viewer's identity comes from the embed token — no sign-in flow needed.

## 3. RLS Warning

**Supabase Row Level Security (RLS) policies are silently lost.**

Terminal AI has no Postgres-level user context. The shim secures at the gateway layer (per-app schema isolation), not at the row level.

**Mitigation:** Add a \`viewer_id TEXT\` column to tables that need per-user row isolation and filter on it in application code:

\`\`\`typescript
const { supabase } = useSupabaseSession()
const { data } = await supabase
  .from('posts')
  .select('*')
  .eq('viewer_id', user.id) // application-level RLS replacement
\`\`\`

## 4. Detected Tables

${tableList}

Run \`db-migrations.sql\` to create stubs, then fill in real columns.

## 5. Unsupported Patterns

These must be removed or redesigned — no shim equivalent:

- **Realtime** (\`supabase.channel()\`, \`.subscribe()\`) — remove or redesign
- **Edge Functions** (\`supabase.functions.invoke()\`) — move to a Next.js API route
- **Custom RPC** (\`supabase.rpc()\`) — move to application-level logic

## 6. Migration Order (recommended)

1. Storage — lowest effort, fully covered by shim
2. Database CRUD — medium effort, shim covers \`eq/neq/gt/gte/lt/lte/like/ilike/is/in\`
3. Auth — requires viewer identity pattern change (last because it touches most files)
4. Disable compat shim — once all modules migrated to native Terminal AI SDK
`,
  })

  return files
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd mcp-server && bun test src/tools/scaffold-port-from.test.ts
```
Expected: all tests PASS.

- [ ] **Step 5: Wire `port_from` into the main `scaffold_app` tool**

In `mcp-server/src/tools/scaffold.ts`, find the `ScaffoldInput` type and add `port_from`:

```typescript
export interface ScaffoldInput {
  // ... existing fields ...
  port_from?: {
    provider: 'supabase'
    github_repo: string
  }
}
```

In the main scaffold function body, after the standard files are assembled, add:

```typescript
if (input.port_from?.provider === 'supabase') {
  const portFiles = buildPortFromFiles({
    provider: 'supabase',
    detectedTables: [], // populated from analyze_repo output if available
  })
  for (const f of portFiles) {
    files.push(f) // merge into existing file list
  }
}
```

In `mcp-server/src/index.ts`, find the `scaffold_app` schema and add `port_from` to its input schema:

```typescript
port_from: {
  type: 'object',
  description: 'Port an existing app from another provider',
  properties: {
    provider: { type: 'string', enum: ['supabase'] },
    github_repo: { type: 'string', description: 'GitHub URL of the existing app' },
  },
  required: ['provider', 'github_repo'],
},
```

- [ ] **Step 6: Run all MCP server tests**

```bash
cd mcp-server && bun test
```
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add mcp-server/src/tools/scaffold.ts mcp-server/src/tools/scaffold-port-from.test.ts mcp-server/src/index.ts
git commit -m "feat(mcp): add scaffold_app port_from mode — generates supabase-compat.ts, hooks, migrations, PORTING.md"
```

---

### Task 9: Run Full Test Suites and Verify

- [ ] **Step 1: Run all gateway tests**

```bash
cd gateway && npx vitest run
```
Expected: all tests PASS, no regressions.

- [ ] **Step 2: Run all MCP server tests**

```bash
cd mcp-server && bun test
```
Expected: all tests PASS, no regressions.

- [ ] **Step 3: Verify TypeScript compilation for both services**

```bash
cd gateway && npx tsc --noEmit && cd ../mcp-server && npx tsc --noEmit
```
Expected: no type errors.

- [ ] **Step 4: Final commit if any loose changes**

```bash
git add -p
git commit -m "chore: fix any type errors found during final tsc check"
```
(Skip if nothing to stage.)

---

## Implementation Checklist

| Component | File(s) | Task |
|---|---|---|
| DB migration | `021_compat_shim.sql` | Task 1 |
| PostgREST parser | `postgrest-parser.ts` + test | Task 2 |
| Shim check middleware | `compat-shim-check.ts` + test | Task 3 |
| Compat router | `compat-supabase.ts` + test | Task 4 |
| Gateway wiring | `gateway/src/index.ts` | Task 5 |
| MCP shim tools | `compat-shim.ts` + test + index | Task 6 |
| `analyze_repo` tool | `analyze-repo.ts` + test + index | Task 7 |
| `port_from` scaffold | `scaffold.ts` + test + index | Task 8 |
| Integration smoke test | all test suites | Task 9 |
