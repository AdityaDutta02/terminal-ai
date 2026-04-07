# App-Managed Database & Object Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every deployed Terminal AI app an isolated Postgres schema and MinIO storage prefix, accessible via new gateway routes `/db/*` and `/storage/*` using the existing embed token.

**Architecture:** Custom CRUD handler in the gateway derives the app's schema from the embed token's `appId`, validates all table/column names against `information_schema`, and runs schema-qualified SQL. Storage routes extend the existing MinIO service with per-app prefix isolation (`apps/<appId>/`). Deploy-manager provisions the schema/role and runs `db-migrations.sql` from the app's repo before the Coolify deploy.

**Tech Stack:** Hono (gateway routes), node-postgres `pg` (DB queries), MinIO S3-compatible API (AWS4 signing — existing pattern), BullMQ (deploy queue — existing), Vitest (tests)

---

## File Map

**New files:**
- `gateway/src/lib/db-validator.ts` — identifier regex + information_schema whitelist
- `gateway/src/routes/db.ts` — CRUD route handler
- `gateway/src/routes/storage.ts` — storage route handler
- `gateway/src/routes/db.test.ts` — DB route unit tests
- `gateway/src/routes/storage.test.ts` — storage route unit tests
- `platform/lib/db/migrations/009_app_storage.sql` — app_db_provisions table

**Modified files:**
- `gateway/src/services/minio.ts` — add `storageUpload`, `storageGet`, `storageList`, `storageDelete`, `storageDeletePrefix`
- `gateway/src/index.ts` — register `/db` and `/storage` routers; add GET/PUT/PATCH/DELETE to CORS allowMethods
- `deploy-manager/src/queue/deploy-queue.ts` — add `provisionAppDb`, `runMigrations`; call them in the deploy flow; extend `failDeployment` error codes
- `deploy-manager/src/index.ts` — extend `DELETE /apps/:appId` to drop schema, role, and storage prefix
- `mcp-server/src/tools/scaffold.ts` — add `db-migrations.sql`, `db-sdk.ts`, `storage-sdk.ts` to scaffolded output; update notes

---

## Task 1: DB migration — app_db_provisions table

**Files:**
- Create: `platform/lib/db/migrations/009_app_storage.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- platform/lib/db/migrations/009_app_storage.sql
CREATE TABLE IF NOT EXISTS deployments.app_db_provisions (
  app_id      UUID PRIMARY KEY REFERENCES marketplace.apps(id) ON DELETE CASCADE,
  schema_name TEXT NOT NULL,
  role_name   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Run against the database on VPS1**

```bash
# On VPS1, copy and apply
docker cp platform/lib/db/migrations/009_app_storage.sql terminal-ai-postgres-1:/tmp/
docker exec terminal-ai-postgres-1 psql -U postgres -d terminalai -f /tmp/009_app_storage.sql
```

Expected output: `CREATE TABLE`

- [ ] **Step 3: Commit**

```bash
git add platform/lib/db/migrations/009_app_storage.sql
git commit -m "feat(db): add app_db_provisions table for per-app schema tracking"
```

---

## Task 2: DB validator

**Files:**
- Create: `gateway/src/lib/db-validator.ts`
- Create: `gateway/src/lib/db-validator.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// gateway/src/lib/db-validator.test.ts
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd gateway && npx vitest run src/lib/db-validator.test.ts
```

Expected: FAIL — `db-validator.ts` not found

- [ ] **Step 3: Write the implementation**

```typescript
// gateway/src/lib/db-validator.ts
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd gateway && npx vitest run src/lib/db-validator.test.ts
```

Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add gateway/src/lib/db-validator.ts gateway/src/lib/db-validator.test.ts
git commit -m "feat(gateway): add DB identifier validator with information_schema whitelist"
```

---

## Task 3: DB routes

**Files:**
- Create: `gateway/src/routes/db.ts`
- Create: `gateway/src/routes/db.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// gateway/src/routes/db.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

vi.mock('../db.js', () => ({ db: { query: vi.fn() } }))
vi.mock('../middleware/auth.js', () => ({
  embedTokenAuth: vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set('embedToken', { appId: '550e8400-e29b-41d4-a716-446655440000', userId: 'u1', sessionId: 's1', creditsPerCall: 0, isFree: false, isAnon: false })
    await next()
  }),
}))
vi.mock('../lib/db-validator.js', () => ({
  toSchemaName: (id: string) => `app_data_${id.replaceAll('-', '_')}`,
  validateTable: vi.fn(),
  validateColumns: vi.fn(),
  ValidationError: class ValidationError extends Error {
    constructor(public status: number, message: string) { super(message) }
  },
}))

import { db } from '../db.js'
import { validateTable, validateColumns, ValidationError } from '../lib/db-validator.js'
const mockDb = vi.mocked(db)
const mockValidateTable = vi.mocked(validateTable)
const mockValidateColumns = vi.mocked(validateColumns)

const SCHEMA = 'app_data_550e8400_e29b_41d4_a716_446655440000'

async function makeRequest(method: string, path: string, body?: unknown) {
  const { dbRouter } = await import('./db.js')
  const app = new Hono()
  app.route('/db', dbRouter)
  return app.request(`/db${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockValidateTable.mockResolvedValue(undefined)
  mockValidateColumns.mockResolvedValue(undefined)
})

describe('GET /db/:table', () => {
  it('returns rows from the app schema', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: '1', name: 'foo' }] } as never)
    const res = await makeRequest('GET', '/items')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ id: '1', name: 'foo' }])
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining(SCHEMA),
      [],
    )
  })
  it('returns 404 when table not found', async () => {
    mockValidateTable.mockRejectedValueOnce(new ValidationError(404, "Table 'ghost' not found"))
    const res = await makeRequest('GET', '/ghost')
    expect(res.status).toBe(404)
    expect((await res.json() as { error: string }).error).toBe("Table 'ghost' not found")
  })
})

describe('GET /db/:table/:id', () => {
  it('returns a single row', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'abc' }] } as never)
    const res = await makeRequest('GET', '/items/abc')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'abc' })
  })
  it('returns 404 when row not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] } as never)
    const res = await makeRequest('GET', '/items/missing')
    expect(res.status).toBe(404)
  })
})

describe('POST /db/:table', () => {
  it('inserts a row and returns it', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'new', name: 'bar' }] } as never)
    const res = await makeRequest('POST', '/items', { name: 'bar' })
    expect(res.status).toBe(201)
    expect((await res.json() as { name: string }).name).toBe('bar')
  })
  it('returns 400 for unknown column', async () => {
    mockValidateColumns.mockRejectedValueOnce(new ValidationError(400, "Unknown column: 'evil'"))
    const res = await makeRequest('POST', '/items', { evil: 'x' })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /db/:table/:id', () => {
  it('updates a row and returns it', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'abc', name: 'updated' }] } as never)
    const res = await makeRequest('PATCH', '/items/abc', { name: 'updated' })
    expect(res.status).toBe(200)
    expect((await res.json() as { name: string }).name).toBe('updated')
  })
  it('returns 400 when body is empty', async () => {
    const res = await makeRequest('PATCH', '/items/abc', {})
    expect(res.status).toBe(400)
  })
  it('returns 404 when row not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] } as never)
    const res = await makeRequest('PATCH', '/items/missing', { name: 'x' })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /db/:table/:id', () => {
  it('deletes a row and returns { deleted: true }', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'abc' }] } as never)
    const res = await makeRequest('DELETE', '/items/abc')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: true })
  })
  it('returns 404 when row not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] } as never)
    const res = await makeRequest('DELETE', '/items/missing')
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd gateway && npx vitest run src/routes/db.test.ts
```

Expected: FAIL — `db.ts` not found

- [ ] **Step 3: Write the implementation**

```typescript
// gateway/src/routes/db.ts
import { Hono } from 'hono'
import { embedTokenAuth } from '../middleware/auth.js'
import { db } from '../db.js'
import { validateTable, validateColumns, toSchemaName, ValidationError } from '../lib/db-validator.js'
import { logger } from '../lib/logger.js'

const dbRouter = new Hono()
dbRouter.use('*', embedTokenAuth)

dbRouter.get('/:table', async (c) => {
  const { appId } = c.get('embedToken')
  const schema = toSchemaName(appId)
  const table = c.req.param('table')
  const raw = c.req.queries()
  const filters = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v[0]]))

  try {
    await validateTable(schema, table)
    const filterKeys = Object.keys(filters)
    await validateColumns(schema, table, filterKeys)
    const conditions = filterKeys.map((col, i) => `"${col}" = $${i + 1}`)
    const values = filterKeys.map((col) => filters[col])
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const { rows } = await db.query(`SELECT * FROM "${schema}"."${table}" ${where}`, values)
    return c.json(rows)
  } catch (err) {
    if (err instanceof ValidationError) return c.json({ error: err.message }, err.status)
    logger.error({ msg: 'db_list_error', appId, table, err: String(err) })
    return c.json({ error: 'Database error' }, 500)
  }
})

dbRouter.get('/:table/:id', async (c) => {
  const { appId } = c.get('embedToken')
  const schema = toSchemaName(appId)
  const table = c.req.param('table')
  const id = c.req.param('id')

  try {
    await validateTable(schema, table)
    const { rows } = await db.query(
      `SELECT * FROM "${schema}"."${table}" WHERE id = $1`,
      [id],
    )
    if (rows.length === 0) return c.json({ error: 'Row not found' }, 404)
    return c.json(rows[0])
  } catch (err) {
    if (err instanceof ValidationError) return c.json({ error: err.message }, err.status)
    logger.error({ msg: 'db_get_error', appId, table, err: String(err) })
    return c.json({ error: 'Database error' }, 500)
  }
})

dbRouter.post('/:table', async (c) => {
  const { appId } = c.get('embedToken')
  const schema = toSchemaName(appId)
  const table = c.req.param('table')

  try {
    const body = await c.req.json<Record<string, unknown>>()
    const columns = Object.keys(body)
    await validateTable(schema, table)
    await validateColumns(schema, table, columns)
    const cols = columns.map((col) => `"${col}"`).join(', ')
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
    const values = columns.map((col) => body[col])
    const { rows } = await db.query(
      `INSERT INTO "${schema}"."${table}" (${cols}) VALUES (${placeholders}) RETURNING *`,
      values,
    )
    return c.json(rows[0], 201)
  } catch (err) {
    if (err instanceof ValidationError) return c.json({ error: err.message }, err.status)
    logger.error({ msg: 'db_insert_error', appId, table, err: String(err) })
    return c.json({ error: 'Database error' }, 500)
  }
})

dbRouter.patch('/:table/:id', async (c) => {
  const { appId } = c.get('embedToken')
  const schema = toSchemaName(appId)
  const table = c.req.param('table')
  const id = c.req.param('id')

  try {
    const body = await c.req.json<Record<string, unknown>>()
    const columns = Object.keys(body)
    if (columns.length === 0) return c.json({ error: 'No fields to update' }, 400)
    await validateTable(schema, table)
    await validateColumns(schema, table, columns)
    const setClauses = columns.map((col, i) => `"${col}" = $${i + 1}`).join(', ')
    const values = [...columns.map((col) => body[col]), id]
    const { rows } = await db.query(
      `UPDATE "${schema}"."${table}" SET ${setClauses} WHERE id = $${columns.length + 1} RETURNING *`,
      values,
    )
    if (rows.length === 0) return c.json({ error: 'Row not found' }, 404)
    return c.json(rows[0])
  } catch (err) {
    if (err instanceof ValidationError) return c.json({ error: err.message }, err.status)
    logger.error({ msg: 'db_update_error', appId, table, err: String(err) })
    return c.json({ error: 'Database error' }, 500)
  }
})

dbRouter.delete('/:table/:id', async (c) => {
  const { appId } = c.get('embedToken')
  const schema = toSchemaName(appId)
  const table = c.req.param('table')
  const id = c.req.param('id')

  try {
    await validateTable(schema, table)
    const { rows } = await db.query(
      `DELETE FROM "${schema}"."${table}" WHERE id = $1 RETURNING id`,
      [id],
    )
    if (rows.length === 0) return c.json({ error: 'Row not found' }, 404)
    return c.json({ deleted: true })
  } catch (err) {
    if (err instanceof ValidationError) return c.json({ error: err.message }, err.status)
    logger.error({ msg: 'db_delete_error', appId, table, err: String(err) })
    return c.json({ error: 'Database error' }, 500)
  }
})

export { dbRouter }
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd gateway && npx vitest run src/routes/db.test.ts
```

Expected: all 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add gateway/src/routes/db.ts gateway/src/routes/db.test.ts
git commit -m "feat(gateway): add /db CRUD routes with schema isolation and injection prevention"
```

---

## Task 4: MinIO storage extensions

**Files:**
- Modify: `gateway/src/services/minio.ts`

- [ ] **Step 1: Add storage functions to the bottom of `minio.ts`**

Append the following after the existing `getPublicUrl` function:

```typescript
// --- Per-app storage functions ---

function appStorageKey(appId: string, key: string): string {
  return `apps/${appId}/${key}`
}

/** Upload a file to the app's storage prefix */
export async function storageUpload(params: {
  appId: string
  key: string
  buffer: Buffer
  contentType: string
}): Promise<void> {
  const cfg = minioConfig()
  const fullKey = appStorageKey(params.appId, params.key)
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${fullKey}`)
  const res = await signedPut(url, params.buffer, params.contentType, cfg)
  if (!res.ok) throw new Error(`MinIO PUT failed: ${res.status} ${await res.text()}`)
}

/** Download a file from the app's storage prefix */
export async function storageGet(appId: string, key: string): Promise<{ buffer: Buffer; contentType: string }> {
  const cfg = minioConfig()
  const fullKey = appStorageKey(appId, key)
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${fullKey}`)

  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  const reqHeaders: Record<string, string> = {
    host: url.host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  }
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalHeaders = buildCanonicalHeaders(reqHeaders)
  const canonicalRequest = ['GET', url.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const credentialScope = `${dateStamp}/us-east-1/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256hex(canonicalRequest)].join('\n')
  const signature = hmacSha256(getSigningKey(cfg.secretKey, dateStamp), stringToSign).toString('hex')
  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const res = await fetch(url.toString(), { method: 'GET', headers: { ...reqHeaders, Authorization: authorization } })
  if (res.status === 404) throw Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' })
  if (!res.ok) throw new Error(`MinIO GET failed: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
  return { buffer, contentType }
}

/** List files in the app's storage prefix */
export async function storageList(appId: string): Promise<Array<{ key: string; size: number; lastModified: string }>> {
  const cfg = minioConfig()
  const prefix = `apps/${appId}/`
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}`)
  url.searchParams.set('list-type', '2')
  url.searchParams.set('prefix', prefix)

  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  const reqHeaders: Record<string, string> = {
    host: url.host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  }
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalHeaders = buildCanonicalHeaders(reqHeaders)
  const sortedQuery = Array.from(url.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  const canonicalRequest = ['GET', url.pathname, sortedQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const credentialScope = `${dateStamp}/us-east-1/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256hex(canonicalRequest)].join('\n')
  const signature = hmacSha256(getSigningKey(cfg.secretKey, dateStamp), stringToSign).toString('hex')
  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const res = await fetch(url.toString(), { method: 'GET', headers: { ...reqHeaders, Authorization: authorization } })
  if (!res.ok) throw new Error(`MinIO list failed: ${res.status}`)
  const xml = await res.text()

  const contentBlocks = xml.match(/<Contents>([\s\S]*?)<\/Contents>/g) ?? []
  return contentBlocks.map((block) => {
    const fullKey = block.match(/<Key>(.*?)<\/Key>/)?.[1] ?? ''
    const size = parseInt(block.match(/<Size>(.*?)<\/Size>/)?.[1] ?? '0', 10)
    const lastModified = block.match(/<LastModified>(.*?)<\/LastModified>/)?.[1] ?? ''
    return { key: fullKey.slice(prefix.length), size, lastModified }
  }).filter((f) => f.key.length > 0)
}

/** Delete a single file from the app's storage prefix */
export async function storageDelete(appId: string, key: string): Promise<void> {
  const cfg = minioConfig()
  const fullKey = appStorageKey(appId, key)
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${fullKey}`)

  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  const reqHeaders: Record<string, string> = {
    host: url.host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  }
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalHeaders = buildCanonicalHeaders(reqHeaders)
  const canonicalRequest = ['DELETE', url.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const credentialScope = `${dateStamp}/us-east-1/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256hex(canonicalRequest)].join('\n')
  const signature = hmacSha256(getSigningKey(cfg.secretKey, dateStamp), stringToSign).toString('hex')
  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const res = await fetch(url.toString(), { method: 'DELETE', headers: { ...reqHeaders, Authorization: authorization } })
  if (res.status === 404) throw Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' })
  if (!res.ok) throw new Error(`MinIO DELETE failed: ${res.status}`)
}

/** Delete all files under the app's storage prefix (used during app deletion) */
export async function storageDeletePrefix(appId: string): Promise<void> {
  const files = await storageList(appId)
  for (const file of files) {
    await storageDelete(appId, file.key)
  }
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd gateway && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add gateway/src/services/minio.ts
git commit -m "feat(gateway): add per-app storage functions to MinIO service"
```

---

## Task 5: Storage routes

**Files:**
- Create: `gateway/src/routes/storage.ts`
- Create: `gateway/src/routes/storage.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// gateway/src/routes/storage.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

vi.mock('../middleware/auth.js', () => ({
  embedTokenAuth: vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set('embedToken', { appId: 'app-123', userId: 'u1', sessionId: 's1', creditsPerCall: 0, isFree: false, isAnon: false })
    await next()
  }),
}))
vi.mock('../services/minio.js', () => ({
  storageUpload: vi.fn(),
  storageGet: vi.fn(),
  storageList: vi.fn(),
  storageDelete: vi.fn(),
}))
vi.mock('../services/clamav.js', () => ({
  scanBuffer: vi.fn().mockResolvedValue({ clean: true }),
}))

import { storageUpload, storageGet, storageList, storageDelete } from '../services/minio.js'
import { scanBuffer } from '../services/clamav.js'
const mockUpload = vi.mocked(storageUpload)
const mockGet = vi.mocked(storageGet)
const mockList = vi.mocked(storageList)
const mockDelete = vi.mocked(storageDelete)
const mockScan = vi.mocked(scanBuffer)

async function makeRequest(method: string, path: string, body?: Buffer, headers?: Record<string, string>) {
  const { storageRouter } = await import('./storage.js')
  const app = new Hono()
  app.route('/storage', storageRouter)
  return app.request(`/storage${path}`, {
    method,
    headers: { Authorization: 'Bearer token', ...headers },
    body: body ?? undefined,
  })
}

beforeEach(() => vi.clearAllMocks())

describe('PUT /storage/:key — upload', () => {
  it('uploads a file and returns 201', async () => {
    mockUpload.mockResolvedValueOnce(undefined)
    const res = await makeRequest('PUT', '/report.pdf', Buffer.from('data'), {
      'Content-Type': 'application/pdf',
      'Content-Length': '4',
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ key: 'report.pdf', uploaded: true })
    expect(mockUpload).toHaveBeenCalledWith({ appId: 'app-123', key: 'report.pdf', buffer: expect.any(Buffer), contentType: 'application/pdf' })
  })
  it('returns 413 when Content-Length exceeds 50MB', async () => {
    const res = await makeRequest('PUT', '/big.bin', undefined, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(51 * 1024 * 1024),
    })
    expect(res.status).toBe(413)
    expect(mockUpload).not.toHaveBeenCalled()
  })
  it('returns 422 when virus scan fails', async () => {
    mockScan.mockResolvedValueOnce({ clean: false, virusName: 'EICAR' })
    const res = await makeRequest('PUT', '/virus.exe', Buffer.from('X'), {
      'Content-Type': 'application/octet-stream',
      'Content-Length': '1',
    })
    expect(res.status).toBe(422)
    expect(mockUpload).not.toHaveBeenCalled()
  })
})

describe('GET /storage — list', () => {
  it('returns file list', async () => {
    mockList.mockResolvedValueOnce([{ key: 'a.pdf', size: 100, lastModified: '2026-04-07T00:00:00Z' }])
    const res = await makeRequest('GET', '/')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ key: 'a.pdf', size: 100, lastModified: '2026-04-07T00:00:00Z' }])
  })
})

describe('GET /storage/:key — download', () => {
  it('streams file bytes with correct content-type', async () => {
    mockGet.mockResolvedValueOnce({ buffer: Buffer.from('hello'), contentType: 'text/plain' })
    const res = await makeRequest('GET', '/hello.txt')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/plain')
    expect(await res.text()).toBe('hello')
  })
  it('returns 404 when file not found', async () => {
    mockGet.mockRejectedValueOnce(Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' }))
    const res = await makeRequest('GET', '/missing.txt')
    expect(res.status).toBe(404)
  })
})

describe('DELETE /storage/:key', () => {
  it('deletes file and returns { deleted: true }', async () => {
    mockDelete.mockResolvedValueOnce(undefined)
    const res = await makeRequest('DELETE', '/old.pdf')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: true })
  })
  it('returns 404 when file not found', async () => {
    mockDelete.mockRejectedValueOnce(Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' }))
    const res = await makeRequest('DELETE', '/missing.pdf')
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd gateway && npx vitest run src/routes/storage.test.ts
```

Expected: FAIL — `storage.ts` not found

- [ ] **Step 3: Write the implementation**

```typescript
// gateway/src/routes/storage.ts
import { Hono } from 'hono'
import { embedTokenAuth } from '../middleware/auth.js'
import { storageUpload, storageGet, storageList, storageDelete } from '../services/minio.js'
import { scanBuffer } from '../services/clamav.js'
import { logger } from '../lib/logger.js'

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

const storageRouter = new Hono()
storageRouter.use('*', embedTokenAuth)

// GET /storage — list files
storageRouter.get('/', async (c) => {
  const { appId } = c.get('embedToken')
  try {
    const files = await storageList(appId)
    return c.json(files)
  } catch (err) {
    logger.error({ msg: 'storage_list_error', appId, err: String(err) })
    return c.json({ error: 'List failed' }, 500)
  }
})

// PUT /storage/:key — upload (handles nested keys like folder/file.pdf)
storageRouter.put('/:key{.+}', async (c) => {
  const { appId } = c.get('embedToken')
  const key = c.req.param('key')
  const contentType = c.req.header('Content-Type') ?? 'application/octet-stream'
  const contentLength = parseInt(c.req.header('Content-Length') ?? '0', 10)

  if (contentLength > MAX_UPLOAD_BYTES) {
    return c.json({ error: 'File too large (max 50MB)' }, 413)
  }

  try {
    const buffer = Buffer.from(await c.req.arrayBuffer())
    if (buffer.length > MAX_UPLOAD_BYTES) return c.json({ error: 'File too large (max 50MB)' }, 413)

    const scan = await scanBuffer(buffer, key)
    if (!scan.clean) {
      logger.warn({ msg: 'storage_upload_blocked', appId, key, virus: scan.virusName })
      return c.json({ error: 'File blocked by security scanner' }, 422)
    }

    await storageUpload({ appId, key, buffer, contentType })
    return c.json({ key, uploaded: true }, 201)
  } catch (err) {
    logger.error({ msg: 'storage_upload_error', appId, key, err: String(err) })
    return c.json({ error: 'Upload failed' }, 500)
  }
})

// GET /storage/:key — download (handles nested keys)
storageRouter.get('/:key{.+}', async (c) => {
  const { appId } = c.get('embedToken')
  const key = c.req.param('key')
  try {
    const { buffer, contentType } = await storageGet(appId, key)
    return new Response(buffer, { headers: { 'Content-Type': contentType } })
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'NOT_FOUND') {
      return c.json({ error: 'File not found' }, 404)
    }
    logger.error({ msg: 'storage_get_error', appId, key, err: String(err) })
    return c.json({ error: 'Download failed' }, 500)
  }
})

// DELETE /storage/:key
storageRouter.delete('/:key{.+}', async (c) => {
  const { appId } = c.get('embedToken')
  const key = c.req.param('key')
  try {
    await storageDelete(appId, key)
    return c.json({ deleted: true })
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'NOT_FOUND') {
      return c.json({ error: 'File not found' }, 404)
    }
    logger.error({ msg: 'storage_delete_error', appId, key, err: String(err) })
    return c.json({ error: 'Delete failed' }, 500)
  }
})

export { storageRouter }
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd gateway && npx vitest run src/routes/storage.test.ts
```

Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add gateway/src/routes/storage.ts gateway/src/routes/storage.test.ts
git commit -m "feat(gateway): add /storage routes for per-app file upload/download/list/delete"
```

---

## Task 6: Register routes + fix CORS

**Files:**
- Modify: `gateway/src/index.ts`

- [ ] **Step 1: Update `gateway/src/index.ts`**

Replace the existing file with:

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { proxy } from './routes/proxy.js'
import { uploadRouter } from './routes/upload.js'
import { dbRouter } from './routes/db.js'
import { storageRouter } from './routes/storage.js'
import { gatewayRateLimit } from './middleware/rate-limit.js'

const app = new Hono()

app.use('*', logger())

app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return null
      if (origin === 'https://terminalai.studioionique.com') return origin
      if (/^https:\/\/[a-z0-9-]+\.apps\.terminalai\.app$/.test(origin)) return origin
      if (/^https:\/\/[a-z0-9-]+\.apps\.terminalai\.studioionique\.com$/.test(origin)) return origin
      if (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost')) return origin
      return null
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }),
)

app.get('/health', (c) => c.json({ status: 'ok', version: '1.0.0', ts: Date.now() }))

app.use('/v1/*', gatewayRateLimit())
app.use('/db/*', gatewayRateLimit())
app.use('/storage/*', gatewayRateLimit())

app.route('/upload', uploadRouter)
app.route('/db', dbRouter)
app.route('/storage', storageRouter)
app.route('/', proxy)

const port = parseInt(process.env.PORT ?? '3001', 10)

export default {
  port,
  fetch: app.fetch,
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd gateway && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add gateway/src/index.ts
git commit -m "feat(gateway): register /db and /storage routes; expand CORS to include GET/PUT/PATCH/DELETE"
```

---

## Task 7: Deploy-manager — provisioning + migration runner

**Files:**
- Modify: `deploy-manager/src/queue/deploy-queue.ts`

- [ ] **Step 1: Add `MIGRATION_FAILED` to the error codes map**

In `deploy-manager/src/lib/deployment-error-codes.ts`, verify if the file exists and add the new code. If the error codes are defined inline in `deploy-queue.ts`, add it there. Open the file first:

```bash
cat deploy-manager/src/lib/deployment-error-codes.ts
```

Then add to the `ERROR_MESSAGES` export (wherever it is defined):

```typescript
MIGRATION_FAILED: 'Database migration failed. Check db-migrations.sql for syntax errors.',
```

- [ ] **Step 2: Add `provisionAppDb` and `runMigrations` functions to `deploy-queue.ts`**

Add the following imports at the top of `deploy-manager/src/queue/deploy-queue.ts`, after the existing imports:

```typescript
import { randomBytes } from 'crypto'
import pg from 'pg'
```

Then add these two functions after the existing helper functions (after `failDeployment`):

```typescript
/** Provision a Postgres schema and role for an app. Idempotent — skips if already provisioned. */
async function provisionAppDb(appId: string): Promise<{ schemaName: string; roleName: string }> {
  const shortId = appId.replaceAll('-', '_')
  const schemaName = `app_data_${shortId}`
  const roleName = `app_${shortId}`

  const { rows } = await db.query<{ app_id: string }>(
    `SELECT app_id FROM deployments.app_db_provisions WHERE app_id = $1`,
    [appId],
  )
  if (rows[0]) {
    logger.info({ msg: 'app_db_already_provisioned', appId, schemaName })
    return { schemaName, roleName }
  }

  const password = randomBytes(24).toString('base64url')
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! })
  const client = await pool.connect()
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`)
    // CREATE ROLE fails if role exists — use DO block to make it idempotent
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${roleName}') THEN
          CREATE ROLE "${roleName}" LOGIN PASSWORD '${password}';
        END IF;
      END
      $$;
    `)
    await client.query(`GRANT USAGE ON SCHEMA "${schemaName}" TO "${roleName}"`)
    await client.query(`
      ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}"
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${roleName}"
    `)
    await client.query(
      `INSERT INTO deployments.app_db_provisions (app_id, schema_name, role_name)
       VALUES ($1, $2, $3) ON CONFLICT (app_id) DO NOTHING`,
      [appId, schemaName, roleName],
    )
  } finally {
    client.release()
    await pool.end()
  }

  logger.info({ msg: 'app_db_provisioned', appId, schemaName, roleName })
  return { schemaName, roleName }
}

/** Run db-migrations.sql from the cloned repo against the app's schema. No-op if file absent. */
async function runMigrations(repoPath: string, schemaName: string): Promise<void> {
  let sql: string
  try {
    sql = await readFile(`${repoPath}/db-migrations.sql`, 'utf-8')
  } catch {
    // File absent — nothing to migrate
    return
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! })
  const client = await pool.connect()
  try {
    await client.query(`SET search_path TO "${schemaName}"`)
    await client.query(sql)
    logger.info({ msg: 'migrations_applied', schemaName })
  } catch (err) {
    logger.error({ msg: 'migration_failed', schemaName, err: String(err) })
    throw Object.assign(new Error('MIGRATION_FAILED'), { code: 'MIGRATION_FAILED' })
  } finally {
    client.release()
    await pool.end()
  }
}
```

- [ ] **Step 3: Call provisioning + migration in the deploy job**

Find the section in the Worker callback where `cloneRepo` and `scanForSecrets` are called (look for the deploy job flow), and insert provisioning between secrets scan and `createApp`. The new flow should be:

```typescript
// After scanForSecrets succeeds and before createApp:
await emitEvent(deploymentId, 'provisioning', 'Setting up app database...')
const { schemaName } = await provisionAppDb(appId).catch(async (err) => {
  logger.error({ msg: 'provision_failed', deploymentId, err: String(err) })
  await failDeployment(deploymentId, 'PROVISION_FAILED')
  throw err
})

await emitEvent(deploymentId, 'migrating', 'Running database migrations...')
await runMigrations(dest, schemaName).catch(async (err) => {
  await failDeployment(deploymentId, 'MIGRATION_FAILED')
  throw err
})
```

Also add `PROVISION_FAILED` to the error codes:
```typescript
PROVISION_FAILED: 'Failed to provision app database. Contact support if this persists.',
```

- [ ] **Step 4: Inject schema env var into the Coolify app creation call**

Find the `createApp` call in deploy-queue.ts and add `APP_DB_SCHEMA` to the environment variables passed to Coolify:

```typescript
// Find the existing createApp call and add to its env vars object:
APP_DB_SCHEMA: schemaName,
TERMINAL_AI_STORAGE_PREFIX: `apps/${appId}/`,
```

- [ ] **Step 5: Verify compilation**

```bash
cd deploy-manager && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add deploy-manager/src/queue/deploy-queue.ts deploy-manager/src/lib/deployment-error-codes.ts
git commit -m "feat(deploy-manager): provision app DB schema and run db-migrations.sql at deploy time"
```

---

## Task 8: Deploy-manager — app deletion cleanup

**Files:**
- Modify: `deploy-manager/src/index.ts`

- [ ] **Step 1: Add cleanup imports to `deploy-manager/src/index.ts`**

Add at the top of the file, after existing imports:

```typescript
import pg from 'pg'
import { storageDeletePrefix } from './services/storage-cleanup.js'
```

- [ ] **Step 2: Create `deploy-manager/src/services/storage-cleanup.ts`**

The deploy-manager needs to delete MinIO objects on app deletion. Rather than duplicating the full AWS4 signing from the gateway's minio.ts, add a thin HTTP client that calls the gateway's internal storage endpoint — but actually it's simpler to call MinIO directly. Create this helper:

```typescript
// deploy-manager/src/services/storage-cleanup.ts
import { createHash, createHmac } from 'crypto'

function minioConfig() {
  return {
    endpoint: process.env.MINIO_ENDPOINT ?? 'http://minio:9000',
    accessKey: process.env.MINIO_ACCESS_KEY ?? '',
    secretKey: process.env.MINIO_SECRET_KEY ?? '',
    bucket: process.env.MINIO_BUCKET ?? 'uploads',
  }
}

function sha256hex(data: string): string {
  return createHash('sha256').update(data).digest('hex')
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest()
}

function getSigningKey(secretKey: string, dateStamp: string): Buffer {
  const kDate = hmacSha256('AWS4' + secretKey, dateStamp)
  const kRegion = hmacSha256(kDate, 'us-east-1')
  const kService = hmacSha256(kRegion, 's3')
  return hmacSha256(kService, 'aws4_request')
}

function buildAuth(method: string, pathname: string, queryString: string, cfg: ReturnType<typeof minioConfig>): Record<string, string> {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  const host = new URL(cfg.endpoint).host
  const reqHeaders: Record<string, string> = { host, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash }
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalHeaders = Object.keys(reqHeaders).sort().map((k) => `${k}:${reqHeaders[k]}\n`).join('')
  const canonicalRequest = [method, pathname, queryString, canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const credentialScope = `${dateStamp}/us-east-1/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256hex(canonicalRequest)].join('\n')
  const signature = hmacSha256(getSigningKey(cfg.secretKey, dateStamp), stringToSign).toString('hex')
  return {
    ...reqHeaders,
    Authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }
}

async function listPrefix(appId: string): Promise<string[]> {
  const cfg = minioConfig()
  const prefix = `apps/${appId}/`
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}`)
  url.searchParams.set('list-type', '2')
  url.searchParams.set('prefix', prefix)
  const sortedQuery = Array.from(url.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  const headers = buildAuth('GET', `/${cfg.bucket}`, sortedQuery, cfg)
  const res = await fetch(url.toString(), { method: 'GET', headers })
  if (!res.ok) return []
  const xml = await res.text()
  return (xml.match(/<Key>(.*?)<\/Key>/g) ?? []).map((m) => m.replace(/<\/?Key>/g, ''))
}

async function deleteKey(key: string): Promise<void> {
  const cfg = minioConfig()
  const pathname = `/${cfg.bucket}/${key}`
  const url = new URL(`${cfg.endpoint}${pathname}`)
  const headers = buildAuth('DELETE', pathname, '', cfg)
  await fetch(url.toString(), { method: 'DELETE', headers })
}

export async function storageDeletePrefix(appId: string): Promise<void> {
  const keys = await listPrefix(appId)
  for (const key of keys) await deleteKey(key)
}
```

- [ ] **Step 3: Extend `DELETE /apps/:appId` in `deploy-manager/src/index.ts`**

Find the `app.delete('/apps/:appId', ...)` handler. Add the following at the end of the try block, after existing DB deletions:

```typescript
// Drop app DB schema and role
const provResult = await db.query<{ schema_name: string; role_name: string }>(
  `SELECT schema_name, role_name FROM deployments.app_db_provisions WHERE app_id = $1`,
  [appId],
)
if (provResult.rows[0]) {
  const { schema_name: schemaName, role_name: roleName } = provResult.rows[0]
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! })
  const client = await pool.connect()
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
    await client.query(`DROP ROLE IF EXISTS "${roleName}"`)
  } finally {
    client.release()
    await pool.end()
  }
  await db.query(`DELETE FROM deployments.app_db_provisions WHERE app_id = $1`, [appId])
  logger.info({ msg: 'app_db_dropped', appId, schemaName })
}

// Delete storage prefix
await storageDeletePrefix(appId).catch((err: unknown) => {
  logger.warn({ msg: 'storage_prefix_delete_failed', appId, err: String(err) })
})
```

- [ ] **Step 4: Verify compilation**

```bash
cd deploy-manager && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add deploy-manager/src/index.ts deploy-manager/src/services/storage-cleanup.ts
git commit -m "feat(deploy-manager): drop app DB schema, role, and storage prefix on app deletion"
```

---

## Task 9: MCP scaffold updates

**Files:**
- Modify: `mcp-server/src/tools/scaffold.ts`

- [ ] **Step 1: Add SDK template constants**

Add the following constants to `scaffold.ts` after the existing `GATEWAY_SDK` constant:

```typescript
const DB_MIGRATIONS_TEMPLATE = `-- db-migrations.sql
-- This file runs once at deploy time against your app's isolated Postgres schema.
-- Do not use schema-qualified names — the schema is set automatically.
-- Add your CREATE TABLE statements here.

CREATE TABLE IF NOT EXISTS items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data       JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`

const DB_SDK = `// lib/db.ts — Terminal AI Database SDK (server-side only)
// Calls /db/* on the Terminal AI gateway using the embed token.
// The embed token is received from the viewer shell via postMessage (see useEmbedToken hook).

const GATEWAY_URL = process.env.TERMINAL_AI_GATEWAY_URL!

async function dbRequest(method: string, path: string, body?: unknown, embedToken: string = ''): Promise<Response> {
  const res = await fetch(\`\${GATEWAY_URL}/db/\${path}\`, {
    method,
    headers: { Authorization: \`Bearer \${embedToken}\`, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error((err as { error: string }).error ?? \`DB error \${res.status}\`)
  }
  return res
}

export async function dbList<T = Record<string, unknown>>(table: string, filters: Record<string, string> = {}, embedToken: string): Promise<T[]> {
  const params = new URLSearchParams(filters)
  const res = await dbRequest('GET', \`\${table}?\${params}\`, undefined, embedToken)
  return res.json() as Promise<T[]>
}

export async function dbGet<T = Record<string, unknown>>(table: string, id: string, embedToken: string): Promise<T> {
  const res = await dbRequest('GET', \`\${table}/\${id}\`, undefined, embedToken)
  return res.json() as Promise<T>
}

export async function dbInsert<T = Record<string, unknown>>(table: string, row: Record<string, unknown>, embedToken: string): Promise<T> {
  const res = await dbRequest('POST', table, row, embedToken)
  return res.json() as Promise<T>
}

export async function dbUpdate<T = Record<string, unknown>>(table: string, id: string, patch: Record<string, unknown>, embedToken: string): Promise<T> {
  const res = await dbRequest('PATCH', \`\${table}/\${id}\`, patch, embedToken)
  return res.json() as Promise<T>
}

export async function dbDelete(table: string, id: string, embedToken: string): Promise<void> {
  await dbRequest('DELETE', \`\${table}/\${id}\`, undefined, embedToken)
}
`

const STORAGE_SDK = `// lib/storage.ts — Terminal AI Storage SDK (server-side only)
// Calls /storage/* on the Terminal AI gateway using the embed token.

const GATEWAY_URL = process.env.TERMINAL_AI_GATEWAY_URL!

export async function storageUpload(key: string, buffer: Buffer, contentType: string, embedToken: string): Promise<{ key: string }> {
  const res = await fetch(\`\${GATEWAY_URL}/storage/\${key}\`, {
    method: 'PUT',
    headers: { Authorization: \`Bearer \${embedToken}\`, 'Content-Type': contentType },
    body: buffer,
  })
  if (!res.ok) throw new Error(\`Storage upload failed: \${res.status}\`)
  return res.json() as Promise<{ key: string }>
}

export async function storageGet(key: string, embedToken: string): Promise<Response> {
  const res = await fetch(\`\${GATEWAY_URL}/storage/\${key}\`, {
    headers: { Authorization: \`Bearer \${embedToken}\` },
  })
  if (!res.ok) throw new Error(\`Storage get failed: \${res.status}\`)
  return res
}

export async function storageList(embedToken: string): Promise<Array<{ key: string; size: number; lastModified: string }>> {
  const res = await fetch(\`\${GATEWAY_URL}/storage\`, {
    headers: { Authorization: \`Bearer \${embedToken}\` },
  })
  if (!res.ok) throw new Error(\`Storage list failed: \${res.status}\`)
  return res.json() as Promise<Array<{ key: string; size: number; lastModified: string }>>
}

export async function storageDelete(key: string, embedToken: string): Promise<void> {
  const res = await fetch(\`\${GATEWAY_URL}/storage/\${key}\`, {
    method: 'DELETE',
    headers: { Authorization: \`Bearer \${embedToken}\` },
  })
  if (!res.ok) throw new Error(\`Storage delete failed: \${res.status}\`)
}
`
```

- [ ] **Step 2: Inject SDK files and migration template into `buildNextjsFiles`**

In the `buildNextjsFiles` function, add before the `return files` line:

```typescript
// Always inject DB and storage SDKs — every app has access to these
files['lib/db.ts'] = DB_SDK
files['lib/storage.ts'] = STORAGE_SDK
files['db-migrations.sql'] = DB_MIGRATIONS_TEMPLATE
```

- [ ] **Step 3: Update `scaffoldApp` return value**

In `scaffoldApp`, update `required_env_vars` and `notes`:

```typescript
return {
  files,
  instructions: '1. Clone this scaffold\n2. Add your logic\n3. Edit db-migrations.sql to define your tables\n4. Ensure next.config.js has output: "standalone"\n5. Push to GitHub\n6. Deploy via Terminal AI: use create_channel then deploy_app',
  required_env_vars: ['TERMINAL_AI_GATEWAY_URL', 'TERMINAL_AI_APP_ID'],
  notes: [
    'CRITICAL: Use the useEmbedToken() hook in your root client component to receive the auth token from the Terminal AI viewer shell via postMessage',
    'Pass the embed token from the client to your API routes, which forward it as Bearer token to the gateway',
    'Do NOT call OpenAI/Anthropic directly — all AI calls go through TERMINAL_AI_GATEWAY_URL',
    'Your app has an isolated Postgres schema — edit db-migrations.sql to define your tables before first deploy. Tables are created automatically at deploy time.',
    'Your app has an isolated storage prefix — use lib/storage.ts helpers to upload, download, list, and delete files via the gateway',
    'Health endpoint is required and must return 200',
    'Never store the embed token in localStorage or cookies',
    'The token expires after 15 minutes — the viewer shell auto-refreshes it via postMessage',
  ],
}
```

- [ ] **Step 4: Verify compilation**

```bash
cd mcp-server && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Run existing scaffold tests**

```bash
cd mcp-server && npx vitest run src/tools/scaffold.test.ts
```

Expected: all existing tests PASS (no regressions)

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/tools/scaffold.ts
git commit -m "feat(mcp): inject db-migrations.sql, db-sdk, and storage-sdk into scaffolded apps"
```

---

## Task 10: Deploy and smoke test

- [ ] **Step 1: Build and push gateway + deploy-manager + mcp-server**

```bash
git push origin main
```

Then on VPS1:

```bash
cd /opt/terminal-ai
git pull
docker compose build gateway deploy-manager mcp-server
docker compose up -d gateway deploy-manager mcp-server
```

- [ ] **Step 2: Verify gateway health**

```bash
curl https://gateway.terminalai.studioionique.com/health
```

Expected: `{"status":"ok","version":"1.0.0","ts":<timestamp>}`

- [ ] **Step 3: Smoke test DB route (requires a live app embed token)**

```bash
# Replace TOKEN with a real embed token from an active app session
curl -X GET https://gateway.terminalai.studioionique.com/db/items \
  -H "Authorization: Bearer TOKEN"
```

Expected: `{"error":"Table 'items' not found"}` — correct, no migration has run yet for this app

- [ ] **Step 4: Smoke test storage list**

```bash
curl -X GET https://gateway.terminalai.studioionique.com/storage \
  -H "Authorization: Bearer TOKEN"
```

Expected: `[]` — empty list, no files yet

- [ ] **Step 5: Verify a new app deployment provisions schema**

Deploy a new app through the creator dashboard. After deployment completes:

```bash
docker exec terminal-ai-postgres-1 psql -U postgres -d terminalai \
  -c "SELECT * FROM deployments.app_db_provisions;"
```

Expected: a row for the newly deployed app with schema_name and role_name populated

```bash
docker exec terminal-ai-postgres-1 psql -U postgres -d terminalai \
  -c "\dn app_data*"
```

Expected: the app's schema listed

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "chore: smoke test complete — app DB and storage feature live"
```
