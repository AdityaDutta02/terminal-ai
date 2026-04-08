/**
 * gateway/scripts/sync-model-pricing.ts
 *
 * Fetches all models from OpenRouter and upserts them into gateway.model_pricing.
 * Models no longer returned by OpenRouter are marked is_available = false.
 *
 * Usage: npx tsx gateway/scripts/sync-model-pricing.ts
 *
 * Required env var: DATABASE_URL
 */

import { Pool } from "pg";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OpenRouterPricing {
  prompt: string;   // cost per token as a string number
  completion: string;
}

interface OpenRouterTopProvider {
  max_completion_tokens: number | null;
}

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: OpenRouterPricing;
  context_length: number | null;
  top_provider: OpenRouterTopProvider | null;
}

interface OpenRouterResponse {
  data: OpenRouterModel[];
}

interface SyncSummary {
  inserted: number;
  updated: number;
  deactivated: number;
  skipped: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractProvider(modelId: string): string {
  const slash = modelId.indexOf("/");
  return slash !== -1 ? modelId.slice(0, slash) : modelId;
}

function computeCreditCost(
  contextLength: number | null,
  maxCompletionTokens: number | null,
  promptPricePerToken: number,
  completionPricePerToken: number
): number {
  const inputTokens = contextLength ?? 0;
  const outputTokens = maxCompletionTokens ?? 0;

  const inputCost = inputTokens * promptPricePerToken;
  const outputCost = outputTokens * completionPricePerToken;
  const maxRealCost = inputCost + outputCost;

  return Math.max(1, Math.ceil(maxRealCost / 0.40));
}

// ---------------------------------------------------------------------------
// Fetch models from OpenRouter
// ---------------------------------------------------------------------------

async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const url = "https://openrouter.ai/api/v1/models";
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `OpenRouter API request failed: ${response.status} ${response.statusText}`
    );
  }

  const body = (await response.json()) as OpenRouterResponse;

  if (!Array.isArray(body.data)) {
    throw new Error("Unexpected OpenRouter response shape: missing data array");
  }

  return body.data;
}

// ---------------------------------------------------------------------------
// Database operations
// ---------------------------------------------------------------------------

async function upsertModels(
  pool: Pool,
  models: OpenRouterModel[]
): Promise<SyncSummary> {
  const summary: SyncSummary = {
    inserted: 0,
    updated: 0,
    deactivated: 0,
    skipped: 0,
  };

  const activeModelIds: string[] = [];

  for (const model of models) {
    const promptPricePerToken = parseFloat(model.pricing?.prompt ?? "0");
    const completionPricePerToken = parseFloat(
      model.pricing?.completion ?? "0"
    );

    // Filter out free/broken models — keep only models with at least one non-zero price
    if (promptPricePerToken === 0 && completionPricePerToken === 0) {
      summary.skipped++;
      continue;
    }

    const contextLength = model.context_length ?? null;
    const maxCompletionTokens =
      model.top_provider?.max_completion_tokens ?? null;

    const promptCostPerMillion = promptPricePerToken * 1_000_000;
    const completionCostPerMillion = completionPricePerToken * 1_000_000;

    const creditCost = computeCreditCost(
      contextLength,
      maxCompletionTokens,
      promptPricePerToken,
      completionPricePerToken
    );

    const provider = extractProvider(model.id);

    const result = await pool.query<{ xmax: string }>(
      `
      INSERT INTO gateway.model_pricing (
        model_id,
        name,
        provider,
        prompt_cost_per_million,
        completion_cost_per_million,
        context_length,
        max_completion_tokens,
        credit_cost,
        is_available,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW())
      ON CONFLICT (model_id) DO UPDATE SET
        name                      = EXCLUDED.name,
        provider                  = EXCLUDED.provider,
        prompt_cost_per_million   = EXCLUDED.prompt_cost_per_million,
        completion_cost_per_million = EXCLUDED.completion_cost_per_million,
        context_length            = EXCLUDED.context_length,
        max_completion_tokens     = EXCLUDED.max_completion_tokens,
        credit_cost               = EXCLUDED.credit_cost,
        is_available              = true,
        updated_at                = NOW()
      RETURNING xmax::text
      `,
      [
        model.id,
        model.name,
        provider,
        promptCostPerMillion,
        completionCostPerMillion,
        contextLength,
        maxCompletionTokens,
        creditCost,
      ]
    );

    // xmax = 0 means a new row was inserted; non-zero means an existing row was updated
    const xmax = result.rows[0]?.xmax ?? "0";
    if (xmax === "0") {
      summary.inserted++;
    } else {
      summary.updated++;
    }

    activeModelIds.push(model.id);
  }

  // Mark models no longer returned by OpenRouter as unavailable
  if (activeModelIds.length > 0) {
    const deactivateResult = await pool.query(
      `
      UPDATE gateway.model_pricing
      SET is_available = false, updated_at = NOW()
      WHERE is_available = true
        AND model_id != ALL($1::text[])
      `,
      [activeModelIds]
    );
    summary.deactivated = deactivateResult.rowCount ?? 0;
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[sync-model-pricing] ERROR: DATABASE_URL env var is not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.info("[sync-model-pricing] Fetching models from OpenRouter...");
    const models = await fetchOpenRouterModels();
    console.info(
      `[sync-model-pricing] Received ${models.length} models from OpenRouter`
    );

    console.info("[sync-model-pricing] Upserting into gateway.model_pricing...");
    const summary = await upsertModels(pool, models);

    console.info("[sync-model-pricing] Sync complete:");
    console.info(`  Inserted:    ${summary.inserted}`);
    console.info(`  Updated:     ${summary.updated}`);
    console.info(`  Deactivated: ${summary.deactivated}`);
    console.info(
      `  Skipped (free/no-price): ${summary.skipped}`
    );
  } catch (err) {
    console.error("[sync-model-pricing] ERROR:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
