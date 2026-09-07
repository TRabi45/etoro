/**
 * Tool names and their display labels.
 *
 * A leaf module on purpose: it imports nothing, so the browser can read it
 * without dragging anything behind it.
 *
 * The chat panel shows which tools ran, which means the UI needs their names.
 * It used to take them from the tool registry, and the registry imports every
 * executor - so the whole server pipeline travelled into the browser bundle
 * behind a string map. That was already wrong when it merely shipped Zod schemas
 * and prompt text to the client; it became a build failure the moment an
 * executor reached `node:dns/promises`, which the browser chunking context
 * cannot resolve.
 *
 * Splitting the names out fixes the cause rather than the symptom. The registry
 * is checked against this list at compile time, so the two cannot drift.
 */

export const AGENT_TOOL_NAMES = [
  "search_targets",
  "get_company_profile",
  "get_company_fundamentals",
  "compare_companies",
  "get_recent_events",
  "explain_score",
  "get_market_map",
  "refresh_company",
  "run_monitoring_quick",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

/** Human-readable labels for the "running a tool" indicator in the chat UI. */
export const TOOL_ACTIVITY_LABELS: Record<AgentToolName, string> = {
  search_targets: "Searching monitored targets",
  get_company_profile: "Fetching company profile",
  get_company_fundamentals: "Reading fundamentals",
  compare_companies: "Comparing companies",
  get_recent_events: "Checking recent events",
  explain_score: "Retrieving score breakdown",
  get_market_map: "Building market map",
  refresh_company: "Running company research",
  run_monitoring_quick: "Running a monitoring pass",
};
