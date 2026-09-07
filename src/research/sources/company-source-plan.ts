import { FETCH_TIMEOUT_MS, MAX_RESPONSE_BYTES } from "@/src/research/sources/fetcher";
import { getSearchProviderCapability } from "@/src/research/sources/search-provider";

/**
 * Bounded, company-specific source planning (workstream C).
 *
 * This proposes *candidates*; it fetches nothing itself. `researchCompany`
 * (workstream D) is the caller that walks the plan through the existing
 * fetcher, respecting the budget this module attaches. Keeping the two apart
 * means the priority and budget rules are unit-testable with no network, no
 * database and no fetcher in the loop - the same separation `early-screen.ts`
 * uses for the discovery-time screen.
 *
 * One failed source costs one source, not the whole company run: this module
 * never throws for a malformed or unresolvable candidate, and always returns
 * a warning instead of silently shrinking the plan.
 */

export type SourceFamily =
  | "existing_evidence"
  | "official"
  | "regulatory"
  | "ownership_registry"
  | "filing"
  | "transaction_release"
  | "financial_reporting"
  | "specialist_database"
  | "news_event";

/**
 * Highest-value first, per section 32: "favouring authoritative evidence."
 * `existing_evidence` leads even official pages - it is already-fetched,
 * already-trusted material, so reusing it costs nothing a fresh fetch would.
 * `news_event` trails everything: it is how a lead is found, not proof of
 * anything material on its own (section 29's evidence-level table puts
 * general reporting at level C, below a company's own primary material).
 */
const FAMILY_PRIORITY: readonly SourceFamily[] = [
  "existing_evidence",
  "official",
  "regulatory",
  "ownership_registry",
  "filing",
  "transaction_release",
  "financial_reporting",
  "specialist_database",
  "news_event",
];

export interface SourceCandidate {
  url: string;
  family: SourceFamily;
  reason: string;
}

export interface SourcePlanBudget {
  maxCandidateUrls: number;
  maxFetchedDocuments: number;
  maxAttempts: number;
  perSourceTimeoutMs: number;
  maxResponseBytes: number;
  perHostConcurrency: number;
  overallDeadlineMs: number;
}

/**
 * Deliberately modest. This is a vertical slice for one company at a time,
 * not a crawler - locked decision 13 rules out the latter outright.
 */
export const DEFAULT_COMPANY_SOURCE_BUDGET: SourcePlanBudget = {
  maxCandidateUrls: 25,
  maxFetchedDocuments: 8,
  maxAttempts: 16,
  perSourceTimeoutMs: FETCH_TIMEOUT_MS,
  maxResponseBytes: MAX_RESPONSE_BYTES,
  perHostConcurrency: 2,
  overallDeadlineMs: 90_000,
};

/**
 * Common official paths worth checking from a verified primary domain. A
 * fixed, short list - not a crawl - so this stays bounded regardless of how
 * large the actual site is.
 */
const OFFICIAL_PATHS = [
  "/",
  "/about",
  "/about-us",
  "/investors",
  "/investor-relations",
  "/newsroom",
  "/press",
  "/legal",
  "/privacy",
];

export interface CompanySearchLead {
  label: string;
  query: string | null;
}

export interface BuildCompanySourcePlanInput {
  /** Null when the company has no verified primary domain yet. */
  primaryDomain: string | null;
  searchLeads: CompanySearchLead[];
  /** URLs already linked to a stored claim or event for this company. */
  existingEvidenceUrls: string[];
  budget?: Partial<SourcePlanBudget>;
}

export interface CompanySourcePlan {
  candidates: SourceCandidate[];
  budget: SourcePlanBudget;
  warnings: string[];
}

function normalizeCandidateUrl(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).toString();
  } catch {
    return null;
  }
}

export function buildCompanySourcePlan(input: BuildCompanySourcePlanInput): CompanySourcePlan {
  const budget: SourcePlanBudget = { ...DEFAULT_COMPANY_SOURCE_BUDGET, ...input.budget };
  const warnings: string[] = [];
  const seen = new Set<string>();
  const candidates: SourceCandidate[] = [];

  function propose(rawUrl: string, family: SourceFamily, reason: string): void {
    const normalized = normalizeCandidateUrl(rawUrl);
    if (!normalized) {
      warnings.push(`Discarded a malformed candidate URL: "${rawUrl}".`);
      return;
    }
    if (seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    candidates.push({ url: normalized, family, reason });
  }

  for (const url of input.existingEvidenceUrls) {
    propose(
      url,
      "existing_evidence",
      "Already linked to a stored claim or event for this company.",
    );
  }

  if (input.primaryDomain) {
    for (const path of OFFICIAL_PATHS) {
      propose(
        `https://${input.primaryDomain}${path}`,
        "official",
        "Official page on the verified primary domain.",
      );
    }
  } else {
    warnings.push("No verified primary domain on record; official-page discovery was skipped.");
  }

  // Search leads name what to look for (a query), not where to find it - only
  // a configured search provider can turn one into an actual URL candidate.
  // No provider ships in this milestone (see search-provider.ts), so every
  // recorded lead is an explicit, visible coverage gap rather than a silently
  // shorter plan.
  const searchCapability = getSearchProviderCapability();
  if (input.searchLeads.length > 0 && !searchCapability.configured) {
    const labels = input.searchLeads.map((lead) => lead.label).join(", ");
    warnings.push(
      `${input.searchLeads.length} search lead(s) recorded (${labels}) could not be resolved: ${searchCapability.warning} Coverage is limited to the primary domain and existing evidence.`,
    );
  }

  const ranked = candidates
    .slice()
    .sort(
      (left, right) => FAMILY_PRIORITY.indexOf(left.family) - FAMILY_PRIORITY.indexOf(right.family),
    );
  const bounded = ranked.slice(0, budget.maxCandidateUrls);

  if (ranked.length > bounded.length) {
    warnings.push(
      `${ranked.length - bounded.length} lower-priority candidate URL(s) dropped by the ${budget.maxCandidateUrls}-URL plan budget.`,
    );
  }

  return { candidates: bounded, budget, warnings };
}
