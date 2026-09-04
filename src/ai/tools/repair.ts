import type { z } from "zod";
import {
  compareCompaniesInputSchema,
  explainScoreInputSchema,
  getCompanyFundamentalsInputSchema,
  getCompanyProfileInputSchema,
  getMarketMapInputSchema,
  getRecentEventsInputSchema,
  refreshCompanyInputSchema,
  runMonitoringQuickInputSchema,
  searchTargetsInputSchema,
} from "@/src/ai/tools/schemas";

/**
 * Repairing a malformed tool call.
 *
 * Tool inputs are validated by the SDK *before* `execute` runs, which means
 * `guardTool` - which wraps the execute body - cannot catch a bad argument. An
 * unrepaired validation failure throws mid-stream, and because the HTTP response
 * has already been returned by then, the route's own try/catch is long gone: the
 * answer dies half-written and the `agent_runs` row is never closed.
 *
 * This function is the SDK's escape hatch. It runs on a failed call and may hand
 * back a corrected one.
 *
 * ## What it will and will not fix
 *
 * It applies only *meaning-preserving* coercions - the shape was wrong, the
 * intent was not:
 *
 *   - `"10"` where a number belongs (models frequently quote numbers)
 *   - `"true"` where a boolean belongs
 *   - `"getquin"` where an array of slugs belongs
 *   - stray surrounding whitespace
 *
 * It deliberately does **not** repair a wrong *value*. If the model invents
 * `category: "fintech"`, which is not in the controlled taxonomy, the tempting
 * fix is to drop the offending filter and run the query anyway - and that would
 * be the worst possible outcome: the tool would succeed, return the unfiltered
 * universe, and the model would present it as the answer to a question about
 * fintech. A search that quietly stops meaning what it said is more dangerous
 * than one that fails. Those calls are left to fail, and `onError` turns them
 * into an honest message.
 */

/** The schema behind each tool, so a failed call can be re-validated. */
const INPUT_SCHEMAS: Record<string, z.ZodType> = {
  search_targets: searchTargetsInputSchema,
  get_company_profile: getCompanyProfileInputSchema,
  get_company_fundamentals: getCompanyFundamentalsInputSchema,
  compare_companies: compareCompaniesInputSchema,
  get_recent_events: getRecentEventsInputSchema,
  explain_score: explainScoreInputSchema,
  get_market_map: getMarketMapInputSchema,
  refresh_company: refreshCompanyInputSchema,
  run_monitoring_quick: runMonitoringQuickInputSchema,
};

/** Which fields are numbers, booleans or arrays, per tool. */
const NUMERIC_FIELDS = new Set(["minimum_score", "limit", "source_limit"]);
const BOOLEAN_FIELDS = new Set(["strict_limits"]);
const ARRAY_FIELDS = new Set(["slugs", "periods", "metrics", "dimensions", "event_types"]);

function coerceValue(key: string, value: unknown): unknown {
  if (NUMERIC_FIELDS.has(key) && typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : value;
  }
  if (BOOLEAN_FIELDS.has(key) && typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
    return value;
  }
  if (ARRAY_FIELDS.has(key) && !Array.isArray(value) && value !== null && value !== undefined) {
    // A single value where a list belongs. Comma-separated text is the other
    // common shape, and splitting it is still meaning-preserving.
    if (typeof value === "string" && value.includes(",")) {
      return value.split(",").map((entry) => entry.trim());
    }
    return [value];
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return value;
}

export interface RepairedInput {
  repaired: true;
  input: Record<string, unknown>;
}

export interface UnrepairableInput {
  repaired: false;
}

/**
 * Attempts to coerce a raw tool input into something its schema accepts.
 *
 * Exported separately from the SDK adapter so the coercion rules can be unit
 * tested without a model in the loop.
 */
export function repairToolInput(
  toolName: string,
  rawInput: unknown,
): RepairedInput | UnrepairableInput {
  const schema = INPUT_SCHEMAS[toolName];
  if (!schema) {
    // An unknown tool is not a shape problem; there is nothing to coerce toward.
    return { repaired: false };
  }

  let candidate: unknown = rawInput;
  if (typeof rawInput === "string") {
    try {
      candidate = JSON.parse(rawInput);
    } catch {
      return { repaired: false };
    }
  }

  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { repaired: false };
  }

  const coerced: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(candidate as Record<string, unknown>)) {
    coerced[key] = coerceValue(key, value);
  }

  const parsed = schema.safeParse(coerced);
  if (!parsed.success) {
    return { repaired: false };
  }
  return { repaired: true, input: coerced };
}
