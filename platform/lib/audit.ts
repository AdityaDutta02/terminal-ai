import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
interface AuditEvent {
  actorId?: string
  action: string
  resource?: string
  resourceId?: string
  ip?: string
  metadata?: Record<string, unknown>
}
export async function auditLog(event: AuditEvent): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit.events (actor_id, action, resource, resource_id, ip, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        event.actorId ?? null,
        event.action,
        event.resource ?? null,
        event.resourceId ?? null,
        event.ip ?? null,
        event.metadata ? JSON.stringify(event.metadata) : null,
      ],
    )
  } catch (err) {
    logger.error({ msg: 'audit_log_failed', err: String(err), event })
  }
}
