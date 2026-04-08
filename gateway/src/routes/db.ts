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
