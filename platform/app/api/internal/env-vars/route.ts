import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  validateServiceToken,
  getCreatorIdFromRequest,
  unauthorizedResponse,
} from '@/lib/internal-auth'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { encryptValue, decryptValue } from '@/lib/env-crypto'

// Keys that are injected by the platform and must not be overridden.
const FORBIDDEN_KEYS = new Set([
  'TERMINAL_AI_GATEWAY_URL',
  'TERMINAL_AI_APP_ID',
  'APP_DB_SCHEMA',
  'TERMINAL_AI_STORAGE_PREFIX',
])

const ENV_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/
const MAX_VARS_PER_APP = 50

const upsertBodySchema = z.object({
  appId: z.string().uuid(),
  key: z.string().min(1).max(256),
  value: z.string().max(65536),
})

const deleteBodySchema = z.object({
  appId: z.string().uuid(),
  key: z.string().min(1).max(256),
})

interface AppEnvVarRow extends Record<string, unknown> {
  key: string
  value_enc: string
  iv: string
  updated_at: string
}

interface AppOwnershipRow extends Record<string, unknown> {
  id: string
}

interface EnvVarCountRow extends Record<string, unknown> {
  count: string
}

interface DeletedCountRow extends Record<string, unknown> {
  count: string
}

/**
 * Verifies the app exists and belongs to the given creator.
 * Returns a 403 NextResponse on failure, or null on success.
 */
async function verifyAppOwnership(appId: string, creatorId: string): Promise<NextResponse | null> {
  const result = await db.query<AppOwnershipRow>(
    `SELECT a.id
     FROM marketplace.apps a
     JOIN marketplace.channels c ON c.id = a.channel_id
     WHERE a.id = $1 AND c.creator_id = $2 AND a.deleted_at IS NULL`,
    [appId, creatorId],
  )
  if (!result.rows[0]) {
    return NextResponse.json({ error: 'App not found or not owned by creator' }, { status: 403 })
  }
  return null
}

/**
 * Validates that the key format is acceptable and not platform-reserved.
 * Returns a 400 NextResponse on validation failure, or null if valid.
 */
function validateEnvKey(key: string): NextResponse | null {
  if (!ENV_KEY_PATTERN.test(key)) {
    return NextResponse.json(
      {
        error:
          'Invalid key format. Keys must start with a letter or underscore and contain only uppercase letters, digits, and underscores.',
      },
      { status: 400 },
    )
  }
  if (FORBIDDEN_KEYS.has(key)) {
    return NextResponse.json(
      { error: `Key "${key}" is reserved by the platform and cannot be set.` },
      { status: 400 },
    )
  }
  return null
}

/**
 * GET /api/internal/env-vars?appId=<uuid>
 * Lists all env vars for the app with decrypted values.
 * Auth: service token only (no creator ID required for reads).
 */
export async function GET(req: Request): Promise<Response> {
  if (!validateServiceToken(req)) return unauthorizedResponse()

  const url = new URL(req.url)
  const appId = url.searchParams.get('appId')

  if (!appId || !/^[0-9a-f-]{36}$/i.test(appId)) {
    return NextResponse.json({ error: 'Missing or invalid appId query parameter' }, { status: 400 })
  }

  let rows: AppEnvVarRow[]
  try {
    const result = await db.query<AppEnvVarRow>(
      `SELECT key, value_enc, iv, updated_at
       FROM deployments.app_env_vars
       WHERE app_id = $1
       ORDER BY key ASC`,
      [appId],
    )
    rows = result.rows
  } catch (err: unknown) {
    logger.error({ msg: 'internal_env_vars_list_failed', appId, err: String(err) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  const vars = rows.map((row) => {
    let value = ''
    try {
      value = decryptValue(row.value_enc, row.iv)
    } catch (err: unknown) {
      logger.error({
        msg: 'internal_env_var_decrypt_failed',
        appId,
        key: row.key,
        err: String(err),
      })
    }
    return { key: row.key, value, updatedAt: row.updated_at }
  })

  logger.info({ msg: 'internal_env_vars_listed', appId, count: vars.length })
  return NextResponse.json({ vars })
}

/**
 * POST /api/internal/env-vars
 * Upserts an env var. Requires service token + creator ID ownership check.
 * Body: { appId: string; key: string; value: string }
 */
export async function POST(req: Request): Promise<Response> {
  if (!validateServiceToken(req)) return unauthorizedResponse()

  const creatorId = getCreatorIdFromRequest(req)
  if (!creatorId) {
    return NextResponse.json({ error: 'Missing X-Creator-Id header' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = upsertBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { appId, key, value } = parsed.data

  const keyError = validateEnvKey(key)
  if (keyError) return keyError

  const denied = await verifyAppOwnership(appId, creatorId)
  if (denied) return denied

  // Check if this is a new key and enforce the max-vars limit.
  let isNewKey = false
  try {
    const existsResult = await db.query<AppOwnershipRow>(
      `SELECT id FROM deployments.app_env_vars WHERE app_id = $1 AND key = $2`,
      [appId, key],
    )
    isNewKey = !existsResult.rows[0]
  } catch (err: unknown) {
    logger.error({ msg: 'internal_env_var_key_check_failed', appId, key, err: String(err) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  if (isNewKey) {
    try {
      const countResult = await db.query<EnvVarCountRow>(
        `SELECT COUNT(*) AS count FROM deployments.app_env_vars WHERE app_id = $1`,
        [appId],
      )
      const count = parseInt(countResult.rows[0]?.count ?? '0', 10)
      if (count >= MAX_VARS_PER_APP) {
        return NextResponse.json(
          { error: `Maximum of ${MAX_VARS_PER_APP} environment variables per app reached.` },
          { status: 429 },
        )
      }
    } catch (err: unknown) {
      logger.error({ msg: 'internal_env_var_count_failed', appId, err: String(err) })
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }

  let encrypted: string
  let iv: string
  try {
    const enc = encryptValue(value)
    encrypted = enc.encrypted
    iv = enc.iv
  } catch (err: unknown) {
    logger.error({ msg: 'internal_env_var_encrypt_failed', appId, key, err: String(err) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  let updatedAt: string
  try {
    const upsertResult = await db.query<{ updated_at: string }>(
      `INSERT INTO deployments.app_env_vars (app_id, key, value_enc, iv)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (app_id, key)
       DO UPDATE SET value_enc = $3, iv = $4, updated_at = now()
       RETURNING updated_at`,
      [appId, key, encrypted, iv],
    )
    updatedAt = upsertResult.rows[0].updated_at
  } catch (err: unknown) {
    logger.error({ msg: 'internal_env_var_upsert_failed', appId, key, err: String(err) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  logger.info({ msg: 'internal_env_var_upserted', appId, key, creatorId, isNewKey })
  return NextResponse.json({ key, value, updatedAt })
}

/**
 * DELETE /api/internal/env-vars
 * Deletes an env var. Requires service token + creator ID ownership check.
 * Body: { appId: string; key: string }
 */
export async function DELETE(req: Request): Promise<Response> {
  if (!validateServiceToken(req)) return unauthorizedResponse()

  const creatorId = getCreatorIdFromRequest(req)
  if (!creatorId) {
    return NextResponse.json({ error: 'Missing X-Creator-Id header' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = deleteBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { appId, key } = parsed.data

  const denied = await verifyAppOwnership(appId, creatorId)
  if (denied) return denied

  let deletedCount: number
  try {
    const result = await db.query<DeletedCountRow>(
      `WITH deleted AS (
         DELETE FROM deployments.app_env_vars
         WHERE app_id = $1 AND key = $2
         RETURNING id
       )
       SELECT COUNT(*) AS count FROM deleted`,
      [appId, key],
    )
    deletedCount = parseInt(result.rows[0]?.count ?? '0', 10)
  } catch (err: unknown) {
    logger.error({ msg: 'internal_env_var_delete_failed', appId, key, creatorId, err: String(err) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  if (deletedCount === 0) {
    return NextResponse.json({ error: 'Environment variable not found' }, { status: 404 })
  }

  logger.info({ msg: 'internal_env_var_deleted', appId, key, creatorId })
  return NextResponse.json({ deleted: true })
}
