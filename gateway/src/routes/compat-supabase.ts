import { Hono } from 'hono'
import { db } from '../db.js'
import { logger } from '../lib/logger.js'
import { storageUpload, storageGet, storageList, storageDelete } from '../services/minio.js'
import {
  validateTable,
  validateColumns,
  toSchemaName,
  ValidationError,
} from '../lib/db-validator.js'
import { parseFilters, buildWhereClause, PostgRestParseError } from '../lib/postgrest-parser.js'

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

    const raw = c.req.queries()
    const queryParams = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v[0]]))

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

    const rawUpdate = c.req.queries()
    const queryParams = Object.fromEntries(Object.entries(rawUpdate).map(([k, v]) => [k, v[0]]))
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

    const rawDelete = c.req.queries()
    const queryParams = Object.fromEntries(Object.entries(rawDelete).map(([k, v]) => [k, v[0]]))
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
// List must be registered before the generic :bucket/:key pattern to avoid ambiguity
compatSupabaseRouter.get('/storage/v1/object/list/:bucket', async (c) => {
  const { appId } = c.get('embedToken')
  const bucket = c.req.param('bucket')
  const prefix = `${bucket}/`
  const items = await storageList(appId)
  const filtered = items.filter((item) => item.key.startsWith(prefix))
  return c.json(filtered.map((item) => ({ name: item.key.slice(prefix.length), key: item.key })))
})

compatSupabaseRouter.put('/storage/v1/object/:bucket/:key{.+}', async (c) => {
  const { appId } = c.get('embedToken')
  const bucket = c.req.param('bucket')
  const key = c.req.param('key')
  const fullKey = `${bucket}/${key}`
  const contentType = c.req.header('content-type') ?? 'application/octet-stream'
  const buffer = Buffer.from(await c.req.arrayBuffer())
  await storageUpload({ appId, key: fullKey, buffer, contentType })
  return c.json({ key: fullKey })
})

compatSupabaseRouter.get('/storage/v1/object/:bucket/:key{.+}', async (c) => {
  const { appId } = c.get('embedToken')
  const bucket = c.req.param('bucket')
  const key = c.req.param('key')
  const fullKey = `${bucket}/${key}`
  const { buffer, contentType } = await storageGet(appId, fullKey)
  return new Response(buffer, {
    headers: { 'Content-Type': contentType },
  })
})

compatSupabaseRouter.delete('/storage/v1/object/:bucket/:key{.+}', async (c) => {
  const { appId } = c.get('embedToken')
  const bucket = c.req.param('bucket')
  const key = c.req.param('key')
  const fullKey = `${bucket}/${key}`
  await storageDelete(appId, fullKey)
  return c.json({ deleted: true })
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
