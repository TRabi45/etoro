import type { ResearchTier } from "@/src/domain/tiering/tier-policy";

/**
 * Refresh scheduling policy.
 *
 * Locked decision 11: "Refresh frequency is driven by events, materiality,
 * research tier, freshness, and missing critical evidence - not by rescanning
 * every field at one fixed interval." This function is that policy, kept
 * separate from the tier policy because a company can need refreshing sooner
 * than its tier's baseline cadence without its tier changing - a `monitored`
 * company with a funding announcement needs research now, not a promotion to
 * `deep` first and a refresh second.
 *
 * Pure and total for the same reason `decideResearchTier` is: given the same
 * inputs and the same `now`, it always returns the same answer, so calling it
 * again with unchanged inputs is a no-op rather than a way to accidentally
 * push a company's schedule back out.
 */

/** Baseline cadence per tier, in days. Operational configuration, not thesis policy. */
const BASELINE_CADENCE_DAYS: Record<ResearchTier, number> = {
  deep: 3,
  monitored: 14,
  indexed: 30,
};

/** A run that did not finish cleanly is retried soon, not on the full cadence. */
const RETRY_CADENCE_DAYS = 1;

export type LastResearchOutcome = "complete" | "partial" | "blocked" | "failed" | null;

export interface RefreshDecisionInput {
  tier: ResearchTier;
  now: Date;
  /** A monitored event (section 31) has not yet been reflected in research. */
  hasUnreflectedMaterialEvent: boolean;
  /** The most recent research run's outcome for this company; null if never researched. */
  lastResearchOutcome: LastResearchOutcome;
}

export interface RefreshDecision {
  nextRefreshAt: Date;
  reason: string;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function computeNextRefresh(input: RefreshDecisionInput): RefreshDecision {
  if (input.hasUnreflectedMaterialEvent) {
    // Eligible immediately. A material event is exactly the case the fixed-
    // interval design this replaces would have missed for up to a full cycle.
    return {
      nextRefreshAt: input.now,
      reason: "An unreflected material event makes this company eligible for refresh now.",
    };
  }

  if (
    input.lastResearchOutcome === "partial" ||
    input.lastResearchOutcome === "failed" ||
    input.lastResearchOutcome === "blocked"
  ) {
    return {
      nextRefreshAt: addDays(input.now, RETRY_CADENCE_DAYS),
      reason: `Last research run was "${input.lastResearchOutcome}"; retrying sooner than the tier's normal cadence rather than waiting a full cycle.`,
    };
  }

  const cadenceDays = BASELINE_CADENCE_DAYS[input.tier];
  return {
    nextRefreshAt: addDays(input.now, cadenceDays),
    reason: `Tier "${input.tier}" baseline cadence: every ${cadenceDays} day${cadenceDays === 1 ? "" : "s"}.`,
  };
}
