import { HARD_GATES_V0_3, SCORING_POLICY_V0_3, THESIS_MODEL_V0_3 } from "@/src/config/scoring/v0-3";
import type {
  ScoringConfiguration,
  ScoringInput,
  ScoringPolicy,
  SubMetricInput,
} from "@/src/domain/scoring/types";

/**
 * Synthetic scoring fixtures.
 *
 * Invented inputs built to exercise the arithmetic and the decision table. No
 * historical research result is seeded here: the engine is tested against
 * constructed cases whose expected outputs can be worked out by hand, and real
 * companies stay in the gold benchmark where they belong.
 */

export const TEST_POLICY: ScoringPolicy = SCORING_POLICY_V0_3;
export const TEST_MODEL: ScoringConfiguration = THESIS_MODEL_V0_3;

export const SUB_METRIC_KEYS = THESIS_MODEL_V0_3.dimensions.flatMap((dimension) =>
  dimension.subMetrics.map((subMetric) => subMetric.key),
);

/** Every hard gate clear, which is the state a normal target starts in. */
export function allGatesClear(): ScoringInput["hardGates"] {
  return Object.fromEntries(HARD_GATES_V0_3.map((gate) => [gate.key, { state: "clear" as const }]));
}

/** Control is the strongest route, so the buy-beats-alternatives check passes. */
export function buyWinsRoutes(): ScoringInput["routes"] {
  return {
    buy: { score: 5, reason: "Control owns the roadmap and the team." },
    build: { score: 2, reason: "Slower in a security-critical domain." },
    partner: { score: 3, reason: "Available, but does not transfer the IP." },
    invest: { score: 2, reason: "No governance rights." },
    watch: { score: 1, reason: "The window may close." },
  };
}

/** A commodity capability: partnership is stronger than control. */
export function partnerWinsRoutes(): ScoringInput["routes"] {
  return {
    buy: { score: 2, reason: "Balance-sheet intensive and expensive." },
    build: { score: 2, reason: "Possible, but slow." },
    partner: { score: 5, reason: "The same capability without the regulatory burden." },
    invest: { score: 3, reason: "Retains optionality." },
    watch: { score: 2, reason: "No current catalyst." },
  };
}

/**
 * Every sub-metric scored at the same value.
 *
 * A uniform score of `s` always normalises to `100 * s / 5` whatever the weights
 * are, which makes the expected result checkable by hand.
 */
export function uniformInput(
  uniformScore = 4,
  overrides: Partial<ScoringInput> = {},
): ScoringInput {
  return {
    subMetrics: Object.fromEntries(
      SUB_METRIC_KEYS.map((key) => [key, { status: "scored" as const, score: uniformScore }]),
    ),
    hardGates: allGatesClear(),
    routes: buyWinsRoutes(),
    ...overrides,
  };
}

/** Replaces named sub-metrics, leaving the rest uniformly scored. */
export function inputWithStatuses(
  statuses: Record<string, SubMetricInput>,
  uniformScore = 4,
  overrides: Partial<ScoringInput> = {},
): ScoringInput {
  return uniformInput(uniformScore, {
    subMetrics: { ...uniformInput(uniformScore).subMetrics, ...statuses },
    ...overrides,
  });
}

/** One gate in a non-clear state, everything else clear. */
export function gatesWith(
  key: string,
  state: "triggered" | "unresolved",
): ScoringInput["hardGates"] {
  return { ...allGatesClear(), [key]: { state } };
}
