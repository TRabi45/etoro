import { describe, expect, it } from "vitest";
import { HARD_GATES_V0_3, THESIS_MODEL_V0_3 } from "@/src/config/scoring/v0-3";
import { decideRecommendation, scoreTarget } from "@/src/domain/scoring/engine";
import { ScoringConfigurationError, ScoringInputError } from "@/src/domain/scoring/errors";
import type { ScoringConfiguration } from "@/src/domain/scoring/types";
import { CALIBRATION_CASES } from "@/tests/evaluation/thesis/calibration-cases";
import {
  allGatesClear,
  buyWinsRoutes,
  gatesWith,
  inputWithStatuses,
  partnerWinsRoutes,
  TEST_MODEL,
  TEST_POLICY,
  uniformInput,
} from "@/tests/fixtures/scoring";

/**
 * The deterministic scoring engine, v0.3.
 *
 * The centre of this suite is the calibration block: five companies the
 * acquisition thesis invented specifically to pin down correct behaviour, each
 * with the verdict it must produce. Everything else exists to make those five
 * trustworthy - if the arithmetic is wrong, agreeing with the examples would
 * only mean two errors cancelling.
 */

function score(input: Parameters<typeof scoreTarget>[0]["input"]) {
  return scoreTarget({ config: TEST_MODEL, policy: TEST_POLICY, input });
}

describe("the arithmetic of section 26", () => {
  it("normalises a uniform score independently of the weights", () => {
    // 100 * s / 5, whatever the weight distribution is.
    expect(score(uniformInput(4)).normalizedScore).toBe(80);
    expect(score(uniformInput(5)).normalizedScore).toBe(100);
    expect(score(uniformInput(0)).normalizedScore).toBe(0);
  });

  it("reports full coverage and a zero-width range when everything is scored", () => {
    const result = score(uniformInput(4));
    expect(result.coverage).toBe(1);
    expect(result.lowerBound).toBe(80);
    expect(result.upperBound).toBe(80);
  });

  it("keeps an unknown out of the score and shows it as coverage and range", () => {
    // Section 26: "An unknown criterion is N/A, not 0 or 3."
    const unknown = score(inputWithStatuses({ financial_quality: { status: "unknown" } }, 4));
    const scoredZero = score(
      inputWithStatuses({ financial_quality: { status: "scored", score: 0 } }, 4),
    );

    expect(unknown.normalizedScore).toBe(80);
    expect(scoredZero.normalizedScore).toBeLessThan(80);

    // Financial quality is 10 of 100 points.
    expect(unknown.coverage).toBe(0.9);
    expect(unknown.lowerBound).toBe(72);
    expect(unknown.upperBound).toBe(82);
  });

  it("removes a not-applicable measure from both sides of the ratio", () => {
    // A wallet has no assets under management. That is not a gap in the
    // evidence, and charging it as one would punish the company for its own
    // business model.
    const result = score(
      inputWithStatuses(
        {
          financial_quality: {
            status: "not_applicable",
            reason: "Pre-revenue; no unit economics exist to assess.",
          },
        },
        4,
      ),
    );

    expect(result.normalizedScore).toBe(80);
    expect(result.coverage).toBe(1);
    expect(result.breakdown.find((entry) => entry.key === "financial_quality")?.status).toBe(
      "not_applicable",
    );
  });

  it("widens the range as more evidence goes missing", () => {
    const oneUnknown = score(inputWithStatuses({ deal_feasibility: { status: "unknown" } }, 4));
    const twoUnknown = score(
      inputWithStatuses(
        { deal_feasibility: { status: "unknown" }, financial_quality: { status: "unknown" } },
        4,
      ),
    );

    const narrow = (oneUnknown.upperBound ?? 0) - (oneUnknown.lowerBound ?? 0);
    const wide = (twoUnknown.upperBound ?? 0) - (twoUnknown.lowerBound ?? 0);
    expect(wide).toBeGreaterThan(narrow);
    expect(twoUnknown.coverage).toBeLessThan(oneUnknown.coverage);
  });

  it("never subtracts risk or an evidence penalty from the score", () => {
    // Mandatory principle 5. The result carries no penalty field at all, so the
    // score cannot absorb one.
    const result = score(uniformInput(4));
    expect(result).not.toHaveProperty("riskPenalty");
    expect(result).not.toHaveProperty("evidencePenalty");
  });

  it("refuses an input that leaves nothing to score", () => {
    const everythingNotApplicable = uniformInput(4, {
      subMetrics: Object.fromEntries(
        THESIS_MODEL_V0_3.dimensions.flatMap((dimension) =>
          dimension.subMetrics.map((subMetric) => [
            subMetric.key,
            { status: "not_applicable" as const, reason: "Out of scope for this archetype." },
          ]),
        ),
      ),
    });

    expect(() => score(everythingNotApplicable)).toThrow(ScoringInputError);
  });
});

describe("section 35 calibration: the five companies the thesis specifies", () => {
  function verdictFor(testCase: (typeof CALIBRATION_CASES)[number], bestRoute: "buy" | "partner") {
    const triggered = testCase.gate?.state === "triggered" ? [testCase.gate.key] : [];
    const unresolved = testCase.gate?.state === "unresolved" ? [testCase.gate.key] : [];

    return decideRecommendation({
      normalizedScore: testCase.documentedScore,
      coverage: testCase.documentedCoverage,
      policy: TEST_POLICY,
      triggeredGates: triggered,
      unresolvedGates: unresolved,
      bestRoute,
    });
  }

  for (const testCase of CALIBRATION_CASES) {
    it(`${testCase.name}: ${testCase.proves}`, () => {
      // Control is the strongest route for every one of the five; the document
      // describes each as an acquisition candidate rather than a partnership.
      expect(verdictFor(testCase, "buy")).toBe(testCase.expectedLabel);
    });
  }

  it("DeltaCustody proves a gate outranks an attractive score", () => {
    // 74 points and a good wallet fit, blocked by an unresolved security
    // incident. The score is not the deciding input.
    const deltaCustody = CALIBRATION_CASES.find((entry) => entry.name === "DeltaCustody");
    expect(deltaCustody?.documentedScore).toBeGreaterThan(TEST_POLICY.thresholds.shortlistMinScore);
    expect(verdictFor(deltaCustody!, "buy")).toBe("blocked");
  });

  it("EpsilonReg cannot reach Priority on coverage alone", () => {
    // 68 points at exactly 60% coverage. Raising the score without raising the
    // coverage must not promote it.
    const epsilonReg = CALIBRATION_CASES.find((entry) => entry.name === "EpsilonReg")!;
    const withHigherScore = decideRecommendation({
      normalizedScore: 95,
      coverage: epsilonReg.documentedCoverage,
      policy: TEST_POLICY,
      triggeredGates: [],
      unresolvedGates: ["coverage"],
      bestRoute: "buy",
    });

    expect(withHigherScore).not.toBe("priority_diligence");
  });
});

describe("the seven gates of section 28", () => {
  it("resolves identity before producing any score at all", () => {
    // "Stop; resolve entity before scoring." A number attached to an unresolved
    // identity describes nobody, which is the Bit2C/B2C2 failure with a decimal
    // point on it.
    const result = score(uniformInput(5, { hardGates: gatesWith("entity", "unresolved") }));

    expect(result.recommendation).toBe("blocked");
    expect(result.normalizedScore).toBeNull();
    expect(result.breakdown).toEqual([]);
    expect(result.blockingGates).toEqual(["entity"]);
  });

  it("blocks a perfect score when a gate is triggered", () => {
    const result = score(uniformInput(5, { hardGates: gatesWith("client_assets", "triggered") }));

    expect(result.normalizedScore).toBe(100);
    expect(result.recommendation).toBe("blocked");
    expect(result.blockingGates).toEqual(["client_assets"]);
  });

  it("lets an unresolved gate deny Priority without blocking the target", () => {
    // BetaOptions: "Conditional shortlist; do not advance to IC before review."
    const result = score(uniformInput(5, { hardGates: gatesWith("regulatory", "unresolved") }));

    expect(result.normalizedScore).toBe(100);
    expect(result.recommendation).toBe("shortlist");
    expect(result.blockingGates).toEqual([]);
    expect(result.gates.find((gate) => gate.key === "regulatory")?.state).toBe("unresolved");
  });

  it("raises the coverage gate itself when coverage falls below the floor", () => {
    // The one gate the engine can evaluate on its own, because coverage is
    // something it computes rather than something research reports.
    const result = score(
      inputWithStatuses(
        {
          strategic_fit: { status: "unknown" },
          incremental_capability: { status: "unknown" },
          market_customers_distribution: { status: "unknown" },
        },
        4,
      ),
    );

    expect(result.coverage).toBeLessThan(TEST_POLICY.thresholds.coverageGateFloor);
    expect(result.gates.find((gate) => gate.key === "coverage")?.state).toBe("unresolved");
    expect(result.recommendation).not.toBe("priority_diligence");
    expect(result.recommendation).not.toBe("shortlist");
  });

  it("reports every gate's state so an answer can show pass, fail or unknown", () => {
    // Section 34's output contract: "Gates: Pass/fail/unknown for every gate."
    const result = score(uniformInput(4));
    expect(result.gates.map((gate) => gate.key)).toEqual(HARD_GATES_V0_3.map((gate) => gate.key));
  });

  it("refuses an input that omits a gate", () => {
    const missingGate = uniformInput(4, {
      hardGates: Object.fromEntries(
        Object.entries(allGatesClear()).filter(([key]) => key !== "security"),
      ),
    });

    expect(() => score(missingGate)).toThrow(ScoringInputError);
  });
});

describe("section 23 routes", () => {
  it("always names a second-best route", () => {
    // "The agent must always present the second-best route."
    const result = score(uniformInput(4));
    expect(result.bestRoute).toBe("buy");
    expect(result.secondBestRoute).toBe("partner");
    expect(result.secondBestRoute).not.toBe(result.bestRoute);
  });

  it("recommends partnering when partnership is the stronger route", () => {
    const result = score(uniformInput(4, { routes: partnerWinsRoutes() }));

    expect(result.normalizedScore).toBe(80);
    expect(result.bestRoute).toBe("partner");
    expect(result.recommendation).toBe("partner");
    expect(result.buyBeatsAlternatives).toBe(false);
  });

  it("does not treat a tie as a reason to take control", () => {
    const tied = uniformInput(4, {
      routes: {
        buy: { score: 4 },
        build: { score: 4 },
        partner: { score: 2 },
        invest: { score: 1 },
        watch: { score: 1 },
      },
    });

    expect(score(tied).buyBeatsAlternatives).toBe(false);
  });

  it("confirms control beats the alternatives when it strictly outscores them", () => {
    expect(score(uniformInput(4, { routes: buyWinsRoutes() })).buyBeatsAlternatives).toBe(true);
  });
});

describe("determinism and the input hash", () => {
  it("returns the same result for the same input", () => {
    expect(score(uniformInput(4))).toEqual(score(uniformInput(4)));
  });

  it("ignores free text, because rewording a justification changes no number", () => {
    const withReasons = uniformInput(4, {
      notes: "Second pass after the analyst call.",
      routes: {
        ...buyWinsRoutes(),
        buy: { score: 5, reason: "Rewritten rationale, identical score." },
      },
    });

    expect(score(withReasons).inputHash).toBe(score(uniformInput(4)).inputHash);
  });

  it("changes when a score changes", () => {
    expect(score(uniformInput(4)).inputHash).not.toBe(score(uniformInput(3)).inputHash);
  });

  it("changes when a gate state changes", () => {
    const withGate = uniformInput(4, { hardGates: gatesWith("security", "unresolved") });
    expect(score(withGate).inputHash).not.toBe(score(uniformInput(4)).inputHash);
  });
});

describe("configuration validation", () => {
  function brokenModel(mutate: (config: ScoringConfiguration) => void): ScoringConfiguration {
    const clone = structuredClone(THESIS_MODEL_V0_3) as ScoringConfiguration;
    mutate(clone);
    return clone;
  }

  it("rejects weights that do not total 100", () => {
    const config = brokenModel((model) => {
      model.dimensions[0].weight = 30;
    });

    expect(() => scoreTarget({ config, policy: TEST_POLICY, input: uniformInput(4) })).toThrow(
      ScoringConfigurationError,
    );
  });

  it("rejects sub-metric shares that do not total 1", () => {
    const config = brokenModel((model) => {
      model.dimensions[0].subMetrics[0].share = 0.5;
    });

    expect(() => scoreTarget({ config, policy: TEST_POLICY, input: uniformInput(4) })).toThrow(
      ScoringConfigurationError,
    );
  });

  it("rejects a sub-metric key used twice across the model", () => {
    // The input is keyed by sub-metric, so a repeat would make one supplied
    // score count in two places without anyone noticing.
    const config = brokenModel((model) => {
      model.dimensions[1].subMetrics[0].key = model.dimensions[0].subMetrics[0].key;
    });

    expect(() => scoreTarget({ config, policy: TEST_POLICY, input: uniformInput(4) })).toThrow(
      ScoringConfigurationError,
    );
  });

  it("rejects thresholds that are out of order", () => {
    expect(() =>
      scoreTarget({
        config: TEST_MODEL,
        policy: {
          ...TEST_POLICY,
          thresholds: { ...TEST_POLICY.thresholds, priorityMinScore: 60 },
        },
        input: uniformInput(4),
      }),
    ).toThrow(ScoringConfigurationError);
  });
});
