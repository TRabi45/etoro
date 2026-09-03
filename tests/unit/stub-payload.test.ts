import { describe, expect, it } from "vitest";
import { BOOTSTRAP_COMPANIES } from "@/data/seed/bootstrap";
import { VERTICAL_SLICE_STUB_PAYLOAD } from "@/data/stub/vertical-slice-payload";
import { SCORING_MODELS_V0_2 } from "@/src/config/scoring/v0-2";
import { scoreTarget } from "@/src/domain/scoring/engine";
import { extractionPayloadSchema } from "@/src/pipeline/extraction-payload";
import { SCORING_POLICY_V0_2 } from "@/src/pipeline/vertical-slice";
import { GOLD_BENCHMARK_NAMES } from "@/tests/evaluation/gold/gold-benchmark";

/**
 * The stub payload stands in for LLM extraction until Milestone 3. These tests
 * hold it to the two things that actually matter: that it satisfies the contract
 * the real extractor will have to satisfy, and that it cannot quietly become a
 * channel for smuggling research into the runtime database.
 */
describe("vertical slice stub payload", () => {
  it("satisfies the extraction payload contract", () => {
    expect(() => extractionPayloadSchema.parse(VERTICAL_SLICE_STUB_PAYLOAD)).not.toThrow();
  });

  it("declares itself as stub provenance", () => {
    // The pipeline propagates this into the agent run, so a stub run can never
    // be mistaken for real retrieval after the fact.
    expect(VERTICAL_SLICE_STUB_PAYLOAD.provenance).toBe("stub");
  });

  it("targets a bootstrap identity, never a gold benchmark company", () => {
    // The gold eight are the evaluation set. Running the pipeline over one of
    // them would mean grading the agent on companies it was handed.
    const bootstrapSlugs = BOOTSTRAP_COMPANIES.map((company) => company.slug);
    expect(bootstrapSlugs).toContain(VERTICAL_SLICE_STUB_PAYLOAD.companySlug);

    const goldSlugs = GOLD_BENCHMARK_NAMES.map((name) => name.toLowerCase());
    expect(goldSlugs).not.toContain(VERTICAL_SLICE_STUB_PAYLOAD.companySlug.toLowerCase());
  });

  it("uses only synthetic sources", () => {
    // Fabricated facts about a real company carrying real-looking citations
    // would be the worst thing to leave in a database. Every stub source points
    // at example.com so it is unmistakable in any screenshot or demo.
    for (const source of VERTICAL_SLICE_STUB_PAYLOAD.sources) {
      expect(source.url).toMatch(/^https:\/\/example\.com\//);
      expect(source.publisher).toMatch(/STUB SOURCE/);
    }
  });

  it("gives every claim at least one source", () => {
    for (const claim of VERTICAL_SLICE_STUB_PAYLOAD.claims) {
      expect(claim.sources.length).toBeGreaterThan(0);
    }
  });

  it("exercises a contradiction, an unknown, and a not-applicable measure", () => {
    const conflicted = VERTICAL_SLICE_STUB_PAYLOAD.claims.filter((claim) => claim.conflictGroup);
    expect(conflicted.length).toBeGreaterThanOrEqual(2);
    expect(new Set(conflicted.map((claim) => claim.conflictGroup)).size).toBe(1);

    expect(
      VERTICAL_SLICE_STUB_PAYLOAD.claims.some((claim) => claim.valueStatus === "unknown"),
    ).toBe(true);
    expect(
      VERTICAL_SLICE_STUB_PAYLOAD.metrics.some((metric) => metric.valueStatus === "unknown"),
    ).toBe(true);
    expect(
      VERTICAL_SLICE_STUB_PAYLOAD.metrics.some((metric) => metric.valueStatus === "not_applicable"),
    ).toBe(true);
  });

  it("never attaches a number to an unknown or not-applicable measure", () => {
    for (const metric of VERTICAL_SLICE_STUB_PAYLOAD.metrics) {
      if (metric.valueStatus === "unknown" || metric.valueStatus === "not_applicable") {
        expect(metric.valueNumeric).toBeNull();
      }
    }
  });

  it("scores to the exact values the pipeline persists", () => {
    // Locks the whole chain: these are the numbers rendered on the profile, and
    // any change to the payload or the engine has to be a deliberate one.
    const result = scoreTarget({
      config: SCORING_MODELS_V0_2[VERTICAL_SLICE_STUB_PAYLOAD.scoring.path],
      policy: SCORING_POLICY_V0_2,
      input: VERTICAL_SLICE_STUB_PAYLOAD.scoring,
    });

    expect(result.positiveNormalized).toBe(79.78);
    expect(result.weightedCoverage).toBe(0.93);
    expect(result.riskPenalty).toBe(4);
    expect(result.evidencePenalty).toBe(2);
    expect(result.finalScore).toBe(73.78);
    expect(result.scoreState).toBe("scored");

    // A respectable score that is still not an Acquire, because plausibility is
    // unknown, the perimeter is unresolved, and partnership beats control.
    expect(result.recommendation).toBe("partner");
    expect(result.acquireEligible).toBe(false);
    expect(result.acquireBlockers.join(" ")).toMatch(/acquisition plausibility is unknown/);
    expect(result.acquireBlockers.join(" ")).toMatch(/does not beat partner/);
  });
});
