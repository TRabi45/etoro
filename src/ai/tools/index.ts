import { tool } from "ai";
import {
  executeCompareCompanies,
  executeExplainScore,
  executeGetCompanyFundamentals,
  executeGetCompanyProfile,
  executeGetMarketMap,
  executeGetRecentEvents,
  executeRefreshCompany,
  executeRunMonitoringQuick,
  executeSearchTargets,
} from "@/src/ai/tools/executors";
import { guardTool } from "@/src/ai/tools/envelope";
import { AGENT_TOOL_NAMES, TOOL_ACTIVITY_LABELS, type AgentToolName } from "@/src/ai/tools/labels";
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
 * The tool registry exposed to the model.
 *
 * Every tool is wrapped in `guardTool`, so a thrown exception becomes a returned
 * error envelope. That is what keeps a failed database call from killing the
 * whole streamed answer: the agent receives the failure as data and can tell the
 * user what went wrong.
 *
 * The descriptions are part of the safety surface, not decoration. They tell the
 * model what a tool does *and* what its absence of data means, because the most
 * likely failure mode is not a wrong tool call - it is filling an empty result
 * with plausible recollection.
 */
export const agentTools = {
  search_targets: tool({
    description:
      "Search the monitored company universe with optional filters, ranked by final score. Use for discovery questions such as 'which companies should we acquire in Germany'. Returns only companies recorded in the database; if it returns nothing, no such company is recorded and you must say so rather than naming companies from memory.",
    inputSchema: searchTargetsInputSchema,
    execute: async (input) => guardTool("search_targets", () => executeSearchTargets(input)),
  }),

  get_company_profile: tool({
    description:
      "Fetch one company's full profile: identity, evidence packet (facts with claim ids and citations, contradictions, unknowns, freshness), fundamentals, strategic assessment and score. Use this for any factual question about a specific company.",
    inputSchema: getCompanyProfileInputSchema,
    execute: async (input) =>
      guardTool("get_company_profile", () => executeGetCompanyProfile(input)),
  }),

  get_company_fundamentals: tool({
    description:
      "Fetch a company's financial and commercial observations, including which measures are unknown or not applicable. A measure with status 'unknown' or 'not_applicable' has no value and must never be reported as zero.",
    inputSchema: getCompanyFundamentalsInputSchema,
    execute: async (input) =>
      guardTool("get_company_fundamentals", () => executeGetCompanyFundamentals(input)),
  }),

  compare_companies: tool({
    description:
      "Compare two to four companies on aligned fields. Missing values are returned as null and mean 'unknown' or 'not assessed' - never treat a null as a zero or as a weak result.",
    inputSchema: compareCompaniesInputSchema,
    execute: async (input) => guardTool("compare_companies", () => executeCompareCompanies(input)),
  }),

  get_recent_events: tool({
    description:
      "Fetch material recorded events since a date, for 'what changed?' questions. Returns only events written to the database by the monitoring pipeline; an empty result means nothing has been recorded, not that nothing happened in the world.",
    inputSchema: getRecentEventsInputSchema,
    execute: async (input) => guardTool("get_recent_events", () => executeGetRecentEvents(input)),
  }),

  explain_score: tool({
    description:
      "Fetch the deterministic score breakdown for a company: normalised positive score, risk and evidence penalties, weighted coverage, final score, per-dimension contributions, the recommendation and the reasons Acquire was ruled out. These numbers are computed in code - explain them, never recalculate or adjust them.",
    inputSchema: explainScoreInputSchema,
    execute: async (input) => guardTool("explain_score", () => executeExplainScore(input)),
  }),

  get_market_map: tool({
    description:
      "Aggregate counts of the monitored universe by strategic theme and geography, including how many companies have no recorded headquarters.",
    inputSchema: getMarketMapInputSchema,
    execute: async (input) => guardTool("get_market_map", () => executeGetMarketMap(input)),
  }),

  refresh_company: tool({
    description:
      "Queue a refresh of one company's research. Currently a stub: it accepts the request but fetches nothing, because live source retrieval is not implemented yet. Never imply that new information has arrived after calling it.",
    inputSchema: refreshCompanyInputSchema,
    execute: async (input) => guardTool("refresh_company", () => executeRefreshCompany(input)),
  }),

  run_monitoring_quick: tool({
    description:
      "Run a small monitoring pass now: read the configured fintech news feeds, fetch what has not been seen before, extract claims and events, and write them. Returns the counts this run actually produced. It reads whatever the feeds published and cannot be aimed at a topic or a company. It is deliberately tiny - one or two documents - so it fits inside a conversation; the scheduled daily run covers more.",
    inputSchema: runMonitoringQuickInputSchema,
    execute: async (input) =>
      guardTool("run_monitoring_quick", () => executeRunMonitoringQuick(input)),
  }),
} as const;

/**
 * The registry and the UI's name list must agree.
 *
 * Names and labels live in `labels.ts`, which imports nothing, so the browser
 * can read them without pulling this file - and this file's executors - into
 * the client bundle. These two assignments fail to compile if a tool is added
 * here and not there, or the reverse.
 */
type RegisteredToolName = keyof typeof agentTools;
const _registryCoversEveryName: Record<AgentToolName, true> = Object.fromEntries(
  AGENT_TOOL_NAMES.map((name) => [name, true]),
) as Record<AgentToolName, true>;
const _namesCoverEveryRegisteredTool: Record<RegisteredToolName, true> =
  _registryCoversEveryName satisfies Record<RegisteredToolName, true>;
void _namesCoverEveryRegisteredTool;

export { AGENT_TOOL_NAMES, TOOL_ACTIVITY_LABELS, type AgentToolName };
