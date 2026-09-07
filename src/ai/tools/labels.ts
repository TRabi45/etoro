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

export interface ToolActivityLabels {
  running: string;
  complete: string;
}

/** User-facing labels for tool activity, with no executor terminology. */
export const TOOL_ACTIVITY_LABELS: Record<AgentToolName, ToolActivityLabels> = {
  search_targets: {
    running: "Searching monitored targets",
    complete: "Searched monitored targets",
  },
  get_company_profile: { running: "Checking company profile", complete: "Checked company profile" },
  get_company_fundamentals: { running: "Checking fundamentals", complete: "Checked fundamentals" },
  compare_companies: { running: "Comparing companies", complete: "Compared companies" },
  get_recent_events: { running: "Checking recent events", complete: "Checked recent events" },
  explain_score: { running: "Checking score breakdown", complete: "Checked score breakdown" },
  get_market_map: { running: "Building market map", complete: "Built market map" },
  refresh_company: { running: "Researching company", complete: "Researched company" },
  run_monitoring_quick: {
    running: "Checking monitored sources",
    complete: "Checked monitored sources",
  },
};
