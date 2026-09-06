import { describe, expect, it } from "vitest";
import {
  HARD_GATES_V0_2,
  RISK_COMPONENTS_V0_2,
  SCORING_MODELS_V0_2,
  SCORING_THRESHOLDS_V0_2,
} from "@/src/config/scoring/v0-2";
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
 * Written before the engine changes, and expected to fail. That is the point:
 * the acquisition thesis is a business document, and the only honest way to
 * claim the system implements it is to state what it requires in executable
 * terms first, watch the current system disagree, and then close the gap.
 *
 * The suite has two halves. The first checks the fixtures against the
 * document's own worked arithmetic, so a later failure cannot be blamed on a
 * mis-transcribed weight. Those run normally and must stay green.
 *
 * The second checks the production configuration and engine against those
 * fixtures, and every one of those is currently `it.fails` - a real assertion,
 * inverted, because the gap it describes is not yet closed. This keeps CI
 * meaningful rather than permanently red, and it ratchets: the moment the engine
 * starts conforming, the inverted test fails for passing unexpectedly, and
 * whoever closed the gap has to remove the marker. A specification gap cannot
 * quietly become satisfied without someone noticing.
 *
 * A failure here is a specification gap, never a flaky test. Do not adjust an
 * expectation to make it pass; correct it against the PDF, or change the engine.
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
    // reference implementation is what is being checked. Strategic fit,
    // incremental capability, market and financial quality sum to 65 weight;
    // adding product/technology reaches 75.
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
    // Section 26: "An unknown criterion is N/A, not 0 or 3." A dimension nobody
    // has established must leave the normalized score alone and show up in
    // coverage instead.
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
    // Every dimension weight is a multiple of 5, so coverage can only land on a
    // multiple of 5%. Four of the five calibration examples do not.
    //
    // This test documents the finding rather than hiding it. Section 27's
    // "vary sub-metrics by family" is the likely resolution - coverage measured
    // across sub-metrics, so a partly evidenced dimension contributes a fraction
    // of its weight. Until the model owner decides, the arithmetic is recorded
    // as the document states it.
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
  it.fails("publishes one global weight set, not one per path", () => {
    // Section 26 defines a single model. Section 27 puts family variation in
    // sub-metrics: "Keep global weights, but vary sub-metrics by family."
    const configuredPaths = Object.keys(SCORING_MODELS_V0_2);
    expect(configuredPaths).toEqual([]);
  });

  it.fails("uses the eight dimensions the thesis specifies", () => {
    const configured = Object.values(SCORING_MODELS_V0_2).flatMap((model) =>
      model.dimensions.map((dimension) => dimension.key),
    );
    const expected = THESIS_DIMENSIONS.map((dimension) => dimension.key);

    expect([...new Set(configured)].sort()).toEqual([...expected].sort());
  });

  it.fails("weights each dimension as the thesis specifies", () => {
    const configured = Object.fromEntries(
      Object.values(SCORING_MODELS_V0_2).flatMap((model) =>
        model.dimensions.map((dimension) => [dimension.key, dimension.weight]),
      ),
    );
    const expected = Object.fromEntries(
      THESIS_DIMENSIONS.map((dimension) => [dimension.key, dimension.weight]),
    );

    expect(configured).toEqual(expected);
  });

  it.fails("carries the thesis decision thresholds", () => {
    expect(SCORING_THRESHOLDS_V0_2).toMatchObject({
      priorityMinScore: THESIS_THRESHOLDS.priorityMinScore,
      priorityMinCoverage: THESIS_THRESHOLDS.priorityMinCoverage,
      shortlistMinScore: THESIS_THRESHOLDS.shortlistMinScore,
      conditionalWatchlistMinScore: THESIS_THRESHOLDS.conditionalWatchlistMinScore,
      coverageGateFloor: THESIS_THRESHOLDS.coverageGateFloor,
    });
  });

  it.fails("implements all seven hard gates, including client assets and integrity", () => {
    const configured = HARD_GATES_V0_2.map((gate) => gate.key).sort();
    const expected = THESIS_GATES.map((gate) => gate.key).sort();

    expect(configured).toEqual(expected);
  });

  it.fails("does not subtract risk from the score", () => {
    // Section 27: a severe regulatory issue "is handled by a gate, not
    // double-counted without policy". Section 26's model has no risk term at
    // all; risk lives in the dimension anchors and in the gates.
    expect(RISK_COMPONENTS_V0_2).toEqual([]);
  });

  it.fails("reports coverage beside the score rather than as a penalty", () => {
    // Mandatory principle 5: "Never hide missing information inside a score."
    // Principle 6: "Always display score, coverage and uncertainty together."
    const resultShape = scoringResultSchema.shape;
    expect(Object.keys(resultShape)).not.toContain("evidencePenalty");
    expect(Object.keys(resultShape)).not.toContain("riskPenalty");
  });

  it.fails("returns an uncertainty range with every score", () => {
    // Section 26: "A normalized 82 at 55% coverage with a 45-90 range is not
    // '82/100.' Display 82 - 55% coverage - 45-90 range."
    const resultShape = scoringResultSchema.shape;
    expect(Object.keys(resultShape)).toContain("lowerBound");
    expect(Object.keys(resultShape)).toContain("upperBound");
  });
});

describe("the taxonomy conforms to the thesis", () => {
  it.fails("names eToro's four pillars, with AI and blockchain as enablers", () => {
    // Section 3 uses management's own language: Trading, Investing, Wealth
    // Management, Neo-Banking. The current taxonomy promotes on-chain
    // infrastructure to a pillar and omits Investing, which changes what the
    // heaviest dimension in the model - strategic fit, 25 points - measures.
    expect([...STRATEGIC_THEMES].sort()).toEqual([...THESIS_PILLARS].sort());
  });

  it.fails("offers the six recommendation labels of the output contract", () => {
    // Section 34's labels are pipeline actions. The current states are routes
    // (acquire / build / partner / invest / monitor), which section 23 treats as
    // a separate axis: a label says what to do now, a route says which form of
    // ownership the evidence supports.
    const missing = THESIS_RECOMMENDATION_LABELS.filter(
      (label) => !(RECOMMENDATION_STATES as readonly string[]).includes(label),
    );
    expect(missing).toEqual([]);
  });
});
