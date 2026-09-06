import { describe, expect, it } from "vitest";
import {
  HARD_GATES_V0_3,
  SCORING_THRESHOLDS_V0_3,
  THESIS_MODEL_V0_3,
} from "@/src/config/scoring/v0-3";
import { RECOMMENDATION_STATES, STRATEGIC_THEMES } from "@/src/config/taxonomy";
import { scoringResultSchema } from "@/src/domain/scoring/types";
import {
  CALIBRATION_CASES,
  DOCUMENTED_WORKED_EXAMPLE,
  reachableCoverages,
} from "@/tests/evaluation/thesis/calibration-cases";
import {
  THESIS_DIMENSIONS,
  THESIS_GATES,
  THESIS_PILLARS,
  THESIS_RECOMMENDATION_LABELS,
  THESIS_THRESHOLDS,
  THESIS_TOTAL_WEIGHT,
  thesisScore,
} from "@/tests/evaluation/thesis/thesis-model";

/**
 * Conformance of the implementation to `docs/ACQUISITION_THESIS.md`.
 *
 * The acquisition thesis is a business document, and the only honest way to
 * claim the system implements it is to state what it requires in executable
 * terms and check the code against them.
 *
 * The suite has two halves. The first checks the fixtures against the document's
 * own worked arithmetic, so a failure below cannot be blamed on a mis-transcribed
 * weight. The second checks the production configuration.
 *
 * A remaining gap is written as `it.fails` - a real assertion, inverted, because
 * the gap it describes is not yet closed. It ratchets: the moment the code starts
 * conforming, the inverted test fails for passing unexpectedly, and whoever
 * closed the gap has to remove the marker. A specification gap cannot quietly
 * become satisfied without someone noticing.
 *
 * A failure here is a specification gap, never a flaky test. Do not adjust an
 * expectation to make it pass; correct it against the PDF, or change the code.
 */

describe("the thesis fixtures reproduce the document's own arithmetic", () => {
  it("the dimension weights total 100", () => {
    const total = THESIS_DIMENSIONS.reduce((sum, dimension) => sum + dimension.weight, 0);
    expect(total).toBe(THESIS_TOTAL_WEIGHT);
  });

  it("reproduces the worked example in section 35", () => {
    // "If 75 weight points are known and their weighted contribution is 60, the
    // normalized score is 80 with 75% coverage."
    //
    // Reconstructed from dimension scores rather than asserted directly, so the
    // reference implementation is what is being checked.
    const result = thesisScore({
      scores: {
        strategic_fit: 4,
        incremental_capability: 4,
        market_customers_distribution: 4,
        product_technology: 4,
        financial_quality: 4,
        regulatory_feasibility: null,
        integration_team: null,
        deal_feasibility: null,
      },
    });

    expect(result.coverage).toBeCloseTo(DOCUMENTED_WORKED_EXAMPLE.expectedCoverage, 10);
    expect(result.normalized).toBeCloseTo(DOCUMENTED_WORKED_EXAMPLE.expectedNormalized, 10);
    expect(result.lowerBound).toBeCloseTo(DOCUMENTED_WORKED_EXAMPLE.expectedLowerBound, 10);
    expect(result.upperBound).toBeCloseTo(DOCUMENTED_WORKED_EXAMPLE.expectedUpperBound, 10);
  });

  it("never turns an unknown criterion into a zero", () => {
    // Section 26: "An unknown criterion is N/A, not 0 or 3."
    const everythingKnown = thesisScore({
      scores: Object.fromEntries(THESIS_DIMENSIONS.map((d) => [d.key, 4])),
    });
    const oneUnknown = thesisScore({
      scores: Object.fromEntries(
        THESIS_DIMENSIONS.map((d) => [d.key, d.key === "financial_quality" ? null : 4]),
      ),
    });

    expect(oneUnknown.normalized).toBeCloseTo(everythingKnown.normalized, 10);
    expect(oneUnknown.coverage).toBeLessThan(everythingKnown.coverage);
    expect(oneUnknown.upperBound - oneUnknown.lowerBound).toBeGreaterThan(0);
  });
});

describe("open question: section 35 coverage against section 26 weights", () => {
  it("records which documented coverage figures the weights cannot produce", () => {
    // Every dimension weight is a multiple of 5, so dimension-level coverage can
    // only land on a multiple of 5%. Four of the five calibration examples do
    // not.
    //
    // The engine answers this with sub-metrics: each dimension carries at least
    // one, and coverage is measured across them, so a partly evidenced dimension
    // contributes a fraction of its weight. Section 27's "vary sub-metrics by
    // family" is where the per-archetype evidence requirements of sections 11-19
    // will live. This test keeps the original inconsistency visible, because the
    // launch configuration has one sub-metric per dimension and therefore still
    // produces coverage in steps of 5%.
    const reachable = reachableCoverages();
    const unreachable = CALIBRATION_CASES.filter(
      (testCase) => !reachable.has(testCase.documentedCoverage),
    ).map((testCase) => `${testCase.name} (${testCase.documentedCoverage * 100}%)`);

    expect(unreachable).toEqual([
      "AlphaVest (88%)",
      "BetaOptions (81%)",
      "GammaAI (72%)",
      "DeltaCustody (76%)",
    ]);
  });
});

describe("the scoring configuration conforms to the thesis", () => {
  it("uses the eight dimensions the thesis specifies", () => {
    const configured = THESIS_MODEL_V0_3.dimensions.map((dimension) => dimension.key);
    const expected = THESIS_DIMENSIONS.map((dimension) => dimension.key);

    expect(configured).toEqual(expected);
  });

  it("weights each dimension as the thesis specifies", () => {
    const configured = Object.fromEntries(
      THESIS_MODEL_V0_3.dimensions.map((dimension) => [dimension.key, dimension.weight]),
    );
    const expected = Object.fromEntries(
      THESIS_DIMENSIONS.map((dimension) => [dimension.key, dimension.weight]),
    );

    expect(configured).toEqual(expected);
  });

  it("carries the anchor wording, so a 0-5 score means the same thing twice", () => {
    // Section 27's anchors are what makes a 4 comparable between two analysts
    // and between two companies. Shipping the weights without them would leave
    // the scale undefined.
    for (const dimension of THESIS_MODEL_V0_3.dimensions) {
      expect(dimension.anchors.low.length).toBeGreaterThan(0);
      expect(dimension.anchors.mid.length).toBeGreaterThan(0);
      expect(dimension.anchors.high.length).toBeGreaterThan(0);
    }
  });

  it("carries the thesis decision thresholds", () => {
    expect(SCORING_THRESHOLDS_V0_3).toMatchObject({
      priorityMinScore: THESIS_THRESHOLDS.priorityMinScore,
      priorityMinCoverage: THESIS_THRESHOLDS.priorityMinCoverage,
      shortlistMinScore: THESIS_THRESHOLDS.shortlistMinScore,
      conditionalWatchlistMinScore: THESIS_THRESHOLDS.conditionalWatchlistMinScore,
      coverageGateFloor: THESIS_THRESHOLDS.coverageGateFloor,
    });
  });

  it("implements all seven hard gates, including client assets and integrity", () => {
    const configured = HARD_GATES_V0_3.map((gate) => gate.key).sort();
    const expected = THESIS_GATES.map((gate) => gate.key).sort();

    expect(configured).toEqual(expected);
  });

  it("orders the entity gate ahead of scoring, and only the entity gate", () => {
    // Section 28: "Stop; resolve entity before scoring." Every other gate is
    // evaluated against a score that already exists.
    const beforeScoring = HARD_GATES_V0_3.filter((gate) => gate.resolveBeforeScoring);
    expect(beforeScoring.map((gate) => gate.key)).toEqual(["entity"]);
  });

  it("reports coverage beside the score rather than as a penalty", () => {
    // Mandatory principle 5: "Never hide missing information inside a score."
    const resultShape = scoringResultSchema.shape;
    expect(Object.keys(resultShape)).not.toContain("evidencePenalty");
    expect(Object.keys(resultShape)).not.toContain("riskPenalty");
    expect(Object.keys(resultShape)).toContain("coverage");
  });

  it("returns an uncertainty range with every score", () => {
    // Section 26: "A normalized 82 at 55% coverage with a 45-90 range is not
    // '82/100.' Display 82 - 55% coverage - 45-90 range."
    const resultShape = scoringResultSchema.shape;
    expect(Object.keys(resultShape)).toContain("lowerBound");
    expect(Object.keys(resultShape)).toContain("upperBound");
  });

  it("always names the runner-up route", () => {
    // Section 23: "The agent must always present the second-best route."
    const resultShape = scoringResultSchema.shape;
    expect(Object.keys(resultShape)).toContain("bestRoute");
    expect(Object.keys(resultShape)).toContain("secondBestRoute");
    expect(Object.keys(resultShape)).toContain("buyBeatsAlternatives");
  });
});

describe("the taxonomy conforms to the thesis", () => {
  it("offers the six recommendation labels of the output contract", () => {
    const missing = THESIS_RECOMMENDATION_LABELS.filter(
      (label) => !(RECOMMENDATION_STATES as readonly string[]).includes(label),
    );
    expect(missing).toEqual([]);
  });

  it.fails("names eToro's four pillars, with AI and blockchain as enablers", () => {
    // OPEN. Section 3 uses management's own language: Trading, Investing, Wealth
    // Management, Neo-Banking. The current taxonomy promotes on-chain
    // infrastructure to a pillar and omits Investing, which changes what the
    // heaviest dimension in the model - strategic fit, 25 points - measures.
    //
    // Closing this means migrating the `strategic_theme` enum and reclassifying
    // every company already tagged under it, which is a data change rather than
    // a configuration one. It belongs with the nine target families of section
    // 10, which are also still missing.
    expect([...STRATEGIC_THEMES].sort()).toEqual([...THESIS_PILLARS].sort());
  });
});
