# App-Managed Database & Object Storage — Design Spec

**Date:** 2026-04-07  
**Status:** Approved  
**Scope:** Gateway DB/storage routes, deploy-time provisioning, MCP scaffold updates

---

## Problem

Deployed apps on VPS2 have no platform-managed persistence. They can call AI models via the gateway but must self-manage any state. This limits what creators can build without setting up external services.

## Goal

Give every deployed app an isolated Postgres schema and a MinIO storage prefix, accessible via the existing gateway using the embed token. No new services. No credit cost (free, platform-absorbed — credit billing may be added later).

---

## Architecture

```
App on VPS2 (embed token in Authorization header)
        │
        ▼
Gateway /db/*         ← DbRouter   (gateway/src/routes/db.ts)
Gateway /storage/*    ← StorageRouter (gateway/src/routes/storage.ts)
        │                    both protected by existing embedTokenAuth middleware
        ▼
  appId extracted from embed token  (full UUID, e.g. 550e8400-e29b-41d4-a716-446655440000)
  schema  = app_data_<appId with hyphens → underscores>
  role    = app_<appId with hyphens → underscores>
  prefix  = apps/<appId>/
        │
   /db/*  ──────────────→  Postgres (VPS1) — schema: app_data_<shortId>
   /storage/*  ─────────→  MinIO (VPS1)    — prefix: apps/<appId>/
```

### Files changed

**New — gateway:**
- `gateway/src/routes/db.ts` — CRUD route handler
- `gateway/src/routes/storage.ts` — storage route handler
- `gateway/src/lib/db-validator.ts` — table/column whitelist via information_schema

**Modified — gateway:**
- `gateway/src/index.ts` — register `/db` and `/storage` routers
- `gateway/src/services/minio.ts` — add `listFiles`, `getFile`, `deleteFile`

**Modified — deploy-manager:**
- `deploy-manager/src/queue/deploy-queue.ts` — provision schema/role, run migrations, inject env vars, cleanup on delete

**Modified — mcp-server:**
- `mcp-server/src/tools/scaffold.ts` — inject DB/storage SDK helpers, generate `db-migrations.sql`

**New migration — platform:**
- `platform/lib/db/migrations/009_app_storage.sql` — `deployments.app_db_provisions` table

---

## Database Routes

All routes require a valid embed token. The app's schema is derived from `appId` in the token — apps cannot address each other's data.

```
GET    /db/:table              list rows (equality filters via query params)
GET    /db/:table/:id          get single row by primary key
POST   /db/:table              insert row, returns created row
PATCH  /db/:table/:id          update row by id, returns updated row
DELETE /db/:table/:id          delete row by id, returns { deleted: true }
```

### Injection prevention

Before any query, `db-validator.ts` queries `information_schema.columns` to whitelist the table name and all column names referenced in the request body or query filters. No user input is ever interpolated into SQL — only `$N` parameterised values.

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = $1 AND table_name = $2
```

Unknown table → 404. Unknown column → 400.

### Query filters

Query string params map to equality `WHERE` clauses:

```
GET /db/items?status=active&owner_id=abc
→  WHERE status = $1 AND owner_id = $2
```

Only equality filters in v1 (consistent with CRUD-only scope).

### Schema isolation

Each app's tables live in `app_data_<appId_underscored>` (e.g. `app_data_550e8400_e29b_41d4_a716_446655440000`). Hyphens in the UUID are replaced with underscores to form a valid SQL identifier. The gateway's Postgres user has `USAGE` on each provisioned schema and sets `search_path` per request. The app's dedicated role owns the tables. Apps access data exclusively via the gateway `/db/*` endpoints — no direct Postgres connection from VPS2.

---

## Storage Routes

All routes require a valid embed token. Keys are namespaced under `apps/<appId>/` — the app works with relative keys, the gateway prepends the prefix.

```
PUT    /storage/:key           upload (raw body, Content-Type header required)
GET    /storage/:key           download (streamed)
GET    /storage                list files in this app's prefix
DELETE /storage/:key           delete file
```

**Upload limits:** 50MB max, enforced via `Content-Length` check before reading body. Files pass through the existing ClamAV scan.

**List response:**
```json
[
  { "key": "report.pdf", "size": 204800, "lastModified": "2026-04-07T10:00:00Z" },
  { "key": "images/logo.png", "size": 8192, "lastModified": "2026-04-06T09:00:00Z" }
]
```

Keys are returned without the `apps/<appId>/` prefix.

---

## Deploy-time Provisioning

Inserted between secret scanning and Coolify app creation in `deploy-queue.ts`:

```
1. Clone repo                    (existing)
2. Scan for secrets              (existing)
3. provisionAppDb(appId)         NEW
   - shortId = appId.replaceAll('-', '_')
   - CREATE SCHEMA IF NOT EXISTS app_data_<shortId>
   - CREATE ROLE IF NOT EXISTS app_<shortId> LOGIN PASSWORD '<generated>'
   - GRANT USAGE ON SCHEMA, default privileges for CRUD
   - Insert into deployments.app_db_provisions (idempotent — skip if exists)
4. runMigrations(repoPath)       NEW
   - If db-migrations.sql exists: SET search_path; execute file
   - If migration fails: mark deployment MIGRATION_FAILED, abort
5. Create Coolify app            (existing, extended)
   Injected env vars:
     APP_DB_SCHEMA=app_data_<shortId>           (informational — apps use /db/* gateway routes)
     TERMINAL_AI_STORAGE_PREFIX=apps/<appId>/   (informational)
6. Trigger deploy + wait healthy (existing)
```

Provisioning is idempotent — redeployments skip step 3 if a provision record exists. Passwords are not stored in the platform DB; they are injected into Coolify env vars at provision time.

### New DB table

```sql
-- 009_app_storage.sql
CREATE TABLE deployments.app_db_provisions (
  app_id      UUID PRIMARY KEY REFERENCES marketplace.apps(id) ON DELETE CASCADE,
  schema_name TEXT NOT NULL,
  role_name   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### App deletion cleanup

`DELETE /apps/:appId` in deploy-manager extended to:
1. `DROP SCHEMA app_data_<shortId> CASCADE`
2. `DROP ROLE app_<shortId>`
3. Delete all MinIO objects under `apps/<appId>/`
4. Delete row from `deployments.app_db_provisions`

---

## MCP Scaffold Changes

`scaffold.ts` updated to always generate:

**`db-migrations.sql`** (repo root):
```sql
-- Runs once at deploy time against your app's isolated Postgres schema.
-- Do not use schema-qualified names — the schema is set automatically.

CREATE TABLE IF NOT EXISTS items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data       JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**`db-sdk.ts`** and **`storage-sdk.ts`** — helper functions wrapping gateway calls, using the embed token from the viewer shell (same pattern as existing `gateway-sdk.ts`).

`required_env_vars` in scaffold output gains: `APP_DB_SCHEMA` (injected automatically at deploy time — no manual setup needed).

Scaffold notes updated: *"Your app has an isolated Postgres schema and MinIO storage prefix, provisioned automatically at deploy time. Edit `db-migrations.sql` to define your tables."*

---

## Error Handling

| Scenario | Status | Response |
|---|---|---|
| Table not found in schema | 404 | `{ "error": "Table 'x' not found" }` |
| Unknown column in filter/body | 400 | `{ "error": "Unknown column: 'x'" }` |
| Row not found | 404 | `{ "error": "Row not found" }` |
| File not found | 404 | `{ "error": "File not found" }` |
| Upload exceeds 50MB | 413 | `{ "error": "File too large (max 50MB)" }` |
| Migration SQL error at deploy | — | Deployment fails with `MIGRATION_FAILED` error code |
| Provision record exists on redeploy | — | Skip silently (idempotent) |

---

## Testing

- `gateway/src/routes/db.test.ts` — mocked pg: table-not-found, injection attempt on column name, CRUD happy paths
- `gateway/src/routes/storage.test.ts` — mocked MinIO: upload, list, download, delete, size limit rejection
- `deploy-manager/src/queue/deploy-queue.test.ts` — extend existing: migration present → runs; absent → skips; SQL error → MIGRATION_FAILED

---

## Out of Scope (v1)

- Credit billing for DB/storage operations (deferred — architecture supports it)
- Advanced query filters (range, LIKE, OR) — equality only
- Cross-table joins or transactions
- Per-app storage quotas
- Migration versioning / rollback
