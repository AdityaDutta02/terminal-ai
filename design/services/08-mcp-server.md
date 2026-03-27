# Terminal AI — MCP Server

**Version:** 1.0
**Date:** 2026-03-27

---

## 1. Purpose

The MCP server exposes Terminal AI's platform capabilities to vibe-coding agents (Cursor, Windsurf, Claude Code, etc.). When a creator builds an app using an AI coding tool, the MCP server ensures the app is scaffolded correctly, uses the platform gateway, and is configured optimally before deployment.

**Core goal:** A vibe-coder should be able to say "build me a PDF summariser app for Terminal AI" and the MCP server guides the agent to produce a deployment-ready app with zero manual config.

**Tech:** Node.js MCP SDK (`@modelcontextprotocol/sdk`)
**Transport:** SSE (HTTP) — accessible at `mcp.terminalai.app`
**Auth:** API key issued per creator from their dashboard

---

## 2. MCP Tools

### `scaffold_app`
Generates the required file structure and boilerplate for a new Terminal AI app.

```typescript
Input: {
  framework: 'nextjs' | 'python' | 'streamlit' | 'static',
  app_name: string,
  description: string,
  category: string,
  uses_ai: boolean,
  uses_file_upload: boolean,
  generates_artifacts: boolean
}

Output: {
  files: Record<string, string>,  // filename → content
  instructions: string,
  required_env_vars: string[],
  notes: string[]
}
```

**What it generates:**

*Next.js:*
```
app/
  api/
    health/route.ts         ← required health check endpoint
    chat/route.ts           ← example AI call via Terminal AI gateway
  page.tsx                  ← example UI
lib/
  terminal-ai.ts            ← SDK wrapper for gateway calls
.env.example                ← TERMINAL_AI_GATEWAY_URL, TERMINAL_AI_APP_ID (no secrets)
terminal-ai.config.json     ← app metadata for MCP validation
```

*Python/Streamlit:*
```
app.py                      ← main entry point with health endpoint
requirements.txt            ← includes requests or httpx
terminal_ai.py              ← SDK wrapper for gateway calls
.env.example                ← TERMINAL_AI_GATEWAY_URL, TERMINAL_AI_APP_ID
terminal-ai.config.json     ← app metadata
```

---

### `get_gateway_sdk`
Returns ready-to-use code snippets for calling the Terminal AI API gateway.

```typescript
Input: {
  language: 'typescript' | 'python',
  use_case: 'chat' | 'completion' | 'search' | 'scrape' | 'kmodel',
  stream: boolean
}

Output: {
  code: string,          // copy-paste ready snippet
  explanation: string,
  credit_cost_estimate: string
}
```

**Example TypeScript chat snippet returned:**
```typescript
// Terminal AI Gateway — Chat
// Credentials injected automatically at deploy time
const response = await fetch(`${process.env.TERMINAL_AI_GATEWAY_URL}/proxy`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${embedToken}`,  // passed from frontend via postMessage
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    provider: 'openrouter',
    model: 'claude-3-5-haiku',
    messages,
    stream: true,
  }),
})
// Handle SSE stream...
```

---

### `configure_compression`
Auto-suggests and sets the compression level for a specific app based on its use case.

```typescript
Input: {
  app_id: string,
  app_description: string,
  file_types_used: string[],
  quality_requirement: 'exact_content' | 'readable_quality' | 'content_extraction_only'
}

Output: {
  recommended_level: 'high_fidelity' | 'balanced' | 'aggressive',
  reasoning: string,
  estimated_storage_reduction: string
}
```

**Decision logic:**
```
quality_requirement = 'exact_content' (medical, legal, design)
  → high_fidelity — no lossy compression

quality_requirement = 'readable_quality' (general document analysis)
  → balanced — good compression, no visible quality loss

quality_requirement = 'content_extraction_only' (video summarisation, audio transcription)
  → aggressive — content is all that matters, visuals irrelevant
```

Applies setting via deploy-manager API if app_id provided.

---

### `configure_session_limits`
Suggests and sets per-session credit caps and daily limits based on app type.

```typescript
Input: {
  app_id: string,
  app_category: string,
  typical_interaction_pattern: 'single_query' | 'multi_turn' | 'long_running_agent',
  models_used: string[]
}

Output: {
  recommended_credits_per_session: number,
  recommended_daily_cap_percent: number | null,
  reasoning: string
}
```

**Decision table:**
```
Pattern              Models                    Suggested session cap
─────────────────────────────────────────────────────────────────
single_query         haiku-class               10–15 credits
single_query         sonnet-class              20–30 credits
multi_turn           haiku-class               30–50 credits
multi_turn           sonnet-class              60–100 credits
long_running_agent   any                       150–300 credits (warn user)
kmodel_vote (K=3)    haiku × 3                 30–45 credits
kmodel_judge (K=3)   mixed + judge             80–150 credits
```

---

### `configure_kmodel`
Suggests the optimal K-model strategy based on the app's task type.

```typescript
Input: {
  app_id: string,
  task_type: 'factual_qa' | 'creative_writing' | 'code_generation' | 'data_extraction' | 'summarisation',
  accuracy_priority: 'high' | 'medium' | 'cost_optimised'
}

Output: {
  recommended_strategy: 'single' | 'kmodel_vote' | 'kmodel_judge',
  recommended_models: Array<{ provider: string, model: string }>,
  judge_model?: { provider: string, model: string },
  credit_cost_multiplier: number,
  reasoning: string
}
```

**Recommendations:**
```
factual_qa + high accuracy     → kmodel_vote, K=3 (haiku × 3), majority wins
                                  cheapest way to get factual accuracy
creative_writing + high        → kmodel_judge, K=3 mixed, claude as judge
                                  subjective quality needs a judge
code_generation + high         → kmodel_judge, K=3 mixed, claude as judge
data_extraction + medium       → single (structure is deterministic, retries handle errors)
summarisation + cost_optimised → single haiku (fast, cheap, good enough)
```

---

### `validate_deployment`
Validates that a creator's app repo meets Terminal AI's deployment requirements before the creator submits it.

```typescript
Input: {
  github_repo: string,     // owner/repo
  github_branch: string
}

Output: {
  valid: boolean,
  checks: Array<{
    name: string,
    status: 'pass' | 'fail' | 'warning',
    message: string,
    fix?: string          // actionable fix instruction
  }>
}
```

**Checks performed:**
```
✓/✗  Framework detected (Next.js / Python / Streamlit / Static)
✓/✗  Health endpoint exists
✓/✗  No hardcoded API keys (Gitleaks preview)
✓/✗  Terminal AI gateway SDK referenced in code
✓/✗  TERMINAL_AI_GATEWAY_URL used as base URL (not hardcoded provider URLs)
✓/✗  .env.example exists (no actual secrets)
✓/✗  terminal-ai.config.json present and valid
⚠    Direct provider imports found (openai, anthropic) — suggest replacing with gateway SDK
⚠    Missing error handling on gateway calls
```

---

### `get_deployment_status`
Returns current deployment and health status for a creator's app.

```typescript
Input: { app_id: string }

Output: {
  status: 'pending' | 'building' | 'live' | 'failed' | 'stopped',
  health: 'healthy' | 'unhealthy' | 'unknown',
  subdomain: string,
  last_deployed_at: string,
  current_version: string,
  recent_logs: string[]  // last 20 lines
}
```

---

### `list_supported_providers`
Returns all AI providers and models available through the gateway, with credit costs.

```typescript
Input: { category?: 'llm' | 'search' | 'scraping' | 'image' | 'audio' }

Output: Array<{
  provider: string,
  model: string,
  credits_per_1k_tokens?: number,
  credits_per_call?: number,
  capabilities: string[],
  recommended_for: string[]
}>
```

---

## 3. MCP Resources

Exposed as readable resources (not tools) — agents can pull these for context:

```
terminal-ai://docs/scaffolding-guide
  Full guide to building a Terminal AI app from scratch

terminal-ai://docs/gateway-api-reference
  API reference for /proxy, /upload, /artifacts endpoints

terminal-ai://docs/framework/{nextjs|python|streamlit|static}
  Framework-specific requirements and examples

terminal-ai://apps/{app_id}/config
  Current configuration for a creator's specific app

terminal-ai://platform/credit-rates
  Current credit costs per provider/model
```

---

## 4. Scaffolding Rules Enforced by MCP

These rules are non-negotiable. The MCP server rejects or warns on any app that violates them.

```
Rule 1: No direct provider API calls
  Creator apps MUST NOT call OpenAI, Anthropic, Groq, etc. directly.
  All AI calls go through TERMINAL_AI_GATEWAY_URL.
  Why: Platform tracks credits, enforces limits, and routes optimally.

Rule 2: Health endpoint required
  Non-static apps MUST expose GET /health returning 200.
  Why: Platform monitors app availability and triggers restarts.

Rule 3: No hardcoded secrets
  Zero API keys, tokens, or passwords in code.
  Use environment variables. Platform injects system vars at deploy time.
  Why: Security — secrets in code end up in logs and git history.

Rule 4: terminal-ai.config.json at repo root
  Declares: app_name, framework, gateway_version, health_check_path
  Why: Deploy manager uses this for validation and Coolify config.

Rule 5: Embed token usage
  Token received via postMessage must be used as Bearer token on all gateway calls.
  Never store in localStorage or cookies.
  Why: Security — prevents token leakage and cross-origin theft.
```

---

## 5. terminal-ai.config.json Spec

Required at repo root for all creator apps:

```json
{
  "app_name": "PDF Summariser",
  "framework": "nextjs",
  "gateway_version": "1",
  "health_check_path": "/api/health",
  "port": 3000,
  "requires_file_upload": true,
  "generates_artifacts": false,
  "min_credits_per_session": 10
}
```

---

## 6. Creator Authentication

```
MCP auth flow:
  1. Creator logs in to Terminal AI dashboard
  2. Settings → Developer → [Generate MCP API Key]
  3. Key issued: tai_mcp_{random_32_bytes_hex}
  4. Key stored hashed in DB, shown once to creator
  5. Creator adds to their MCP client config:
       {
         "mcpServers": {
           "terminal-ai": {
             "url": "https://mcp.terminalai.app/sse",
             "headers": { "Authorization": "Bearer tai_mcp_..." }
           }
         }
       }

Rate limiting: 60 MCP tool calls/minute per creator
Key rotation: creator can generate new key (old key immediately invalidated)
```
