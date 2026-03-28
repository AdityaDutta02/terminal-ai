/**
 * Internal service authentication helpers.
 * Used by platform API routes that are only callable by internal services
 * (mcp-server, deploy-manager) — not exposed to end users.
 *
 * Callers must provide:
 *   X-Service-Token: <INTERNAL_SERVICE_TOKEN env var>
 *   X-Creator-Id: <better-auth user id of the creator>
 */

export function validateServiceToken(req: Request): boolean {
  const expected = process.env.INTERNAL_SERVICE_TOKEN
  if (!expected) return false
  const provided = req.headers.get('X-Service-Token')
  return provided === expected
}

export function getCreatorIdFromRequest(req: Request): string | null {
  return req.headers.get('X-Creator-Id')
}

export function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}
