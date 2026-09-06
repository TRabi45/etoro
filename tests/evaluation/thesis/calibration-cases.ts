/**
 * §35. Five fictional companies, with the verdict the document says each must
 * produce.
 *
 * The document is explicit that "These are not real targets or investment
 * recommendations. They demonstrate correct model behavior." They therefore live
 * under `tests/` with the gold benchmark, never in the seed, and an ESLint rule
 * already forbids production modules from importing anything here.
 *
 * These are the closest thing this project has to an acceptance test written by
 * the business rather than by the engineer, which makes them the right thing to
 * write down before changing the engine.
 */

import { THESIS_DIMENSIONS, THESIS_TOTAL_WEIGHT } from "./thesis-model";

export interface CalibrationCase {
  name: string;
  description: string;
  /** §35, as printed. Normalized score out of 100. */
  documentedScore: number;
  /** §35, as printed. */
  documentedCoverage: number;
  /** The gate column of §35. `null` means every gate is open. */
  gate: { key: string; state: "unresolved" | "triggered" } | null;
  /** The recommendation label from §34 that §35's "Correct output" column requires. */
  expectedLabel: string;
  /** §35's own statement of what the case is for. */
  proves: string;
}

export const CALIBRATION_CASES: readonly CalibrationCase[] = [
  {
    name: "AlphaVest",
    description:
      "Local savings manager with active customers, entity-level license and complementary distribution.",
    documentedScore: 82,
    documentedCoverage: 0.88,
    gate: null,
    expectedLabel: "priority_diligence",
    proves: "A direct-fit candidate is allowed to rise.",
  },
  {
    name: "BetaOptions",
    description:
      "Advanced options broker with strong unit economics but unclear change-of-control treatment.",
    documentedScore: 77,
    documentedCoverage: 0.81,
    gate: { key: "regulatory", state: "unresolved" },
    expectedLabel: "shortlist",
    proves: "An unresolved gate limits action; no advance to IC before review.",
  },
  {
    name: "GammaAI",
    description: "Generic financial chatbot without unique data or measurable investment outcomes.",
    documentedScore: 45,
    documentedCoverage: 0.72,
    gate: null,
    expectedLabel: "do_not_advance",
    proves: "No AI-label bias. §27: no automatic bonus for an AI label.",
  },
  {
    name: "DeltaCustody",
    description: "Good wallet fit with an unresolved material security incident.",
    documentedScore: 74,
    documentedCoverage: 0.76,
    gate: { key: "security", state: "triggered" },
    expectedLabel: "blocked",
    proves: "A serious gate overrides the score. The score alone cannot advance it.",
  },
  {
    name: "EpsilonReg",
    description: "Promising cross-border compliance tool with partial customer and financial data.",
    documentedScore: 68,
    documentedCoverage: 0.6,
    gate: { key: "coverage", state: "unresolved" },
    expectedLabel: "watch",
    proves: "No false confidence under sparse data; not Priority until coverage reaches 75%.",
  },
] as const;

/**
 * §35's worked arithmetic example, kept separate because it is the one place the
 * document shows its own calculation end to end.
 *
 * "If 75 weight points are known and their weighted contribution is 60, the
 * normalized score is 80 with 75% coverage. The lower range assumes zero for the
 * missing 25 points; the upper assumes five."
 */
export const DOCUMENTED_WORKED_EXAMPLE = {
  knownWeight: 75,
  contribution: 60,
  expectedNormalized: 80,
  expectedCoverage: 0.75,
  expectedLowerBound: 60,
  expectedUpperBound: 85,
} as const;

/**
 * Every coverage value the §26 weights can actually produce.
 *
 * Coverage is `Σ known weights ÷ 100`, so the reachable set is the set of subset
 * sums of the eight dimension weights. Computed rather than reasoned about,
 * because the point of the check is to be mechanical.
 */
export function reachableCoverages(): ReadonlySet<number> {
  let sums = new Set<number>([0]);
  for (const dimension of THESIS_DIMENSIONS) {
    const next = new Set<number>(sums);
    for (const sum of sums) {
      next.add(sum + dimension.weight);
    }
    sums = next;
  }
  return new Set([...sums].map((sum) => sum / THESIS_TOTAL_WEIGHT));
}
