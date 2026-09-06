import type { ScreenVerdict } from "@/src/domain/screening/early-screen";
import type { RecommendationState } from "@/src/config/taxonomy";

/**
 * Research tier policy.
 *
 * The three tiers are an operational allocation of research effort, not a
 * concept the acquisition thesis itself defines - the thesis says a company
 * needs continuous, evidence-driven attention (sections 31-33); it does not
 * say into how many buckets to sort that attention. This policy is this
 * milestone's answer, versioned the same way the scoring configuration is:
 * an explicit, documented, adjustable rule rather than something buried in
 * an orchestrator.
 *
 * - `indexed`   - discovered identity with preliminary evidence at most.
 *                 Cheap monitoring only.
 * - `monitored` - credible eToro relevance. Normal refresh cadence, and a
 *                 material event can still move it.
 * - `deep`      - the strongest current acquisition relevance, or an urgent
 *                 material event. Richest source plan, highest refresh
 *                 priority.
 *
 * The function is pure and total: the same inputs always produce the same
 * tier and the same reason, which is what makes "re-running unchanged
 * inputs must not create a false transition" checkable at all - a caller
 * compares this result to the row's current tier and only writes a
 * transition when they differ.
 */

export type ResearchTier = "indexed" | "monitored" | "deep";

/** Recommendations that represent the strongest live acquisition relevance. */
const DEEP_RECOMMENDATIONS: readonly RecommendationState[] = ["priority_diligence", "blocked"];

/** Recommendations that represent credible, but not urgent, relevance. */
const MONITORED_RECOMMENDATIONS: readonly RecommendationState[] = ["shortlist", "partner", "watch"];

export interface TierDecisionInput {
  /** Section 32's early screen. A row that never passed it gets no tier attention. */
  screenVerdict: ScreenVerdict;
  /** Whether the entity gate is resolved. Unresolved identity caps the tier at `indexed` - section 28 orders this before scoring, and tiering follows the same order. */
  entityResolved: boolean;
  /** At least one claim or source has been recorded for this company. */
  hasEvidence: boolean;
  /** The most recent v0.3 recommendation, or null if the company has never been scored. */
  recommendation: RecommendationState | null;
  /**
   * A material event (section 31's monitored-event table) landed since the
   * company was last tiered, and has not yet been reflected in a new score.
   * This can move an otherwise-`indexed` company straight to `deep` before
   * scoring catches up - the tier exists to prioritise attention, and an
   * urgent signal is exactly what should not wait for the next scheduled pass.
   */
  hasUnreflectedMaterialEvent: boolean;
}

export interface TierDecision {
  tier: ResearchTier;
  reason: string;
}

export function decideResearchTier(input: TierDecisionInput): TierDecision {
  // Section 32: a row that failed the early screen was never a target, or is
  // a precedent rather than one. Neither earns ongoing research allocation -
  // a precedent stays *monitored for events* (see `remainsMonitored`), which
  // is a different question from how much research effort it deserves.
  if (input.screenVerdict === "screened_out") {
    return {
      tier: "indexed",
      reason: "Screened out at discovery; not a research target.",
    };
  }
  if (input.screenVerdict === "precedent") {
    return {
      tier: "indexed",
      reason: "Recorded as a precedent, not an available target; kept at the cheapest tier.",
    };
  }

  // Section 28: "Stop; resolve entity before scoring." An unresolved entity
  // means nothing downstream - evidence, recommendation, events - can yet be
  // trusted as being about one specific acquirable company.
  if (!input.entityResolved) {
    return {
      tier: "indexed",
      reason: "Legal entity is not yet resolved; cannot justify research effort beyond discovery.",
    };
  }

  if (input.hasUnreflectedMaterialEvent) {
    return {
      tier: "deep",
      reason: "An unreflected material event needs research before the next scheduled pass.",
    };
  }

  if (input.recommendation && DEEP_RECOMMENDATIONS.includes(input.recommendation)) {
    return {
      tier: "deep",
      reason: `Current recommendation is "${input.recommendation}", the strongest live relevance this policy recognises.`,
    };
  }

  if (input.recommendation && MONITORED_RECOMMENDATIONS.includes(input.recommendation)) {
    return {
      tier: "monitored",
      reason: `Current recommendation is "${input.recommendation}": credible relevance at a normal cadence.`,
    };
  }

  if (input.recommendation === "do_not_advance") {
    return {
      tier: "indexed",
      reason: 'Scored "do not advance"; cheap monitoring only unless new evidence changes that.',
    };
  }

  if (input.hasEvidence) {
    return {
      tier: "monitored",
      reason: "Passed the early screen and has recorded evidence, but has not yet been scored.",
    };
  }

  return {
    tier: "indexed",
    reason: "Discovered identity with no evidence gathered yet.",
  };
}
