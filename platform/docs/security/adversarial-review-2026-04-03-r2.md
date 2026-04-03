# Adversarial Security Review — Round 2
**Date:** 2026-04-03  
**Scope:** Full current implementation (post-R1 fixes)  
**Source:** Codex adversarial review pass  
**Status:** 3 findings — all fixed in this round

---

## Summary

After the Round 1 review fixed 27 findings, a follow-up Codex adversarial review surfaced 3 additional issues that were not in scope for R1. All three are fixed in commit following this document.

---

## Findings

### [CRITICAL] F1 — Internal API tenant identity not validated against DB

**File:** `app/api/internal/channels/route.ts`  
**Status:** Fixed

**Description:**  
`getCreatorIdFromRequest()` returns the raw value of the `X-Creator-Id` HTTP header. Both internal API routes that create channels and apps accepted this value as-is and used it directly as the DB tenant identity (`creator_id`). While the `apps` route did verify channel ownership against this ID, it never confirmed the ID maps to a real, active creator in the `user` table. A mcp-server bug or misconfiguration could inject a synthetic or recycled UUID and silently create orphaned records under a non-existent (or non-creator) account.

**Fix:**  
Both `channels/route.ts` and `apps/route.ts` now run a DB existence check (`SELECT 1 FROM public."user" WHERE id = $1 AND role IN ('creator', 'admin')`) before any writes. If the check fails, the request is rejected with 403.

---

### [HIGH] F2 — Anonymous preview token: SELECT-then-UPDATE race on dedup

**File:** `app/api/embed-token/preview/route.ts`  
**Status:** Fixed

**Description:**  
The one-free-session-per-IP+cookie limit was enforced by a `SELECT` check, followed by an `UPDATE` to deduct `creator_balance`, followed by an `INSERT ... ON CONFLICT DO NOTHING`. Two concurrent requests from the same client both passed the `SELECT` check before either recorded usage, causing `creator_balance` to be deducted twice while only one `INSERT` landed (the second silently no-oped on conflict). This allowed bypassing the one-session limit by issuing parallel requests.

**Fix:**  
Flipped to insert-first dedup: the `INSERT INTO gateway.anonymous_usage` now runs before the balance deduction. If `rowCount === 0` (conflict — usage already recorded), the request returns 402 immediately without touching `creator_balance`. The `UPDATE` only runs when `rowCount > 0`, eliminating the race.

---

### [HIGH] F3 — Deployment SSE stream: missing ownership check

**File:** `app/api/creator/deployments/[deploymentId]/events/route.ts`  
**Status:** Fixed

**Description:**  
The events (SSE log stream) endpoint called `requireCreator()` to check authentication but performed no ownership check. Any authenticated creator could stream another creator's deployment logs by supplying a known or guessed `deploymentId`. The sibling endpoint (`deployments/[deploymentId]/route.ts`) had the correct ownership JOIN but the events route was overlooked.

**Fix:**  
Added the same ownership query used in the sibling route:
```sql
SELECT d.id FROM deployments.deployments d
JOIN marketplace.apps a ON a.id = d.app_id
JOIN marketplace.channels c ON c.id = a.channel_id
WHERE d.id = $1 AND c.creator_id = $2 AND a.deleted_at IS NULL
```
Returns 404 if the check fails before proxying the SSE stream.

---

## Post-fix Status

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| F1 | Critical | Internal API creatorId not validated in DB | Fixed |
| F2 | High | Preview token SELECT-UPDATE race condition | Fixed |
| F3 | High | Deployment events IDOR (no ownership check) | Fixed |
