import {
  EVIDENCE_BANDS_V0_2,
  HARD_GATES_V0_2,
  PLATFORM_MODEL_V0_2,
  RISK_COMPONENTS_V0_2,
  RISK_PENALTY_CAP,
  SCORING_THRESHOLDS_V0_2,
  TUCK_IN_MODEL_V0_2,
} from "@/src/config/scoring/v0-2";
import type { DimensionInput, ScoringInput, ScoringPolicy } from "@/src/domain/scoring/types";

/**
 * Synthetic scoring fixtures.
 *
 * These are invented inputs built to exercise the arithmetic and the decision
 * table. No historical research result is seeded here: the engine is tested
 * against constructed cases whose expected outputs can be worked out by hand,
 * and the real companies stay in the gold benchmark where they belong.
 */

export const TEST_POLICY: ScoringPolicy = {
  riskComponents: [...RISK_COMPONENTS_V0_2],
  riskPenaltyCap: RISK_PENALTY_CAP,
  evidenceBands: [...EVIDENCE_BANDS_V0_2],
  hardGates: [...HARD_GATES_V0_2],
  thresholds: { ...SCORING_THRESHOLDS_V0_2 },
};

/** Every risk component at zero, which needs no reasons. */
export function noRisk(): ScoringInput["risk"] {
  return Object.fromEntries(RISK_COMPONENTS_V0_2.map((component) => [component.key, { value: 0 }]));
}

/** Every hard gate clear. */
export function allGatesClear(): ScoringInput["hardGates"] {
  return Object.fromEntries(HARD_GATES_V0_2.map((gate) => [gate.key, { state: "clear" as const }]));
}

export function allResolved(): ScoringInput["resolution"] {
  return {
    legalIdentity: "resolved",
    maStatus: "resolved",
    regulatoryPerimeter: "resolved",
  };
}

/** Acquisition beats every alternative, so the route gate passes. */
export function acquisitionWinsRoutes(): ScoringInput["routeAssessment"] {
  return {
    acquire: { score: 5, reason: "Control owns the roadmap and the team." },
    build: { score: 2, reason: "Slower in a security-critical domain." },
    partner: { score: 3, reason: "Available but does not transfer IP." },
    invest: { score: 2, reason: "No governance rights." },
    monitor: { score: 1, reason: "The window may close." },
  };
}

/** A commodity capability: partnership is the strongest route, not control. */
export function partnershipWinsRoutes(): ScoringInput["routeAssessment"] {
  return {
    acquire: { score: 2, reason: "Balance-sheet intensive and expensive." },
    build: { score: 2, reason: "Possible but slow." },
    partner: { score: 5, reason: "Same capability without the regulatory burden." },
    invest: { score: 3, reason: "Retains optionality." },
    monitor: { score: 2, reason: "No current catalyst." },
  };
}

function scoredDimensions(keys: readonly string[], score: number): Record<string, DimensionInput> {
  return Object.fromEntries(keys.map((key) => [key, { status: "scored" as const, score }]));
}

export const PLATFORM_DIMENSION_KEYS = PLATFORM_MODEL_V0_2.dimensions.map(
  (dimension) => dimension.key,
);
export const TUCK_IN_DIMENSION_KEYS = TUCK_IN_MODEL_V0_2.dimensions.map(
  (dimension) => dimension.key,
);

/**
 * A Platform input with every dimension scored at the same value, which makes
 * the expected normalised score trivial to reason about: a uniform score of `s`
 * always normalises to `100 * s / 5`, whatever the weights are.
 */
export function platformInput(
  uniformScore = 4,
  overrides: Partial<ScoringInput> = {},
): ScoringInput {
  return {
    path: "platform",
    subtype: null,
    dimensions: scoredDimensions(PLATFORM_DIMENSION_KEYS, uniformScore),
    risk: noRisk(),
    evidencePenalty: 0,
    hardGates: allGatesClear(),
    resolution: allResolved(),
    routeAssessment: acquisitionWinsRoutes(),
    ...overrides,
  };
}

export function tuckInInput(uniformScore = 4, overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    path: "tuck_in",
    subtype: null,
    dimensions: scoredDimensions(TUCK_IN_DIMENSION_KEYS, uniformScore),
    risk: noRisk(),
    evidencePenalty: 0,
    hardGates: allGatesClear(),
    resolution: allResolved(),
    routeAssessment: acquisitionWinsRoutes(),
    ...overrides,
  };
}

/**
 * Replaces the status of named Platform dimensions, leaving the rest scored.
 * Used to drive coverage to a specific value by removing known weights.
 */
export function platformWithStatuses(
  statuses: Record<string, DimensionInput>,
  uniformScore = 4,
): ScoringInput {
  return platformInput(uniformScore, {
    dimensions: { ...scoredDimensions(PLATFORM_DIMENSION_KEYS, uniformScore), ...statuses },
  });
}
