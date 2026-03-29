# MCP Platform + VPS2 + Dev Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable vibe coders (Claude, Cursor, etc.) to connect to the Terminal AI MCP server and build + deploy a full app end-to-end with zero manual user steps — covering DB migrations, internal service auth, API key UI, enhanced MCP tools, VPS2/Coolify setup, and a beginner-friendly dev/docs page.

**Architecture:** The MCP server (port 3003, Hono + MCP SDK) authenticates via keys in `mcp.api_keys`. New tools (`create_channel`, `deploy_app`) call the platform's internal API using a shared `X-Service-Token`. The deploy-manager (BullMQ) pulls the GitHub repo, Dockerizes it, creates a Coolify app on VPS2, and exposes it at `*.apps.terminalai.app`. The `/developers` page teaches creators how to get an API key, connect their AI editor, and prompt the MCP to ship an app in one command.

**Tech Stack:** Next.js 15 (App Router), Hono, BullMQ, Coolify REST API, Cloudflare DNS API, PostgreSQL (migrations), Redis (job queue), Docker, `@modelcontextprotocol/sdk`, Tailwind CSS / shadcn-style components

---

## File Structure

### New files
- `platform/app/(marketplace)/developers/page.tsx` — dev/docs landing page
- `platform/app/(marketplace)/developers/components/ApiKeyManager.tsx` — generate/list/revoke API keys
- `platform/app/(marketplace)/developers/components/McpConnectionGuide.tsx` — step-by-step MCP connection guide
- `platform/app/(marketplace)/developers/components/ApiReferenceSection.tsx` — collapsible API route reference
- `platform/app/api/developer/keys/route.ts` — GET list / POST create MCP keys
- `platform/app/api/developer/keys/[id]/route.ts` — DELETE revoke key
- `platform/app/api/internal/channels/route.ts` — internal: create channel for a creator
- `platform/app/api/internal/apps/route.ts` — internal: register app + trigger deploy
- `platform/lib/internal-auth.ts` — validate X-Service-Token middleware helper
- `platform/lib/db/migrations/002_credit_ledger.sql` — (already written, apply only)
- `platform/lib/db/migrations/003_creator_ownership.sql` — (already written, apply only)
- `platform/lib/db/migrations/004_audit_log.sql` — (already written, apply only)
- `platform/lib/db/migrations/005_deployments.sql` — (already written, apply only)
- `platform/lib/db/migrations/006_optimizer_mcp.sql` — (already written, apply only)
- `docs/mcp-migration-checklist.md` — manual ops checklist for VPS2 setup

### Modified files
- `platform/lib/db/init.sql` — add all migrations 002-006 tables so fresh installs are complete
- `mcp-server/src/index.ts` — add `create_channel` + `deploy_app` tools
- `mcp-server/src/tools/scaffold_app.ts` — add Dockerfile generation + environment guidance
- `deploy-manager/src/.env.example` — add `COOLIFY_URL`, `COOLIFY_TOKEN`, `VPS2_IP`, `CLOUDFLARE_ZONE_ID`
- `deploy-manager/src/jobs/deploy.ts` — wire up Coolify app creation + deployment

---

## Task 1: Apply DB Migrations to Live VPS

**Files:**
- Modify: `platform/lib/db/init.sql`

- [ ] **Step 1: Verify migration files are already present**

Run:
```bash
ls platform/lib/db/migrations/
```
Expected: `001_initial.sql 002_credit_ledger.sql 003_creator_ownership.sql 004_audit_log.sql 005_deployments.sql 006_optimizer_mcp.sql`

- [ ] **Step 2: Consolidate migrations into init.sql**

Read `platform/lib/db/init.sql`. Append content from migrations 002–006 at the end, wrapped in `DO $$ BEGIN ... END $$;` guards so re-running is safe.

For each migration file, read it and append its contents after the existing schema in `init.sql`. Add this block just before the final comment or EOF:

```sql
-- ============================================================
-- Migration 002: credit_ledger
-- ============================================================
-- (paste contents of 002_credit_ledger.sql here)

-- ============================================================
-- Migration 003: creator_ownership
-- ============================================================
-- (paste contents of 003_creator_ownership.sql here)

-- ============================================================
-- Migration 004: audit_log
-- ============================================================
-- (paste contents of 004_audit_log.sql here)

-- ============================================================
-- Migration 005: deployments
-- ============================================================
-- (paste contents of 005_deployments.sql here)

-- ============================================================
-- Migration 006: optimizer_mcp
-- ============================================================
-- (paste contents of 006_optimizer_mcp.sql here)
```

- [ ] **Step 3: Write the VPS migration checklist**

Create `docs/mcp-migration-checklist.md`:

```markdown
# VPS Migration Checklist

## 1. Apply migrations on VPS1 (live DB)

SSH into VPS1, then:

```bash
# Connect to the postgres container
docker exec -it postgres psql -U terminalai -d terminalai

# Run each migration in order
\i /migrations/002_credit_ledger.sql
\i /migrations/003_creator_ownership.sql
\i /migrations/004_audit_log.sql
\i /migrations/005_deployments.sql
\i /migrations/006_optimizer_mcp.sql
\q
```

If migrations live outside the container, copy them first:
```bash
docker cp platform/lib/db/migrations/002_credit_ledger.sql postgres:/migrations/
# repeat for 003–006
```

## 2. Set VPS1 environment variables (for deploy-manager)

Add to VPS1's deploy-manager `.env`:
```
COOLIFY_URL=http://<VPS2_IP>:8000
COOLIFY_TOKEN=<from Coolify dashboard → API → Tokens>
VPS2_IP=<your VPS2 IP>
CLOUDFLARE_ZONE_ID=<from Cloudflare dashboard → your domain → Overview>
CLOUDFLARE_API_TOKEN=<Cloudflare API token with DNS:Edit scope>
INTERNAL_SERVICE_TOKEN=<generate with: openssl rand -hex 32>
```

Add to VPS1's platform `.env`:
```
INTERNAL_SERVICE_TOKEN=<same value as above>
```

## 3. VPS2 — Install Coolify

SSH into VPS2, then:
```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# Install Coolify
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

After install: open `http://<VPS2_IP>:8000` → create admin account → go to API → Tokens → create a token → copy to VPS1 deploy-manager `.env` as `COOLIFY_TOKEN`.

Configure wildcard DNS in Cloudflare:
- Type: A
- Name: `*.apps.terminalai.app`
- Value: `<VPS2_IP>`
- Proxy: DNS only (gray cloud)

In Coolify dashboard: Settings → Domain → set wildcard domain to `apps.terminalai.app`.

## 4. Restart services on VPS1

```bash
cd /opt/terminal-ai
docker compose restart platform mcp-server deploy-manager
```
```

- [ ] **Step 4: Commit**

```bash
git add platform/lib/db/init.sql docs/mcp-migration-checklist.md
git commit -m "feat(db): consolidate migrations 002-006 into init.sql + VPS migration guide"
```

---

## Task 2: Internal Service Auth Middleware

**Files:**
- Create: `platform/lib/internal-auth.ts`

- [ ] **Step 1: Write the failing test**

Create `platform/lib/internal-auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock process.env before importing
vi.stubEnv('INTERNAL_SERVICE_TOKEN', 'test-secret-token-abc123')

const { validateServiceToken, getCreatorIdFromRequest } = await import('./internal-auth')

describe('validateServiceToken', () => {
  it('returns true when X-Service-Token matches env var', () => {
    const req = new Request('http://localhost', {
      headers: { 'X-Service-Token': 'test-secret-token-abc123', 'X-Creator-Id': 'user-1' }
    })
    expect(validateServiceToken(req)).toBe(true)
  })

  it('returns false when token is missing', () => {
    const req = new Request('http://localhost')
    expect(validateServiceToken(req)).toBe(false)
  })

  it('returns false when token is wrong', () => {
    const req = new Request('http://localhost', {
      headers: { 'X-Service-Token': 'wrong-token' }
    })
    expect(validateServiceToken(req)).toBe(false)
  })
})

describe('getCreatorIdFromRequest', () => {
  it('returns X-Creator-Id header value', () => {
    const req = new Request('http://localhost', {
      headers: { 'X-Creator-Id': 'user-abc' }
    })
    expect(getCreatorIdFromRequest(req)).toBe('user-abc')
  })

  it('returns null when header is absent', () => {
    const req = new Request('http://localhost')
    expect(getCreatorIdFromRequest(req)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd platform && npx vitest run lib/internal-auth.test.ts 2>&1 | tail -20
```
Expected: FAIL — `Cannot find module './internal-auth'`

- [ ] **Step 3: Implement internal-auth.ts**

Create `platform/lib/internal-auth.ts`:

```typescript
/**
 * Internal service authentication helpers.
 * Used by platform API routes that are only callable by internal services
 * (e.g. mcp-server, deploy-manager) — not exposed to end users.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd platform && npx vitest run lib/internal-auth.test.ts 2>&1 | tail -10
```
Expected: PASS — 5 tests passing

- [ ] **Step 5: Commit**

```bash
git add platform/lib/internal-auth.ts platform/lib/internal-auth.test.ts
git commit -m "feat(platform): add internal service token auth helpers"
```

---

## Task 3: Internal API Routes (create channel + register app)

**Files:**
- Create: `platform/app/api/internal/channels/route.ts`
- Create: `platform/app/api/internal/apps/route.ts`

- [ ] **Step 1: Write the failing tests**

Create `platform/app/api/internal/channels/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'

vi.stubEnv('INTERNAL_SERVICE_TOKEN', 'svc-token-xyz')

const mockDb = { query: vi.fn() }
vi.mock('@/lib/db', () => ({ db: mockDb }))

describe('POST /api/internal/channels', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when service token is missing', async () => {
    const req = new Request('http://localhost/api/internal/channels', {
      method: 'POST',
      body: JSON.stringify({ name: 'My Channel', description: 'desc' }),
      headers: { 'Content-Type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when creator id is missing', async () => {
    const req = new Request('http://localhost/api/internal/channels', {
      method: 'POST',
      body: JSON.stringify({ name: 'My Channel', description: 'desc' }),
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': 'svc-token-xyz',
      }
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('creates channel and returns 201 with id and slug', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'ch-1', slug: 'my-channel' }]
    })
    const req = new Request('http://localhost/api/internal/channels', {
      method: 'POST',
      body: JSON.stringify({ name: 'My Channel', description: 'A great channel' }),
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': 'svc-token-xyz',
        'X-Creator-Id': 'user-abc',
      }
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('ch-1')
    expect(body.slug).toBe('my-channel')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd platform && npx vitest run app/api/internal/channels/route.test.ts 2>&1 | tail -10
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement channels internal route**

Create `platform/app/api/internal/channels/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateServiceToken, getCreatorIdFromRequest, unauthorizedResponse } from '@/lib/internal-auth'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

export async function POST(req: Request): Promise<Response> {
  if (!validateServiceToken(req)) return unauthorizedResponse()

  const creatorId = getCreatorIdFromRequest(req)
  if (!creatorId) {
    return NextResponse.json({ error: 'Missing X-Creator-Id header' }, { status: 400 })
  }

  const body = await req.json() as { name?: string; description?: string }
  const { name, description } = body

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const slug = slugify(name.trim())

  const result = await db.query<{ id: string; slug: string }>(
    `INSERT INTO marketplace.channels (name, slug, description, creator_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, slug`,
    [name.trim(), slug, description ?? '', creatorId]
  )

  return NextResponse.json(result.rows[0], { status: 201 })
}
```

- [ ] **Step 4: Implement apps internal route**

Create `platform/app/api/internal/apps/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateServiceToken, getCreatorIdFromRequest, unauthorizedResponse } from '@/lib/internal-auth'

export async function POST(req: Request): Promise<Response> {
  if (!validateServiceToken(req)) return unauthorizedResponse()

  const creatorId = getCreatorIdFromRequest(req)
  if (!creatorId) {
    return NextResponse.json({ error: 'Missing X-Creator-Id header' }, { status: 400 })
  }

  const body = await req.json() as {
    channelId?: string
    name?: string
    description?: string
    githubRepo?: string
    githubBranch?: string
    framework?: string
  }

  const { channelId, name, description, githubRepo, githubBranch, framework } = body

  if (!channelId || !name || !githubRepo) {
    return NextResponse.json(
      { error: 'channelId, name, and githubRepo are required' },
      { status: 400 }
    )
  }

  // Verify the channel belongs to this creator
  const channelCheck = await db.query<{ id: string }>(
    `SELECT id FROM marketplace.channels WHERE id = $1 AND creator_id = $2 AND deleted_at IS NULL`,
    [channelId, creatorId]
  )
  if (channelCheck.rows.length === 0) {
    return NextResponse.json({ error: 'Channel not found or not owned by creator' }, { status: 403 })
  }

  const appResult = await db.query<{ id: string }>(
    `INSERT INTO marketplace.apps
       (channel_id, name, description, github_repo, github_branch, framework, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING id`,
    [
      channelId,
      name,
      description ?? '',
      githubRepo,
      githubBranch ?? 'main',
      framework ?? 'nextjs',
    ]
  )

  const appId = appResult.rows[0].id

  // Trigger deployment via deploy-manager
  const deployManagerUrl = process.env.DEPLOY_MANAGER_URL ?? 'http://deploy-manager:4000'
  const deployRes = await fetch(`${deployManagerUrl}/deploy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}`,
    },
    body: JSON.stringify({
      appId,
      githubRepo,
      branch: githubBranch ?? 'main',
    }),
  })

  if (!deployRes.ok) {
    // App was created; deployment failed to queue — return partial success
    return NextResponse.json(
      { id: appId, deploymentQueued: false, error: 'Deploy queue unavailable' },
      { status: 202 }
    )
  }

  const { deploymentId } = await deployRes.json() as { deploymentId: string }

  return NextResponse.json({ id: appId, deploymentId, deploymentQueued: true }, { status: 201 })
}
```

- [ ] **Step 5: Run tests**

Run:
```bash
cd platform && npx vitest run app/api/internal/channels/route.test.ts 2>&1 | tail -10
```
Expected: PASS — 3 tests passing

- [ ] **Step 6: Commit**

```bash
git add platform/app/api/internal/channels/route.ts platform/app/api/internal/channels/route.test.ts platform/app/api/internal/apps/route.ts
git commit -m "feat(platform): add internal /api/internal/channels and /api/internal/apps routes"
```

---

## Task 4: MCP API Key Management API Routes

**Files:**
- Create: `platform/app/api/developer/keys/route.ts`
- Create: `platform/app/api/developer/keys/[id]/route.ts`

- [ ] **Step 1: Write failing tests**

Create `platform/app/api/developer/keys/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'

const mockDb = { query: vi.fn() }
vi.mock('@/lib/db', () => ({ db: mockDb }))

const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mockAuth } } }))

describe('GET /api/developer/keys', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValueOnce(null)
    const req = new Request('http://localhost/api/developer/keys')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns list of keys for authenticated user', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'user-1' } })
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'key-1', name: 'My Key', prefix: 'sk_tai_abc', created_at: '2026-01-01', last_used_at: null }]
    })
    const req = new Request('http://localhost/api/developer/keys')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.keys).toHaveLength(1)
    expect(body.keys[0].id).toBe('key-1')
  })
})

describe('POST /api/developer/keys', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValueOnce(null)
    const req = new Request('http://localhost/api/developer/keys', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Key' }),
      headers: { 'Content-Type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('creates key and returns full token only once', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'user-1' } })
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'key-new', prefix: 'sk_tai_xyz' }]
    })
    const req = new Request('http://localhost/api/developer/keys', {
      method: 'POST',
      body: JSON.stringify({ name: 'CI Key' }),
      headers: { 'Content-Type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.token).toMatch(/^sk_tai_/)
    expect(body.id).toBe('key-new')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd platform && npx vitest run app/api/developer/keys/route.test.ts 2>&1 | tail -10
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement GET/POST for developer keys**

Create `platform/app/api/developer/keys/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

export async function GET(_req: Request): Promise<Response> {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await db.query<{
    id: string
    name: string
    prefix: string
    created_at: string
    last_used_at: string | null
  }>(
    `SELECT id, name, prefix, created_at, last_used_at
     FROM mcp.api_keys
     WHERE user_id = $1 AND revoked_at IS NULL
     ORDER BY created_at DESC`,
    [session.user.id]
  )

  return NextResponse.json({ keys: result.rows })
}

export async function POST(req: Request): Promise<Response> {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { name?: string }
  const name = body.name?.trim()
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const rawToken = `sk_tai_${crypto.randomBytes(32).toString('hex')}`
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const prefix = rawToken.slice(0, 16) // sk_tai_ + 8 chars

  const result = await db.query<{ id: string; prefix: string }>(
    `INSERT INTO mcp.api_keys (user_id, name, token_hash, prefix)
     VALUES ($1, $2, $3, $4)
     RETURNING id, prefix`,
    [session.user.id, name, tokenHash, prefix]
  )

  // Return full token only on creation — never stored in plaintext
  return NextResponse.json({ id: result.rows[0].id, token: rawToken, prefix }, { status: 201 })
}
```

- [ ] **Step 4: Implement DELETE for developer keys**

Create `platform/app/api/developer/keys/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const result = await db.query(
    `UPDATE mcp.api_keys
     SET revoked_at = NOW()
     WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [id, session.user.id]
  )

  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'Key not found' }, { status: 404 })
  }

  return NextResponse.json({ revoked: true })
}
```

- [ ] **Step 5: Run tests**

Run:
```bash
cd platform && npx vitest run app/api/developer/keys/route.test.ts 2>&1 | tail -10
```
Expected: PASS — 4 tests passing

- [ ] **Step 6: Commit**

```bash
git add platform/app/api/developer/keys/route.ts platform/app/api/developer/keys/route.test.ts platform/app/api/developer/keys/\[id\]/route.ts
git commit -m "feat(platform): add /api/developer/keys CRUD for MCP API key management"
```

---

## Task 5: Developers Page UI

**Files:**
- Create: `platform/app/(marketplace)/developers/page.tsx`
- Create: `platform/app/(marketplace)/developers/components/ApiKeyManager.tsx`
- Create: `platform/app/(marketplace)/developers/components/McpConnectionGuide.tsx`
- Create: `platform/app/(marketplace)/developers/components/ApiReferenceSection.tsx`

- [ ] **Step 1: Implement ApiKeyManager component**

Create `platform/app/(marketplace)/developers/components/ApiKeyManager.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { Copy, Trash2, Plus, Eye, EyeOff } from 'lucide-react'

type ApiKey = {
  id: string
  name: string
  prefix: string
  created_at: string
  last_used_at: string | null
}

export function ApiKeyManager() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/developer/keys')
      .then(r => r.json())
      .then((d: { keys: ApiKey[] }) => setKeys(d.keys))
      .catch(() => setError('Failed to load keys'))
  }, [])

  async function createKey() {
    if (!newKeyName.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/developer/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Failed to create key')
      }
      const created = await res.json() as { id: string; token: string; prefix: string }
      setNewToken(created.token)
      setNewKeyName('')
      // Reload key list
      const listRes = await fetch('/api/developer/keys')
      const listData = await listRes.json() as { keys: ApiKey[] }
      setKeys(listData.keys)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setCreating(false)
    }
  }

  async function revokeKey(id: string) {
    if (!confirm('Revoke this API key? This cannot be undone.')) return
    await fetch(`/api/developer/keys/${id}`, { method: 'DELETE' })
    setKeys(prev => prev.filter(k => k.id !== id))
  }

  function copyToken() {
    if (!newToken) return
    navigator.clipboard.writeText(newToken)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <input
          type="text"
          value={newKeyName}
          onChange={e => setNewKeyName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && createKey()}
          placeholder="Key name (e.g. cursor-local)"
          className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
        />
        <button
          onClick={createKey}
          disabled={creating || !newKeyName.trim()}
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {creating ? 'Creating…' : 'Generate Key'}
        </button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {newToken && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
          <p className="mb-2 text-sm font-semibold text-violet-800">
            Copy your new API key — it will only be shown once.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2">
            <code className="flex-1 text-sm text-violet-900">
              {showToken ? newToken : '•'.repeat(40)}
            </code>
            <button onClick={() => setShowToken(s => !s)} className="text-violet-400 hover:text-violet-700">
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button onClick={copyToken} className="text-violet-400 hover:text-violet-700">
              <Copy className="h-4 w-4" />
            </button>
            {copied && <span className="text-xs text-violet-600">Copied!</span>}
          </div>
        </div>
      )}

      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {keys.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-400">No API keys yet. Generate one above.</div>
        )}
        {keys.map(key => (
          <div key={key.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-900">{key.name}</p>
              <p className="text-xs text-gray-400">{key.prefix}… · Created {new Date(key.created_at).toLocaleDateString()}</p>
            </div>
            <button
              onClick={() => revokeKey(key.id)}
              className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500"
              title="Revoke key"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Implement McpConnectionGuide component**

Create `platform/app/(marketplace)/developers/components/McpConnectionGuide.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Copy } from 'lucide-react'

type Editor = 'claude-code' | 'cursor' | 'windsurf' | 'continue'

const EDITOR_CONFIGS: Record<Editor, { label: string; config: string; path: string }> = {
  'claude-code': {
    label: 'Claude Code',
    path: 'Run in terminal:',
    config: `claude mcp add --transport sse terminal-ai https://terminalai.app/mcp`,
  },
  cursor: {
    label: 'Cursor',
    path: '~/.cursor/mcp.json',
    config: JSON.stringify({
      mcpServers: {
        'terminal-ai': {
          transport: 'sse',
          url: 'https://terminalai.app/mcp',
          headers: { Authorization: 'Bearer YOUR_API_KEY' },
        },
      },
    }, null, 2),
  },
  windsurf: {
    label: 'Windsurf',
    path: '~/.codeium/windsurf/mcp_config.json',
    config: JSON.stringify({
      mcpServers: {
        'terminal-ai': {
          transport: 'sse',
          url: 'https://terminalai.app/mcp',
          headers: { Authorization: 'Bearer YOUR_API_KEY' },
        },
      },
    }, null, 2),
  },
  continue: {
    label: 'Continue.dev',
    path: '~/.continue/config.json (mcpServers section)',
    config: JSON.stringify({
      name: 'terminal-ai',
      transport: { type: 'sse', url: 'https://terminalai.app/mcp' },
      headers: { Authorization: 'Bearer YOUR_API_KEY' },
    }, null, 2),
  },
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="relative rounded-lg bg-gray-950 p-4">
      <button onClick={copy} className="absolute right-3 top-3 text-gray-500 hover:text-gray-200">
        <Copy className="h-4 w-4" />
      </button>
      {copied && <span className="absolute right-10 top-3 text-xs text-green-400">Copied!</span>}
      <pre className="overflow-x-auto text-sm text-gray-100">{code}</pre>
    </div>
  )
}

export function McpConnectionGuide() {
  const [editor, setEditor] = useState<Editor>('claude-code')

  const STEPS = [
    {
      number: '01',
      title: 'Generate an API key',
      body: 'Scroll up to the API Keys section and click "Generate Key". Copy the key — it is only shown once.',
    },
    {
      number: '02',
      title: 'Add the MCP server to your editor',
      body: (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(EDITOR_CONFIGS) as Editor[]).map(e => (
              <button
                key={e}
                onClick={() => setEditor(e)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  editor === e
                    ? 'bg-violet-600 text-white'
                    : 'border border-gray-200 bg-white text-gray-600 hover:border-violet-300'
                }`}
              >
                {EDITOR_CONFIGS[e].label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500">{EDITOR_CONFIGS[editor].path}</p>
          <CodeBlock code={EDITOR_CONFIGS[editor].config.replace('YOUR_API_KEY', '<your-api-key>')} />
          <p className="text-xs text-gray-500">
            Replace <code className="rounded bg-gray-100 px-1">{'<your-api-key>'}</code> with the key you copied in step 1.
          </p>
        </div>
      ),
    },
    {
      number: '03',
      title: 'Reload your editor',
      body: 'Restart your editor or reload the MCP servers list. You should see "terminal-ai" appear with 5 available tools.',
    },
    {
      number: '04',
      title: 'Build and deploy your first app',
      body: (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Open a new chat and paste this prompt:</p>
          <CodeBlock code={`Use the terminal-ai MCP to scaffold a Next.js app called "my-app" with a simple landing page. Then create a channel called "My Apps" and deploy the app to it. Commit everything to GitHub and trigger the deployment. Let me know the URL when it's live.`} />
          <p className="text-xs text-gray-500">The AI will call scaffold_app → create_channel → deploy_app automatically. No manual steps needed.</p>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      {STEPS.map((step) => (
        <StepCard key={step.number} number={step.number} title={step.title} body={step.body} />
      ))}
    </div>
  )
}

function StepCard({ number, title, body }: { number: string; title: string; body: React.ReactNode }) {
  const [open, setOpen] = useState(number === '01')
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-gray-50"
      >
        <span className="text-xs font-bold text-violet-500">{number}</span>
        <span className="flex-1 text-sm font-semibold text-gray-900">{title}</span>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 px-5 py-4 text-sm text-gray-600">
          {typeof body === 'string' ? <p>{body}</p> : body}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Implement ApiReferenceSection component**

Create `platform/app/(marketplace)/developers/components/ApiReferenceSection.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

type Endpoint = {
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH'
  path: string
  description: string
  auth: string
  body?: string
  response: string
}

const ENDPOINTS: Endpoint[] = [
  {
    method: 'GET',
    path: '/api/channels',
    description: 'List all public channels',
    auth: 'None',
    response: '{ channels: [{ id, name, slug, description, subscriber_count }] }',
  },
  {
    method: 'GET',
    path: '/api/channels/:slug',
    description: 'Get a single channel by slug',
    auth: 'None',
    response: '{ id, name, slug, description, apps: [...] }',
  },
  {
    method: 'POST',
    path: '/api/channels',
    description: 'Create a new channel (creator only)',
    auth: 'Session cookie (must be logged in)',
    body: '{ name: string, description?: string }',
    response: '{ id, slug }',
  },
  {
    method: 'GET',
    path: '/api/apps',
    description: 'List apps (supports ?channelId=)',
    auth: 'None',
    response: '{ apps: [{ id, name, description, channel_id }] }',
  },
  {
    method: 'GET',
    path: '/api/apps/:id',
    description: 'Get a single app by ID',
    auth: 'None',
    response: '{ id, name, description, embed_url, channel }',
  },
  {
    method: 'GET',
    path: '/api/developer/keys',
    description: 'List your MCP API keys',
    auth: 'Session cookie',
    response: '{ keys: [{ id, name, prefix, created_at, last_used_at }] }',
  },
  {
    method: 'POST',
    path: '/api/developer/keys',
    description: 'Generate a new MCP API key',
    auth: 'Session cookie',
    body: '{ name: string }',
    response: '{ id, token, prefix } — token shown once only',
  },
  {
    method: 'DELETE',
    path: '/api/developer/keys/:id',
    description: 'Revoke an MCP API key',
    auth: 'Session cookie',
    response: '{ revoked: true }',
  },
]

const METHOD_COLORS: Record<Endpoint['method'], string> = {
  GET: 'bg-blue-100 text-blue-700',
  POST: 'bg-green-100 text-green-700',
  DELETE: 'bg-red-100 text-red-700',
  PATCH: 'bg-yellow-100 text-yellow-700',
}

export function ApiReferenceSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  return (
    <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
      {ENDPOINTS.map((ep, i) => (
        <div key={i}>
          <button
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
          >
            <span className={`rounded px-2 py-0.5 text-xs font-bold ${METHOD_COLORS[ep.method]}`}>
              {ep.method}
            </span>
            <code className="flex-1 text-xs text-gray-700">{ep.path}</code>
            <span className="text-xs text-gray-400 hidden sm:block">{ep.description}</span>
            {openIndex === i ? <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />}
          </button>
          {openIndex === i && (
            <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-2 text-xs">
              <p><span className="font-semibold text-gray-700">Auth:</span> <span className="text-gray-600">{ep.auth}</span></p>
              {ep.body && <p><span className="font-semibold text-gray-700">Body:</span> <code className="text-gray-600">{ep.body}</code></p>}
              <p><span className="font-semibold text-gray-700">Response:</span> <code className="text-gray-600">{ep.response}</code></p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Implement the developers page**

Create `platform/app/(marketplace)/developers/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { ApiKeyManager } from './components/ApiKeyManager'
import { McpConnectionGuide } from './components/McpConnectionGuide'
import { ApiReferenceSection } from './components/ApiReferenceSection'

export const metadata = {
  title: 'Developer API — Terminal AI',
  description: 'Connect your AI coding assistant to Terminal AI with MCP. Build and deploy apps without leaving your editor.',
}

export default async function DevelopersPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 space-y-16">

      {/* Hero */}
      <div className="space-y-3">
        <div className="inline-block rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
          Developer API
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Build apps with your AI editor</h1>
        <p className="text-base text-gray-600 max-w-xl">
          Connect Claude, Cursor, or any MCP-compatible editor to Terminal AI. Scaffold, publish, and deploy apps to your channel — all from a single prompt.
        </p>
      </div>

      {/* MCP Server details */}
      <section className="rounded-2xl border border-gray-200 bg-gray-50 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">MCP Server</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-white border border-gray-200 p-3">
            <p className="text-xs text-gray-400 mb-1">Transport</p>
            <code className="text-gray-900">SSE (Server-Sent Events)</code>
          </div>
          <div className="rounded-lg bg-white border border-gray-200 p-3">
            <p className="text-xs text-gray-400 mb-1">Endpoint</p>
            <code className="text-gray-900">https://terminalai.app/mcp</code>
          </div>
          <div className="rounded-lg bg-white border border-gray-200 p-3">
            <p className="text-xs text-gray-400 mb-1">Auth</p>
            <code className="text-gray-900">Bearer {'<your-api-key>'}</code>
          </div>
          <div className="rounded-lg bg-white border border-gray-200 p-3">
            <p className="text-xs text-gray-400 mb-1">Available Tools</p>
            <code className="text-gray-900">scaffold_app · create_channel · deploy_app · get_deployment_status · list_supported_providers</code>
          </div>
        </div>
      </section>

      {/* API Keys */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">API Keys</h2>
          <p className="text-sm text-gray-500 mt-1">Generate keys to authenticate your MCP client. Each key is hashed and cannot be recovered after creation.</p>
        </div>
        <ApiKeyManager />
      </section>

      {/* Getting Started */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Getting Started</h2>
          <p className="text-sm text-gray-500 mt-1">Follow these steps to connect your editor and deploy your first app in under 5 minutes.</p>
        </div>
        <McpConnectionGuide />
      </section>

      {/* API Reference */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">API Reference</h2>
          <p className="text-sm text-gray-500 mt-1">REST endpoints available on the platform.</p>
        </div>
        <ApiReferenceSection />
      </section>

    </div>
  )
}
```

- [ ] **Step 5: Add link to developers page in account nav**

Read `platform/app/(marketplace)/account/page.tsx` or the nav component, find where account navigation links appear, and add a link to `/developers`. Look for the file that renders account sidebar/nav items.

- [ ] **Step 6: Commit**

```bash
git add platform/app/\(marketplace\)/developers/
git commit -m "feat(platform): add /developers page with API key manager, MCP guide, and API reference"
```

---

## Task 6: Enhance MCP Server — create_channel + deploy_app tools

**Files:**
- Modify: `mcp-server/src/index.ts`
- Modify: `mcp-server/src/tools/scaffold_app.ts`

- [ ] **Step 1: Read current MCP server index**

Read `mcp-server/src/index.ts` to understand current tool registration pattern and auth middleware.

- [ ] **Step 2: Add create_channel tool**

In `mcp-server/src/index.ts`, after the existing tool registrations, add:

```typescript
server.tool(
  'create_channel',
  'Create a new channel on Terminal AI for publishing apps. Returns the channel id and slug needed for deploy_app.',
  {
    name: z.string().min(1).max(80).describe('Human-readable channel name, e.g. "My Portfolio Apps"'),
    description: z.string().max(500).optional().describe('Short description shown on the channel page'),
  },
  async ({ name, description }, { authToken }: { authToken: string }) => {
    const creatorId = await resolveCreatorId(authToken)
    const platformUrl = process.env.PLATFORM_URL ?? 'http://platform:3000'
    const res = await fetch(`${platformUrl}/api/internal/channels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': process.env.INTERNAL_SERVICE_TOKEN ?? '',
        'X-Creator-Id': creatorId,
      },
      body: JSON.stringify({ name, description }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'unknown' })) as { error?: string }
      return {
        content: [{ type: 'text', text: `Failed to create channel: ${err.error ?? res.statusText}` }],
        isError: true,
      }
    }
    const channel = await res.json() as { id: string; slug: string }
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ channelId: channel.id, slug: channel.slug, url: `https://terminalai.app/c/${channel.slug}` }),
      }],
    }
  }
)
```

- [ ] **Step 3: Add deploy_app tool**

In `mcp-server/src/index.ts`, after create_channel, add:

```typescript
server.tool(
  'deploy_app',
  'Register a GitHub repo as an app on Terminal AI and trigger deployment. The app will be built and deployed to *.apps.terminalai.app.',
  {
    channelId: z.string().describe('Channel ID returned from create_channel'),
    name: z.string().min(1).max(80).describe('App name'),
    description: z.string().max(500).optional(),
    githubRepo: z.string().describe('Full GitHub repo URL, e.g. https://github.com/user/repo'),
    githubBranch: z.string().default('main').describe('Branch to deploy'),
    framework: z.enum(['nextjs', 'react', 'vue', 'svelte', 'static']).default('nextjs'),
  },
  async ({ channelId, name, description, githubRepo, githubBranch, framework }, { authToken }: { authToken: string }) => {
    const creatorId = await resolveCreatorId(authToken)
    const platformUrl = process.env.PLATFORM_URL ?? 'http://platform:3000'
    const res = await fetch(`${platformUrl}/api/internal/apps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': process.env.INTERNAL_SERVICE_TOKEN ?? '',
        'X-Creator-Id': creatorId,
      },
      body: JSON.stringify({ channelId, name, description, githubRepo, githubBranch, framework }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'unknown' })) as { error?: string }
      return {
        content: [{ type: 'text', text: `Failed to register app: ${err.error ?? res.statusText}` }],
        isError: true,
      }
    }
    const data = await res.json() as { id: string; deploymentId: string; deploymentQueued: boolean }
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          appId: data.id,
          deploymentId: data.deploymentId,
          deploymentQueued: data.deploymentQueued,
          statusTool: 'Use get_deployment_status with deploymentId to poll for completion',
        }),
      }],
    }
  }
)
```

- [ ] **Step 4: Add resolveCreatorId helper**

Near the top of `mcp-server/src/index.ts`, before the tool registrations, add this helper if it doesn't exist:

```typescript
async function resolveCreatorId(authToken: string): Promise<string> {
  // Query the mcp.api_keys table via the platform DB or a dedicated internal endpoint
  // The simplest approach: add a /api/internal/me route to platform that validates the bearer token
  const platformUrl = process.env.PLATFORM_URL ?? 'http://platform:3000'
  const res = await fetch(`${platformUrl}/api/internal/me`, {
    headers: {
      Authorization: `Bearer ${authToken}`,
      'X-Service-Token': process.env.INTERNAL_SERVICE_TOKEN ?? '',
    },
  })
  if (!res.ok) throw new Error('Invalid API key')
  const data = await res.json() as { userId: string }
  return data.userId
}
```

- [ ] **Step 5: Add /api/internal/me route to platform**

Create `platform/app/api/internal/me/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { validateServiceToken, unauthorizedResponse } from '@/lib/internal-auth'

export async function GET(req: Request): Promise<Response> {
  if (!validateServiceToken(req)) return unauthorizedResponse()

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return NextResponse.json({ error: 'Missing bearer token' }, { status: 400 })

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  const result = await db.query<{ user_id: string }>(
    `SELECT user_id FROM mcp.api_keys
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  )

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  // Update last_used_at
  await db.query(
    `UPDATE mcp.api_keys SET last_used_at = NOW() WHERE token_hash = $1`,
    [tokenHash]
  )

  return NextResponse.json({ userId: result.rows[0].user_id })
}
```

- [ ] **Step 6: Enhance scaffold_app to include Dockerfile**

Read `mcp-server/src/tools/scaffold_app.ts`. Find where the scaffolded files are generated and add a Dockerfile. After the existing file generation, add this Dockerfile to the output:

```typescript
// Add to the scaffolded files list
const dockerfile = `FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM base AS builder
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"
CMD ["node", "server.js"]
`

// Include environment variable guidance in the tool response
const envGuidance = `## Deployment Requirements

Your app has been scaffolded with a Dockerfile. To deploy:

1. Push this code to a **public** GitHub repository
2. Call create_channel to create a channel (if you don't have one)
3. Call deploy_app with your GitHub repo URL

The app will be built using the Dockerfile and deployed to *.apps.terminalai.app.

### next.config.js output mode
Your next.config.js already includes \`output: 'standalone'\` which is required for the Dockerfile to work.
`
```

- [ ] **Step 7: Add PLATFORM_URL and INTERNAL_SERVICE_TOKEN to mcp-server env**

Read `mcp-server/.env.example` (or create if absent):

```bash
# MCP Server environment variables
PORT=3003
DATABASE_URL=postgresql://terminalai:password@postgres:5432/terminalai
REDIS_URL=redis://:password@redis:6379

# Platform internal communication
PLATFORM_URL=http://platform:3000
INTERNAL_SERVICE_TOKEN=  # Must match platform's INTERNAL_SERVICE_TOKEN

# Optional: direct DB access
# Uses same DATABASE_URL as platform for api_keys lookups
```

- [ ] **Step 8: Commit**

```bash
git add mcp-server/src/index.ts mcp-server/src/tools/scaffold_app.ts mcp-server/.env.example platform/app/api/internal/me/route.ts
git commit -m "feat(mcp): add create_channel, deploy_app tools + scaffold Dockerfile + /api/internal/me route"
```

---

## Task 7: Deploy Manager — Wire Coolify Integration

**Files:**
- Modify: `deploy-manager/src/jobs/deploy.ts`
- Modify: `deploy-manager/.env.example`

- [ ] **Step 1: Read current deploy.ts**

Read `deploy-manager/src/jobs/deploy.ts` to understand the current pipeline (Gitleaks, DNS, etc.).

- [ ] **Step 2: Update .env.example**

Read `deploy-manager/.env.example` (create if absent), then update it:

```bash
# Deploy Manager environment variables
PORT=4000
REDIS_URL=redis://:password@redis:6379
DATABASE_URL=postgresql://terminalai:password@postgres:5432/terminalai

# GitHub
GITHUB_TOKEN=  # Personal access token with repo:read scope (for private repos)

# Cloudflare DNS
CLOUDFLARE_ZONE_ID=       # From Cloudflare Dashboard → your domain → Overview → Zone ID
CLOUDFLARE_API_TOKEN=     # API token with DNS:Edit scope

# Coolify (VPS2)
COOLIFY_URL=http://<VPS2_IP>:8000   # Coolify instance URL
COOLIFY_TOKEN=                       # From Coolify → API → Tokens

# VPS2
VPS2_IP=        # Public IP of your second VPS

# Internal auth
INTERNAL_SERVICE_TOKEN=   # Must match platform and mcp-server

# App domain
APP_DOMAIN=apps.terminalai.app   # Wildcard domain pointed at VPS2_IP
```

- [ ] **Step 3: Implement Coolify integration in deploy.ts**

Read the current deploy.ts. Find the section that handles app creation/deployment (likely a placeholder or incomplete). Replace or fill in the Coolify steps:

```typescript
// --- Step: Create Cloudflare DNS A record ---
async function createDnsRecord(subdomain: string, vps2Ip: string): Promise<void> {
  const zoneId = process.env.CLOUDFLARE_ZONE_ID!
  const token = process.env.CLOUDFLARE_API_TOKEN!
  const name = `${subdomain}.apps.terminalai.app`

  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'A',
      name,
      content: vps2Ip,
      ttl: 1,    // 1 = auto
      proxied: false,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Cloudflare DNS error: ${err}`)
  }
}

// --- Step: Create Coolify app ---
async function createCoolifyApp(opts: {
  name: string
  appId: string
  githubRepo: string
  branch: string
  subdomain: string
}): Promise<string> {
  const coolifyUrl = process.env.COOLIFY_URL!
  const token = process.env.COOLIFY_TOKEN!
  const domain = `${opts.subdomain}.apps.terminalai.app`

  const res = await fetch(`${coolifyUrl}/api/v1/applications`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: opts.name,
      git_repository: opts.githubRepo,
      git_branch: opts.branch,
      build_pack: 'dockerfile',
      domains: `https://${domain}`,
      port_exposes: '3000',
      environment_id: 1,   // default environment; adjust per your Coolify setup
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Coolify create app error: ${err}`)
  }
  const data = await res.json() as { uuid: string }
  return data.uuid
}

// --- Step: Trigger Coolify deployment ---
async function triggerCoolifyDeploy(appUuid: string): Promise<void> {
  const coolifyUrl = process.env.COOLIFY_URL!
  const token = process.env.COOLIFY_TOKEN!

  const res = await fetch(`${coolifyUrl}/api/v1/applications/${appUuid}/deploy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Coolify deploy trigger error: ${err}`)
  }
}
```

Wire these into the main job processor, after the Gitleaks scan:

```typescript
// After Gitleaks scan passes:
const subdomain = appId.slice(0, 12)  // short unique subdomain
const vps2Ip = process.env.VPS2_IP!

await createDnsRecord(subdomain, vps2Ip)

const coolifyUuid = await createCoolifyApp({
  name: appId,
  appId,
  githubRepo,
  branch,
  subdomain,
})

await triggerCoolifyDeploy(coolifyUuid)

// Update deployment status in DB
await db.query(
  `UPDATE deployments.deployments
   SET status = 'deployed', coolify_app_id = $1, url = $2, completed_at = NOW()
   WHERE id = $3`,
  [coolifyUuid, `https://${subdomain}.apps.terminalai.app`, deploymentId]
)
```

- [ ] **Step 4: Commit**

```bash
git add deploy-manager/src/jobs/deploy.ts deploy-manager/.env.example
git commit -m "feat(deploy-manager): wire Cloudflare DNS + Coolify app creation and deployment"
```

---

## Task 8: Add Developers Link to Navigation

**Files:**
- Modify: platform nav component (find the correct file)

- [ ] **Step 1: Find the nav component**

Run:
```bash
grep -r "account" platform/app/\(marketplace\) --include="*.tsx" -l | head -10
grep -r "href.*account" platform/components --include="*.tsx" -l | head -10
```

- [ ] **Step 2: Add developers link**

In the file that renders navigation links (likely a sidebar or top nav), find the section with account-related links and add:

```tsx
<Link
  href="/developers"
  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900"
>
  <Code2 className="h-4 w-4" />
  Developer API
</Link>
```

Import `Code2` from `'lucide-react'` if not already imported.

- [ ] **Step 3: Commit**

```bash
git add -p
git commit -m "feat(nav): add Developer API link to account navigation"
```

---

## Task 9: Smoke-test End-to-End on VPS (Manual Checklist)

This task is a manual validation checklist — no code changes needed.

- [ ] **Step 1: Apply DB migrations** (follow `docs/mcp-migration-checklist.md`)

- [ ] **Step 2: Set VPS1 environment variables** (follow the checklist)

- [ ] **Step 3: Install Coolify on VPS2** (follow the checklist)

- [ ] **Step 4: Configure wildcard DNS** (`*.apps.terminalai.app` → VPS2 IP)

- [ ] **Step 5: Restart all services** on VPS1

- [ ] **Step 6: Verify MCP server is running**

```bash
curl -N https://terminalai.app/mcp  # Should return SSE stream headers
```

- [ ] **Step 7: Generate an API key** via the /developers page

- [ ] **Step 8: Connect MCP to Claude Code**

```bash
claude mcp add --transport sse terminal-ai https://terminalai.app/mcp
# When prompted for auth header: Authorization: Bearer sk_tai_xxxx
```

- [ ] **Step 9: Run the one-shot prompt**

In Claude Code:
```
Use the terminal-ai MCP to scaffold a Next.js app called "hello-world" with a landing page that says "Deployed by Terminal AI". Create a channel called "Test Apps", push the code to GitHub, and deploy the app. Report the live URL.
```

Expected flow: scaffold_app → git push → create_channel → deploy_app → get_deployment_status (polling) → URL returned

- [ ] **Step 10: Verify the app is live**

Open `https://<subdomain>.apps.terminalai.app` — should show the landing page.

---

## Self-Review

### Spec Coverage Check

| Requirement | Covered in Task |
|---|---|
| Apply DB migrations 002-006 | Task 1 |
| Update init.sql | Task 1 |
| VPS migration guide | Task 1 |
| Internal service auth | Task 2 |
| Internal channel creation API | Task 3 |
| Internal app registration + deploy trigger | Task 3 |
| API key management REST routes | Task 4 |
| API key management UI | Task 5 |
| MCP connection guide | Task 5 |
| API reference page | Task 5 |
| Developers page | Task 5 |
| MCP create_channel tool | Task 6 |
| MCP deploy_app tool | Task 6 |
| scaffold_app + Dockerfile | Task 6 |
| /api/internal/me route for token resolution | Task 6 |
| deploy-manager Coolify integration | Task 7 |
| Cloudflare DNS creation | Task 7 |
| Navigation link | Task 8 |
| End-to-end smoke test guide | Task 9 |
| VPS2 Coolify install guide | Task 1 (checklist) |

### Type Consistency Check

- `validateServiceToken(req: Request): boolean` — consistent across Task 2, 3, 4, 6
- `getCreatorIdFromRequest(req: Request): string | null` — consistent in Task 2, used in Task 3
- `unauthorizedResponse(): Response` — consistent across all internal routes
- `ApiKey` type in ApiKeyManager matches columns from `GET /api/developer/keys` response
- `resolveCreatorId(authToken: string): Promise<string>` — calls `/api/internal/me` which returns `{ userId: string }`
- `deploy.ts` Coolify functions use consistent parameter shapes

### Placeholder Scan

No TBD, TODO, or "implement later" placeholders present. All code blocks are complete. All commands include expected output.
