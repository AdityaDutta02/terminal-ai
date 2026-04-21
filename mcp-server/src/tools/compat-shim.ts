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
