import { describe, expect, it } from "vitest";
import { PLATFORM_MODEL_V0_2, TUCK_IN_MODEL_V0_2 } from "@/src/config/scoring/v0-2";
import { scoreHybridTarget, scoreTarget } from "@/src/domain/scoring/engine";
import { ScoringConfigurationError, ScoringInputError } from "@/src/domain/scoring/errors";
import type {
  DimensionInput,
  ScoringConfiguration,
  ScoringPolicy,
} from "@/src/domain/scoring/types";
import {
  acquisitionWinsRoutes,
  allGatesClear,
  noRisk,
  partnershipWinsRoutes,
  platformInput,
  platformWithStatuses,
  TEST_POLICY,
  tuckInInput,
} from "@/tests/fixtures/scoring";

const platform = (input = platformInput()) =>
  scoreTarget({ config: PLATFORM_MODEL_V0_2, policy: TEST_POLICY, input });

const tuckIn = (input = tuckInInput()) =>
  scoreTarget({ config: TUCK_IN_MODEL_V0_2, policy: TEST_POLICY, input });

describe("positive score and coverage", () => {
  it("normalises a fully scored result over the scored weight", () => {
    // Every dimension scored 4 of 5 normalises to 80, whatever the weights are.
    const result = platform(platformInput(4));
    expect(result.weightedCoverage).toBe(1);
    expect(result.positiveNormalized).toBe(80);
    expect(result.finalScore).toBe(80);
    expect(result.scoreState).toBe("scored");
  });

  it("does not treat an unknown dimension as a zero", () => {
    // The same dimension, once unknown and once scored zero. If unknown were
    // silently mapped to zero these two would agree - and a private company
    // that never published its revenue would be scored as though it had none.
    const unknown = platform(
      platformWithStatuses({ fundamental_quality_durable_scale: { status: "unknown" } }),
    );
    const zero = platform(
      platformWithStatuses({
        fundamental_quality_durable_scale: { status: "scored", score: 0 },
      }),
    );

    expect(unknown.positiveNormalized).toBe(80);
    expect(zero.positiveNormalized).toBe(68);
    expect(unknown.positiveNormalized).not.toBe(zero.positiveNormalized);
  });

  it("keeps unknown weight in the coverage denominator", () => {
    // 15 of 100 applicable weight is unknown, so coverage is 85%.
    const result = platform(
      platformWithStatuses({ fundamental_quality_durable_scale: { status: "unknown" } }),
    );
    expect(result.weightedCoverage).toBe(0.85);
  });

  it("removes not_applicable weight from both sides of the calculation", () => {
    // why_now (3) leaves entirely, so coverage stays at 100% of 97 applicable
    // weight rather than dropping to 97%.
    const result = platform(
      platformWithStatuses({
        why_now: { status: "not_applicable", reason: "No catalyst applies to this object." },
      }),
    );
    expect(result.weightedCoverage).toBe(1);
    expect(result.positiveNormalized).toBe(80);

    const notApplicableEntry = result.breakdown.find((entry) => entry.key === "why_now");
    expect(notApplicableEntry).toMatchObject({
      status: "not_applicable",
      weightedContribution: null,
    });
  });

  it("distinguishes unknown from not_applicable in the same calculation", () => {
    // Applicable weight 97 (why_now removed), scored weight 82 (fundamental
    // unknown): coverage is 82/97 = 0.8454, not 0.85 and not 1. That falls in
    // the 70-84% evidence band, so a penalty in 3-5 is required.
    const result = platform({
      ...platformWithStatuses({
        fundamental_quality_durable_scale: { status: "unknown" },
        why_now: { status: "not_applicable", reason: "Not applicable to a licence purchase." },
      }),
      evidencePenalty: 3,
    });
    expect(result.weightedCoverage).toBe(0.8454);
  });

  it("rejects an input where every dimension is not_applicable", () => {
    const dimensions = Object.fromEntries(
      PLATFORM_MODEL_V0_2.dimensions.map((dimension) => [
        dimension.key,
        { status: "not_applicable" as const, reason: "Nothing applies." },
      ]),
    );
    expect(() => platform(platformInput(4, { dimensions }))).toThrow(ScoringInputError);
  });
});

describe("evidence penalty bands", () => {
  it("accepts 0 to 2 at exactly 85% coverage", () => {
    const input = platformWithStatuses({
      fundamental_quality_durable_scale: { status: "unknown" },
    });
    const result = platform({ ...input, evidencePenalty: 2 });
    expect(result.weightedCoverage).toBe(0.85);
    expect(result.finalScore).toBe(78);
    expect(() => platform({ ...input, evidencePenalty: 3 })).toThrow(ScoringInputError);
  });

  it("accepts 3 to 5 at exactly 70% coverage", () => {
    // 18 + 12 = 30 unknown weight leaves 70 scored of 100 applicable.
    const input = platformWithStatuses({
      franchise_geographic_regulatory_advantage: { status: "unknown" },
      distribution_kpi_synergy: { status: "unknown" },
    });
    const result = platform({ ...input, evidencePenalty: 3 });
    expect(result.weightedCoverage).toBe(0.7);
    expect(result.finalScore).toBe(77);
    expect(() => platform({ ...input, evidencePenalty: 2 })).toThrow(ScoringInputError);
    expect(() => platform({ ...input, evidencePenalty: 6 })).toThrow(ScoringInputError);
  });

  it("accepts 6 to 9 at exactly 55% coverage", () => {
    // 18 + 15 + 12 = 45 unknown leaves 55 scored.
    const input = platformWithStatuses({
      franchise_geographic_regulatory_advantage: { status: "unknown" },
      fundamental_quality_durable_scale: { status: "unknown" },
      distribution_kpi_synergy: { status: "unknown" },
    });
    const result = platform({ ...input, evidencePenalty: 6 });
    expect(result.weightedCoverage).toBe(0.55);
    expect(result.finalScore).toBe(74);
    expect(() => platform({ ...input, evidencePenalty: 5 })).toThrow(ScoringInputError);
    expect(() => platform({ ...input, evidencePenalty: 10 })).toThrow(ScoringInputError);
  });

  it("accepts 10 to 15 at exactly 40% coverage", () => {
    // 20 + 18 + 12 + 10 = 60 unknown leaves 40 scored: the last coverage value
    // that still produces a decision score.
    const input = platformWithStatuses({
      strategic_fit: { status: "unknown" },
      franchise_geographic_regulatory_advantage: { status: "unknown" },
      distribution_kpi_synergy: { status: "unknown" },
      product_gap_closed: { status: "unknown" },
    });
    const result = platform({ ...input, evidencePenalty: 10 });
    expect(result.weightedCoverage).toBe(0.4);
    expect(result.scoreState).toBe("scored");
    expect(result.finalScore).toBe(70);
    expect(() => platform({ ...input, evidencePenalty: 9 })).toThrow(ScoringInputError);
    expect(() => platform({ ...input, evidencePenalty: 16 })).toThrow(ScoringInputError);
  });

  it("returns Research only below 40% coverage", () => {
    // One more unknown dimension takes coverage to 37%.
    const input = platformWithStatuses({
      strategic_fit: { status: "unknown" },
      franchise_geographic_regulatory_advantage: { status: "unknown" },
      distribution_kpi_synergy: { status: "unknown" },
      product_gap_closed: { status: "unknown" },
      why_now: { status: "unknown" },
    });
    const result = platform({ ...input, evidencePenalty: 15 });
    expect(result.weightedCoverage).toBe(0.37);
    expect(result.scoreState).toBe("research_only");
    expect(result.finalScore).toBeNull();
    expect(result.positiveNormalized).toBeNull();
    expect(result.recommendation).toBe("research_only");
    expect(result.acquireEligible).toBe(false);
  });
});

describe("risk", () => {
  it("sums the components and subtracts them from the positive score", () => {
    const result = platform(
      platformInput(4, {
        risk: {
          regulatory_change_of_control: { value: 3, reason: "Change of control needs approval." },
          aml_sanctions_security_custody: { value: 2, reason: "Custody exposure is unresolved." },
          integration_technology_data_migration: { value: 1, reason: "Two ledgers to merge." },
          valuation_financing_seller_dynamics: { value: 0 },
          conduct_reputation_customer_concentration: { value: 0 },
        },
      }),
    );
    expect(result.riskPenalty).toBe(6);
    expect(result.finalScore).toBe(74);
  });

  it("rejects a component above its own maximum", () => {
    expect(() =>
      platform(
        platformInput(4, {
          risk: {
            ...noRisk(),
            integration_technology_data_migration: { value: 5, reason: "Too high." },
          },
        }),
      ),
    ).toThrow(ScoringInputError);
  });

  it("caps the total risk deduction", () => {
    // The v0.2 component maxima sum to exactly 20, so the cap can only be
    // exercised with a policy that allows more. This proves the clamp itself.
    const generousPolicy: ScoringPolicy = {
      ...TEST_POLICY,
      riskComponents: TEST_POLICY.riskComponents.map((component) => ({ ...component, max: 10 })),
    };
    const result = scoreTarget({
      config: PLATFORM_MODEL_V0_2,
      policy: generousPolicy,
      input: platformInput(5, {
        risk: {
          regulatory_change_of_control: { value: 10, reason: "Severe." },
          aml_sanctions_security_custody: { value: 10, reason: "Severe." },
          integration_technology_data_migration: { value: 5, reason: "Severe." },
          valuation_financing_seller_dynamics: { value: 3, reason: "Severe." },
          conduct_reputation_customer_concentration: { value: 2, reason: "Severe." },
        },
      }),
    });
    expect(result.riskPenalty).toBe(20);
    expect(result.finalScore).toBe(80);
  });

  it("rejects a non-zero risk component with no reason", () => {
    expect(() =>
      platform(
        platformInput(4, {
          risk: { ...noRisk(), conduct_reputation_customer_concentration: { value: 2 } },
        }),
      ),
    ).toThrow(/no reason/);
  });

  it("floors the final score at zero", () => {
    // A weak target with the maximum deductions would go negative. It stops at 0
    // rather than producing a meaningless negative score.
    const result = platform(
      platformInput(1, {
        risk: {
          regulatory_change_of_control: { value: 5, reason: "Unavailable approval." },
          aml_sanctions_security_custody: { value: 5, reason: "Unresolved exposure." },
          integration_technology_data_migration: { value: 4, reason: "Incompatible stack." },
          valuation_financing_seller_dynamics: { value: 3, reason: "Seller unwilling." },
          conduct_reputation_customer_concentration: { value: 3, reason: "Conduct history." },
        },
        evidencePenalty: 2,
      }),
    );
    expect(result.positiveNormalized).toBe(20);
    expect(result.riskPenalty).toBe(20);
    expect(result.finalScore).toBe(0);
  });
});

describe("hard gates", () => {
  it("scores normally when every gate is clear", () => {
    const result = platform(platformInput(5));
    expect(result.triggeredPermanentGates).toEqual([]);
    expect(result.unresolvedCriticalGates).toEqual([]);
    expect(result.recommendation).toBe("acquire");
  });

  it("passes on a triggered permanent gate, whatever the score", () => {
    const result = platform(
      platformInput(5, {
        hardGates: {
          ...allGatesClear(),
          non_acquirability: {
            state: "triggered",
            evidence: "Confirmed sale to another buyer.",
          },
        },
      }),
    );
    expect(result.finalScore).toBe(100);
    expect(result.triggeredPermanentGates).toEqual(["non_acquirability"]);
    expect(result.acquireEligible).toBe(false);
    expect(result.recommendation).toBe("pass");
  });

  it("forces Research only on an unresolved critical gate", () => {
    // Unresolved is not the same as clear, and not the same as a permanent Pass:
    // the answer is "go and find out", not a decision score.
    const result = platform(
      platformInput(5, {
        hardGates: {
          ...allGatesClear(),
          entity_mismatch: {
            state: "unresolved",
            reason: "The acquirable entity behind the brand is not established.",
          },
        },
      }),
    );
    expect(result.unresolvedCriticalGates).toEqual(["entity_mismatch"]);
    expect(result.scoreState).toBe("research_only");
    expect(result.finalScore).toBeNull();
    expect(result.recommendation).toBe("research_only");
  });
});

describe("Acquire eligibility", () => {
  it("recommends Acquire when every condition is met", () => {
    const result = platform(platformInput(5));
    expect(result.finalScore).toBe(100);
    expect(result.acquireBlockers).toEqual([]);
    expect(result.acquireEligible).toBe(true);
    expect(result.recommendation).toBe("acquire");
  });

  it("blocks Acquire when the final score is below 75", () => {
    const result = platform(platformInput(3));
    expect(result.finalScore).toBe(60);
    expect(result.acquireEligible).toBe(false);
    expect(result.acquireBlockers.join(" ")).toMatch(/final score 60 is below 75/);
  });

  it("blocks Acquire when strategic fit is below 4", () => {
    const result = platform(
      platformWithStatuses({ strategic_fit: { status: "scored", score: 3 } }, 5),
    );
    expect(result.finalScore).toBe(92);
    expect(result.acquireEligible).toBe(false);
    expect(result.acquireBlockers.join(" ")).toMatch(/strategic fit 3 is below 4/);
  });

  it("blocks Acquire when weighted coverage is below 70%", () => {
    // 18 + 15 + 4 = 37 unknown leaves 63% coverage.
    const input = platformWithStatuses(
      {
        franchise_geographic_regulatory_advantage: { status: "unknown" },
        fundamental_quality_durable_scale: { status: "unknown" },
        technology_team_differentiation: { status: "unknown" },
      },
      5,
    );
    const result = platform({ ...input, evidencePenalty: 6 });
    expect(result.weightedCoverage).toBe(0.63);
    expect(result.acquireEligible).toBe(false);
    expect(result.acquireBlockers.join(" ")).toMatch(/weighted coverage 0.63 is below 0.7/);
  });

  it("blocks Acquire when acquisition plausibility is below 3", () => {
    const result = platform(
      platformWithStatuses(
        { acquisition_valuation_plausibility: { status: "scored", score: 2 } },
        5,
      ),
    );
    expect(result.acquireEligible).toBe(false);
    expect(result.acquireBlockers.join(" ")).toMatch(/acquisition plausibility 2 is below 3/);
  });

  it("blocks Acquire while legal identity, M&A status or perimeter is unresolved", () => {
    const result = platform(
      platformInput(5, {
        resolution: {
          legalIdentity: "resolved",
          maStatus: "unresolved",
          regulatoryPerimeter: "resolved",
        },
      }),
    );
    expect(result.acquireEligible).toBe(false);
    expect(result.acquireBlockers.join(" ")).toMatch(/unresolved: maStatus/);
  });

  it("blocks Acquire when an unknown dimension leaves strategic fit unscored", () => {
    const input = platformWithStatuses({ strategic_fit: { status: "unknown" } }, 5);
    const result = platform({ ...input, evidencePenalty: 3 });
    expect(result.acquireEligible).toBe(false);
    expect(result.acquireBlockers.join(" ")).toMatch(/strategic fit is unknown/);
  });

  it("recommends Partner over Acquire when control does not beat the alternatives", () => {
    // The case the separation of score from action exists for: a high fit score
    // with a route assessment where partnership dominates.
    const result = platform(platformInput(5, { routeAssessment: partnershipWinsRoutes() }));
    expect(result.finalScore).toBe(100);
    expect(result.acquireEligible).toBe(false);
    expect(result.acquireBlockers.join(" ")).toMatch(/does not beat partner/);
    expect(result.recommendation).toBe("partner");
  });

  it("recommends Invest when a minority position is the strongest route", () => {
    const result = platform(
      platformInput(5, {
        routeAssessment: {
          acquire: { score: 3, reason: "Price and investor dynamics are unfavourable." },
          build: { score: 1, reason: "Not reproducible internally." },
          partner: { score: 2, reason: "No governance rights." },
          invest: { score: 4, reason: "Option value with access rights." },
          monitor: { score: 2, reason: "A window exists now." },
        },
      }),
    );
    expect(result.recommendation).toBe("invest");
  });

  it("recommends Monitor in the 60 to 74 band when no route dominates", () => {
    const result = platform(
      platformInput(3, {
        routeAssessment: {
          acquire: { score: 2, reason: "Unclear object." },
          build: { score: 2, reason: "Possible." },
          partner: { score: 2, reason: "Possible." },
          invest: { score: 2, reason: "Possible." },
          monitor: { score: 3, reason: "Wait for a catalyst." },
        },
      }),
    );
    expect(result.finalScore).toBe(60);
    expect(result.recommendation).toBe("monitor");
  });

  it("passes when strategic fit is below 3", () => {
    const result = platform(
      platformWithStatuses({ strategic_fit: { status: "scored", score: 2 } }, 5),
    );
    expect(result.recommendation).toBe("pass");
  });
});

describe("Hybrid targets", () => {
  it("produces and keeps two separate results without averaging them", () => {
    // Gatsby is the historical proof case: its Tuck-in view scored far above its
    // Platform view because the value bought was technology and speed, not a
    // standalone franchise. An average would erase exactly that finding.
    const results = scoreHybridTarget({
      platform: { config: PLATFORM_MODEL_V0_2, policy: TEST_POLICY, input: platformInput(3) },
      tuckIn: { config: TUCK_IN_MODEL_V0_2, policy: TEST_POLICY, input: tuckInInput(5) },
    });

    expect(results.platform.finalScore).toBe(60);
    expect(results.tuckIn.finalScore).toBe(100);
    expect(results.platform.path).toBe("platform");
    expect(results.tuckIn.path).toBe("tuck_in");
    // 80 would be the average of the two. It must appear nowhere.
    expect(results.platform.finalScore).not.toBe(80);
    expect(results.tuckIn.finalScore).not.toBe(80);
  });

  it("rejects a hybrid assessment that is not one of each path", () => {
    expect(() =>
      scoreHybridTarget({
        platform: { config: PLATFORM_MODEL_V0_2, policy: TEST_POLICY, input: platformInput(3) },
        tuckIn: { config: PLATFORM_MODEL_V0_2, policy: TEST_POLICY, input: platformInput(5) },
      }),
    ).toThrow(ScoringInputError);
  });
});

describe("regulated-access subtype", () => {
  it("re-anchors the Tuck-in dimensions without changing any weight", () => {
    // Bit2C is the historical reference for this subtype: the value was local
    // regulated access and a customer book, not technology. The anchors change
    // meaning; the arithmetic must not change at all.
    const plain = tuckIn(tuckInInput(4));
    const subtyped = tuckIn(tuckInInput(4, { subtype: "regulated_access" }));

    expect(subtyped.subtype).toBe("regulated_access");
    expect(subtyped.positiveNormalized).toBe(plain.positiveNormalized);
    expect(subtyped.weightedCoverage).toBe(plain.weightedCoverage);
    expect(subtyped.finalScore).toBe(plain.finalScore);
    expect(subtyped.breakdown.map((entry) => entry.weight)).toEqual(
      plain.breakdown.map((entry) => entry.weight),
    );

    // Only the labels differ.
    const gap = subtyped.breakdown.find((entry) => entry.key === "product_capability_gap_closed");
    expect(gap?.label).toBe("Regulatory or customer-franchise gap closed");
    expect(gap?.weight).toBe(25);
  });

  it("refuses the subtype on a Platform scorecard", () => {
    expect(() =>
      scoreTarget({
        config: PLATFORM_MODEL_V0_2,
        policy: TEST_POLICY,
        input: { ...platformInput(4), subtype: "regulated_access" },
      }),
    ).toThrow(ScoringInputError);
  });
});

describe("malformed configuration and input", () => {
  it("rejects weights that do not total 100", () => {
    const broken: ScoringConfiguration = {
      ...PLATFORM_MODEL_V0_2,
      dimensions: PLATFORM_MODEL_V0_2.dimensions.map((dimension, index) =>
        index === 0 ? { ...dimension, weight: 25 } : dimension,
      ),
    };
    expect(() =>
      scoreTarget({ config: broken, policy: TEST_POLICY, input: platformInput(4) }),
    ).toThrow(ScoringConfigurationError);
  });

  it("rejects duplicate dimensions", () => {
    const broken: ScoringConfiguration = {
      ...PLATFORM_MODEL_V0_2,
      dimensions: [
        ...PLATFORM_MODEL_V0_2.dimensions.slice(0, -1),
        { key: "strategic_fit", label: "Duplicated", weight: 3 },
      ],
    };
    expect(() =>
      scoreTarget({ config: broken, policy: TEST_POLICY, input: platformInput(4) }),
    ).toThrow(/duplicate scoring dimensions/);
  });

  it("rejects a configuration naming a dimension that does not exist", () => {
    const broken: ScoringConfiguration = {
      ...PLATFORM_MODEL_V0_2,
      strategicFitDimension: "no_such_dimension",
    };
    expect(() =>
      scoreTarget({ config: broken, policy: TEST_POLICY, input: platformInput(4) }),
    ).toThrow(ScoringConfigurationError);
  });

  it("rejects a dimension score outside 0 to 5", () => {
    expect(() =>
      platform(platformWithStatuses({ why_now: { status: "scored", score: 6 } })),
    ).toThrow(ScoringInputError);
  });

  it("rejects not_applicable without a reason", () => {
    // Removing a dimension from the calculation has to be justified, or
    // `not_applicable` becomes a way to delete an inconvenient low score.
    const dimensions = {
      ...platformInput(4).dimensions,
      why_now: { status: "not_applicable" } as unknown as DimensionInput,
    };
    expect(() => platform(platformInput(4, { dimensions }))).toThrow(ScoringInputError);
  });

  it("rejects a missing dimension", () => {
    const dimensions = { ...platformInput(4).dimensions };
    delete dimensions.why_now;
    expect(() => platform(platformInput(4, { dimensions }))).toThrow(/missing scoring dimensions/);
  });

  it("rejects an unknown dimension key", () => {
    const dimensions = {
      ...platformInput(4).dimensions,
      invented_dimension: { status: "scored" as const, score: 5 },
    };
    expect(() => platform(platformInput(4, { dimensions }))).toThrow(/unknown scoring dimensions/);
  });

  it("rejects an input whose path does not match the model", () => {
    expect(() =>
      scoreTarget({ config: TUCK_IN_MODEL_V0_2, policy: TEST_POLICY, input: platformInput(4) }),
    ).toThrow(ScoringInputError);
  });

  it("rejects a mismatched risk component set", () => {
    const risk = { ...noRisk() };
    delete risk.conduct_reputation_customer_concentration;
    expect(() => platform(platformInput(4, { risk }))).toThrow(/missing risk components/);
  });

  it("rejects a mismatched hard-gate set", () => {
    const hardGates = { ...allGatesClear() };
    delete hardGates.evidence_floor;
    expect(() => platform(platformInput(4, { hardGates }))).toThrow(/missing hard gates/);
  });
});

describe("breakdown", () => {
  it("reports every dimension with its weight, status and contribution", () => {
    // Same 84.54% coverage case as above: needs an evidence penalty in the
    // 70-84% band (3-5).
    const result = platform({
      ...platformWithStatuses({
        fundamental_quality_durable_scale: { status: "unknown" },
        why_now: { status: "not_applicable", reason: "No catalyst applies." },
      }),
      evidencePenalty: 3,
    });

    expect(result.breakdown).toHaveLength(PLATFORM_MODEL_V0_2.dimensions.length);
    expect(result.breakdown.find((entry) => entry.key === "strategic_fit")).toMatchObject({
      weight: 20,
      status: "scored",
      score: 4,
      weightedContribution: 16,
    });
    expect(result.breakdown.find((entry) => entry.key === "why_now")).toMatchObject({
      status: "not_applicable",
      score: null,
      weightedContribution: null,
    });
    expect(result.modelVersion).toBe("0.2");
  });

  it("is stable across repeated calls with the same input", () => {
    const input = platformInput(4, { routeAssessment: acquisitionWinsRoutes() });
    const first = platform(input);
    const second = platform(input);
    expect(second).toEqual(first);
  });
});
