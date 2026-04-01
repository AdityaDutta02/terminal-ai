import { db } from './db'
import { logger } from './logger'

export { ERROR_MESSAGES } from './deployment-error-codes'

export async function emitEvent(
  deploymentId: string,
  eventType: string,
  message: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO deployments.deployment_events (deployment_id, event_type, message, metadata)
       VALUES ($1, $2, $3, $4)`,
      [deploymentId, eventType, message, metadata ? JSON.stringify(metadata) : null],
    )

    await db.query(
      `UPDATE deployments.deployments
       SET log_lines = array_append(COALESCE(log_lines, '{}'), $1::jsonb)
       WHERE id = $2`,
      [
        JSON.stringify({ event_type: eventType, message, metadata: metadata ?? null, ts: new Date().toISOString() }),
        deploymentId,
      ],
    )
  } catch (err) {
    logger.warn({
      msg: 'emitEvent failed — non-fatal, continuing',
      deploymentId,
      eventType,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
