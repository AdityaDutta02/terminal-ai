# Terminal AI — Optimizer Service

**Version:** 1.0
**Date:** 2026-03-27

---

## 1. Overview

The optimizer helps creators improve their apps over time using behavioral signals from real usage, without storing any user PII. It is built on top of Langfuse (self-hosted) as the observation layer, with a BullMQ analysis job that surfaces actionable suggestions.

**Key principle:** Implicit behavioral signals outperform explicit ratings. We watch what users *do*, not what they *say*.

**Consent model:**
- Creator opt-in per app (checkbox in deployment settings)
- User opt-out at signup and in privacy settings (overrides creator opt-in)
- Both must be true for any logging to occur

---

## 2. Architecture

```
Creator app (iframe)
  │ API calls via embed token
  ▼
API Gateway (:3001)
  │ If optimizer_enabled AND NOT user.optimizer_opt_out:
  │   Log trace to Langfuse SDK
  │   Log behavioral signals as Langfuse scores
  ▼
Langfuse (:3011) ← self-hosted, EU region
  │ Stores: traces, scores, session metadata
  │ Never stores: raw prompt text, raw user content
  ▼
Weekly BullMQ analysis job
  │ Queries Langfuse API for low-scoring traces
  │ Sends anonymised metadata to cheap LLM
  │ Parses suggestions
  ▼
optimizer.suggestions table
  │
  ▼
Creator dashboard → Suggestions inbox → Apply / Dismiss / A/B Test
```

---

## 3. Signal Collection

### What Is Logged to Langfuse

```javascript
// Per API call trace (if optimizer enabled + user consented)
langfuse.trace({
  id: apiCallId,
  sessionId: SHA256(userId + appId + weekNumber),  // rotated weekly, non-reversible
  userId: SHA256(userId + appId + 'optimizer'),     // hashed, not raw
  metadata: {
    appId,
    model,
    provider,
    strategy,           // single | kmodel_vote | kmodel_judge
    latencyMs,
    promptTokens,
    completionTokens,
    hasFileUpload: boolean,
    hasArtifact: boolean,
  }
  // input/output are NOT logged (privacy-safe)
})
```

### Behavioral Signals (scores attached to traces)

**Tier 1 — Automatic, zero user action:**

| Signal | How Captured | What It Means |
|--------|-------------|---------------|
| `regenerate_count` | API gateway counts repeat calls with same session+turn | >1 = user unsatisfied with response |
| `session_abandonment` | Session closes within 30s of last response | Response was irrelevant or bad |
| `follow_up_latency_ms` | Time between response and next user message | Very short = didn't read it; very long = useful but complex |
| `artifact_opened` | Platform shell emits event when download button clicked | Artifact was relevant and useful |
| `session_depth` | Total turns in session | Deeper = more engaged |

**Tier 2 — Cheap semantic classification:**

```
After every user message (if it follows an AI response):
  Background job (BullMQ, async, does not delay response):
    Feed next_user_message to classifier model (gpt-4o-mini, ~$0.001/call):

    System: "Classify the user's message as one of:
             CORRECTION - user is correcting or disagreeing with prior response
             BUILDING_ON - user is extending or refining the prior response
             TOPIC_CHANGE - user has moved to a different subject
             CLARIFICATION - user is asking for explanation of prior response
             ABANDONMENT - user's message suggests prior response failed
             Reply with only the classification label."

    User: "{next_message}"

    Result stored as score: follow_up_intent
    Cost: ~₹0.08 per 1000 classifications
```

**Tier 3 — Explicit (optional, minimal friction):**

| Signal | UI | When Shown |
|--------|-----|-----------|
| `reaction_emoji` | 👍 😐 👎 quick tap | Below every AI response (if creator enables) |
| `inline_correction` | User highlights text, clicks "This is wrong" | On text selection |
| `free_text_feedback` | Optional open text field | After 3+ regenerations in one session |

---

## 4. Privacy Architecture

```
What Langfuse stores:          What we configure Langfuse NOT to store:
─────────────────────────────  ──────────────────────────────────────────
Session hash (rotated weekly)  Raw user_id
App ID                         User email
Model metadata                 Prompt text
Latency + token counts         Response text
Behavioral scores              File content
Follow-up intent label         User conversation history

Masking applied via Langfuse SDK middleware:
  Before any data leaves the API gateway to Langfuse:
    trace.input = undefined   (stripped)
    trace.output = undefined  (stripped)
    trace.userId = SHA256(userId + appId + 'optimizer-salt')

Session hash rotation:
  weekNumber = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000))
  sessionHash = SHA256(userId + appId + weekNumber)
  → Cannot track same user across weeks
  → Cannot reverse to get original user ID

Analysis job never receives:
  - Raw prompt or response content
  - User identifiers (even hashed)
  - File content or artifacts
```

---

## 5. Analysis Pipeline

### Weekly BullMQ Job

```
Schedule: every Sunday 02:00 UTC (low traffic period)
Per app with optimizer_enabled = true and >= 20 interactions in the past 7 days:

  Step 1: Query Langfuse API
    GET /api/public/traces?tags=appId:{appId}&limit=200&orderBy=timestamp:desc
    Filter to: traces with regenerate_count >= 2 OR follow_up_intent = CORRECTION OR ABANDONMENT
    Take top 30 worst-performing traces by composite score

  Step 2: Build analysis payload (no PII, no content)
    {
      app_type: "document_analysis",        // from app metadata
      model_used: "claude-3-5-haiku",
      sample_count: 30,
      patterns: {
        avg_regenerate_count: 2.3,
        correction_rate: 0.34,             // 34% of follow-ups are corrections
        abandonment_rate: 0.18,
        avg_session_depth: 2.1,            // low = users giving up early
        avg_latency_ms: 4200,
        artifact_open_rate: 0.22
      },
      current_system_prompt_template: "..."  // creator's system prompt (not user content)
    }

  Step 3: Send to gpt-4o-mini (cheapest capable model)
    System: "You are an AI prompt engineer analysing usage patterns
             for an AI app. Based on the behavioural metrics provided,
             identify failure patterns and suggest specific improvements
             to the system prompt, model choice, and configuration.
             Be specific and provide before/after examples."
    User: "{analysis_payload as JSON}"

  Step 4: Parse LLM response → structured suggestions
    Each suggestion: { type, current_value, suggested_value, reasoning, confidence }

  Step 5: INSERT optimizer.suggestions (one row per suggestion)
          INSERT optimizer.analysis_runs (findings + sample_size)

Cost per analysis run: ~₹0.80 (30 trace summaries + gpt-4o-mini)
Cost per app per month: ~₹3.20 (4 weekly runs)
```

---

## 6. Creator Dashboard — Suggestions Inbox

```
[Optimizer Tab in Creator Dashboard]

  Analysis runs: "Last run: 2 days ago · 68 sessions analysed"

  ┌──────────────────────────────────────────────────────────────┐
  │ 📊 High regeneration rate (34% of sessions)                 │
  │                                                              │
  │ TYPE: System Prompt Update                                   │
  │ CONFIDENCE: High                                             │
  │                                                              │
  │ CURRENT:                                                     │
  │   "You are a helpful assistant that analyses documents."     │
  │                                                              │
  │ SUGGESTED:                                                   │
  │   "You are a precise document analyst. Always structure      │
  │    responses as: Summary (2-3 sentences), Key Points         │
  │    (bullet list), Action Items (if applicable). Be           │
  │    concise — avoid filler phrases."                          │
  │                                                              │
  │ REASON: Users regenerated after vague responses.             │
  │ Follow-up corrections requested more structure.              │
  │                                                              │
  │ [Apply Now] [Run A/B Test] [Dismiss]                         │
  └──────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────┐
  │ 🔄 Model may be oversized for this task                     │
  │                                                              │
  │ TYPE: Model Change                                           │
  │ CONFIDENCE: Medium                                           │
  │                                                              │
  │ CURRENT:  claude-3-5-sonnet (avg latency: 4200ms)           │
  │ SUGGESTED: claude-3-5-haiku (avg latency: 800ms, 4x cheaper)│
  │                                                              │
  │ REASON: Task pattern (short document summaries) doesn't     │
  │ require Sonnet capability. Haiku shows equivalent quality    │
  │ on similar tasks.                                            │
  │                                                              │
  │ [Apply Now] [Run A/B Test] [Dismiss]                         │
  └──────────────────────────────────────────────────────────────┘
```

### A/B Testing Flow

```
Creator clicks [Run A/B Test] on a suggestion:

  Langfuse experiment created:
    Variant A: current config (50% of sessions)
    Variant B: suggested config (50% of sessions)

  Split logic (in API gateway):
    session_hash mod 2 === 0 → Variant A
    session_hash mod 2 === 1 → Variant B
    Consistent per session (same user always gets same variant within a week)

  A/B test runs for: 7 days OR 100 sessions per variant (whichever comes first)

  Results shown in dashboard:
    Variant A: 34% correction rate, 2.3 avg regenerations
    Variant B: 12% correction rate, 1.1 avg regenerations ← winner
    [Apply Variant B to all sessions] [Keep A] [Run longer]

  On apply: optimizer.suggestions.status = 'applied'
            App config updated in marketplace.apps
            No redeploy needed (system prompt change applied at gateway level)
```

---

## 7. Langfuse Setup Notes

```
Self-hosted deployment:
  Docker Compose services: langfuse-server, langfuse-worker, langfuse-postgres
  (Langfuse has its own Postgres instance, separate from platform Postgres)
  Port: 3011 (internal, not exposed externally)
  Admin UI accessible via: Traefik route, admin-only, basicauth

Environment:
  LANGFUSE_SECRET_KEY: generated at install
  LANGFUSE_PUBLIC_KEY: used by API gateway SDK
  DATABASE_URL: langfuse-specific postgres connection
  NEXTAUTH_SECRET: for Langfuse's own auth

Data retention:
  Langfuse default: unlimited retention
  Configure: max 90 days trace retention (GDPR + storage management)
  Old traces: auto-purged by Langfuse's built-in cleanup job
```
