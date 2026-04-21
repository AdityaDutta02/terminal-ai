# MCP Porting Support — Design Spec

**Date:** 2026-04-21
**Status:** Approved
**Scope:** Make existing Next.js + Supabase apps deployable on Terminal AI with minimal friction

---

## Problem

The Terminal AI MCP is optimised for net-new apps. Developers porting existing apps hit four hard walls:

1. **Auth** — `supabase.auth.getUser()` has no equivalent; the embed token identifies the app, not the viewer
2. **Database** — Supabase uses PostgREST + RLS; Terminal AI uses a gateway SDK with per-app schema and no Postgres-level user context
3. **Migration discovery** — no tooling to identify what needs changing before first deploy
4. **Schema migration** — no way to import existing table definitions

Target persona: vibe-coder who built quickly with Next.js + Supabase and wants to port without a ground-up rewrite.

---

## Approach: Layered Porting (Option C)

Three components, each independently useful:

1. **`analyze_repo`** — scans GitHub repo before deploy, surfaces risk flags and migration checklist
2. **Supabase compatibility shim** — gateway namespace that makes supabase-js work against Terminal AI by swapping two env vars
3. **Enriched `scaffold_app` with `port_from` mode** — generates repo-specific replacement files and a porting guide

Developer journey:
```
analyze_repo → risk flags cleared → deploy_app (shim on) → migrate module by module → disable_compat_shim
```

---

## Component 1: `analyze_repo` MCP Tool

### Inputs
```typescript
{
  github_repo: string   // full GitHub URL
  branch?: string       // default: "main"
}
```

### Mechanism
Reads files via GitHub raw content API. No cloning. Scans all `.ts`, `.tsx`, `.js`, `.py` files and `*.sql` migration files.

### Detection Table

| Pattern | Category | Risk |
|---|---|---|
| `supabase.auth.getUser()` | auth | high |
| `supabase.auth.signIn*`, `signOut` | auth | high |
| `supabase.from(table).*` | db | medium |
| `supabase.storage.from(bucket).*` | storage | low |
| `SUPABASE_SERVICE_ROLE_KEY` / `service_role` in any file | security | **critical** |
| RLS policies in `.sql` files | security | high |
| `supabase.functions.invoke()` | unsupported | high |
| `supabase.channel()` / `.realtime.*` | unsupported | high |
| `supabase.rpc()` | db | medium |

### Output Shape
```json
{
  "risk_flags": [
    {
      "severity": "critical",
      "pattern": "SUPABASE_SERVICE_ROLE_KEY",
      "file": "lib/supabase.ts",
      "line": 4,
      "message": "Service role key must never be deployed to Terminal AI"
    }
  ],
  "migration_checklist": [
    {
      "category": "auth",
      "count": 12,
      "effort": "high",
      "action": "Replace with /compat/supabase/auth/v1/user or remove"
    },
    {
      "category": "db",
      "tables": ["posts", "profiles"],
      "effort": "medium",
      "action": "Shim covers CRUD — RLS is NOT enforced, gateway layer secures access"
    },
    {
      "category": "unsupported",
      "patterns": ["realtime"],
      "action": "No equivalent — must remove or redesign"
    }
  ],
  "compat_shim_coverage": 0.74,
  "estimated_effort": "medium",
  "env_vars_to_add": ["TERMINAL_AI_GATEWAY_URL"],
  "env_vars_to_remove": ["SUPABASE_URL", "SUPABASE_ANON_KEY"]
}
```

### Critical Flag Behaviour
If any `critical` risk flag exists, the tool surfaces flags prominently and halts — it does not proceed to the checklist. The developer must remove the pattern (e.g. service role key) before the tool returns the full migration plan. This prevents silent credential exposure.

### `compat_shim_coverage`
Fraction of detected Supabase calls the shim covers (0.0–1.0). If below 0.5, the tool warns that a clean migration is safer than shim deployment.

---

## Component 2: Supabase Compatibility Shim

### Activation
Two new MCP tools:
- `enable_compat_shim(app_id)` — sets `marketplace.apps.compat_shim_enabled = true`
- `disable_compat_shim(app_id)` — sets it to false, returns 404 on all `/compat/supabase/*` routes

Schema change:
```sql
ALTER TABLE marketplace.apps ADD COLUMN compat_shim_enabled BOOLEAN NOT NULL DEFAULT false;
```

### Gateway Namespace
All routes under `/compat/supabase/*`. Only reachable when `compat_shim_enabled = true` for the app identified by the embed token. Apps with the shim disabled get 404.

### Security Middleware (runs first on every shim route)
1. Strip `apikey` header — never read, never log
2. Validate embed token as Bearer — same validation as all other gateway routes
3. Reject tokens with `role: service_role` claim — return 403 with explicit message: `"Service role tokens are not accepted by Terminal AI"`
4. Extract `viewerUserId` from token for identity-scoped calls

### Auth Endpoints

**`GET /compat/supabase/auth/v1/user`**
Returns synthetic user object from embed token. No external call.
```json
{
  "id": "<viewerUserId>",
  "email": null,
  "role": "authenticated",
  "aud": "authenticated",
  "is_anonymous": false
}
```
`email` is always `null`. Apps never receive viewer email addresses.

**`POST /compat/supabase/auth/v1/token`** (signIn)
Returns 200 with a no-op body and logs a warning. Does not crash the app.

**`POST /compat/supabase/auth/v1/logout`** (signOut)
Returns 200 with a no-op body and logs a warning.

### REST Endpoints

All filter values are parameterized. Table name is validated against the app's provisioned schema before query execution — prevents cross-app access.

**`GET /compat/supabase/rest/v1/:table`**
Translates PostgREST query params to parameterized SQL.

Supported operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `is`, `in`

Unsupported operators return 400 with explicit message — no silent failures.

`select=*` is permitted (shim context only — not exposed on native DB SDK routes).

**`POST /compat/supabase/rest/v1/:table`** — insert row

**`PATCH /compat/supabase/rest/v1/:table`** — update by filter

**`DELETE /compat/supabase/rest/v1/:table`** — delete by filter

**`GET /rest/v1/`** (introspection) — explicitly returns 404. Schema is never exposed.

### Storage Endpoints

Bucket name is prepended to the storage key (`bucket/key`) to preserve namespace. All access requires a valid embed token. No signed URLs.

| Shim route | Terminal AI equivalent |
|---|---|
| `PUT /compat/supabase/storage/v1/object/:bucket/:key` | `storageUpload` |
| `GET /compat/supabase/storage/v1/object/:bucket/:key` | `storageGet` |
| `DELETE /compat/supabase/storage/v1/object/:bucket/:key` | `storageDelete` |
| `GET /compat/supabase/storage/v1/object/list/:bucket` | `storageList` |

### Developer Setup (zero code changes for covered patterns)

Swap two env vars. The `supabase-js` client is initialised with the gateway URL as base. Embed token is passed as session token:

```
NEXT_PUBLIC_SUPABASE_URL  →  ${TERMINAL_AI_GATEWAY_URL}/compat/supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY  →  (remove — supabase-js accepts empty string)
```

In the root component:
```typescript
// hooks/use-supabase-session.ts (generated by scaffold port_from mode)
const embedToken = useEmbedToken()
useEffect(() => {
  if (embedToken) supabase.auth.setSession({ access_token: embedToken, refresh_token: '' })
}, [embedToken])
```

### RLS Warning
Supabase RLS policies (`auth.uid()` in Postgres) are silently lost — the Terminal AI DB has no Postgres-level user context. The shim secures at the gateway layer. `analyze_repo` flags this explicitly before any deploy. Developers needing per-user row isolation must add a `viewer_id` column and filter on it in application code.

---

## Component 3: Enriched `scaffold_app` — `port_from` Mode

### Additional Input
```typescript
port_from?: {
  provider: 'supabase'
  github_repo: string
}
```

### Additional Generated Files

**`lib/supabase-compat.ts`** — drop-in shim client. Apps that `import supabase from '@/lib/supabase'` can re-export from this with zero other changes:
```typescript
import { createClient } from '@supabase/supabase-js'
const GATEWAY = process.env.TERMINAL_AI_GATEWAY_URL!
export const supabase = createClient(`${GATEWAY}/compat/supabase`, '')
export function initSupabaseSession(embedToken: string) {
  supabase.auth.setSession({ access_token: embedToken, refresh_token: '' })
}
```

**`hooks/use-supabase-session.ts`** — replaces existing Supabase auth hooks. Calls `useEmbedToken()`, calls `initSupabaseSession` when token arrives, returns `{ supabase, ready }`.

**`db-migrations.sql`** — pre-populated with `CREATE TABLE IF NOT EXISTS` statements for every table detected by `analyze_repo`. Column types default to `JSONB data` with `id UUID` and `created_at TIMESTAMPTZ`. Developer fills in real columns.

**`PORTING.md`** — repo-specific migration guide committed to repo root:
- Every file that needs changes (from `analyze_repo` output)
- Every unsupported pattern (realtime, edge functions)
- The two env var swaps
- RLS loss warning with mitigation pattern
- Module-by-module migration order (storage first — lowest effort, auth last — requires viewer identity)

Standard scaffold files are always included (`lib/terminal-ai.ts`, `lib/db.ts`, `lib/storage.ts`, `lib/task-sdk.ts`) as the native migration targets.

---

## Component 4: Platform Viewer Identity (Dependency)

This workstream is a dependency for the shim's auth endpoint returning meaningful identity. Tracked separately.

### Changes Required
- Terminal AI viewers (app consumers) can sign up and authenticate on the platform
- Viewer shell authenticates the viewer before loading the app iframe
- Embed token JWT gains `viewerUserId` claim (UUID)
- Unauthenticated viewers receive a stable anonymous ID: UUID stored in `tai_vid` cookie (HttpOnly, platform domain, 1-year expiry)

### Gateway `/auth/me` Endpoint
```json
{
  "id": "<viewerUserId | anonId>",
  "is_anonymous": true,
  "role": "authenticated",
  "aud": "authenticated"
}
```
Email is never returned.

### Interim Behaviour (before viewer auth ships)
`/auth/v1/user` returns the anonymous ID derived from `tai_vid` cookie. `is_anonymous` is always `true`. Full platform accounts layer on without breaking existing apps.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Shim called on app with `compat_shim_enabled = false` | 404 |
| `apikey` header present | Strip silently — never log value |
| Token with `role: service_role` | 403 with explicit message |
| Unsupported PostgREST operator | 400 with operator name and list of supported operators |
| Table not in app's schema | 403 — prevents cross-app access |
| `analyze_repo` critical flag present | Tool halts, returns flags only, no checklist |
| `compat_shim_coverage` < 0.5 | Warning in output recommending clean migration |
| Realtime / edge function call hits shim | 501 with "not supported on Terminal AI — see PORTING.md" |

---

## Testing Approach

- `analyze_repo`: unit tests with fixture repos (one clean Next.js + Supabase repo, one with service role key exposure, one with realtime usage). Assert detection counts and risk flag severity.
- Shim REST routes: integration tests with parameterized filter cases — assert SQL is parameterized, assert cross-app table access is blocked, assert `select=*` works on shim routes only.
- Shim auth: assert `email` is never present in response, assert service role tokens get 403, assert `apikey` header is stripped before any logging.
- `scaffold_app port_from`: assert all expected files are present in output, assert `PORTING.md` references detected table names, assert `db-migrations.sql` has a stub per detected table.
- `enable_compat_shim` / `disable_compat_shim`: assert 404 before enable, assert routes active after enable, assert 404 returns after disable.

---

## What Is Explicitly Out of Scope

- Supabase Realtime — no equivalent on Terminal AI
- Supabase Edge Functions — no equivalent on Terminal AI
- `supabase.rpc()` — custom SQL procedures require manual rewrite; shim returns 501
- Multi-bucket storage policies — storage is app-scoped, bucket names are namespaced as prefixes
- Full PostgREST operator coverage — only the operators vibe-coders actually use
- Email to arbitrary recipients — Terminal AI email SDK sends to authenticated viewer only
