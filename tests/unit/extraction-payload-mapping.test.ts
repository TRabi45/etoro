import { describe, expect, it } from "vitest";
import {
  buildExtractionPayload,
  type FetchedCandidate,
} from "@/src/research/pipeline/company-research";
import { EMPTY_ANALYST_OUTPUT, type AnalystOutput } from "@/src/ai/prompts/v1/analyst";
import { THESIS_MODEL_V0_3 } from "@/src/config/scoring/v0-3";

/**
 * The conversion from gathered evidence into validated v0.3 inputs.
 *
 * This is the seam where a language model's judgement becomes scoring input,
 * so it is where the model's two most dangerous failure modes have to be
 * caught: a claim attached to a document that was never fetched, and a
 * citation pointing at a claim index that does not exist. Neither is visible
 * once the payload has been written to the database.
 */

function fetchedDocument(url: string, text: string): FetchedCandidate {
  return {
    family: "official",
    document: {
      url,
      finalUrl: url,
      normalizedUrl: url,
      title: "Fixture page",
      publishedAt: null,
      contentHash: `hash-of-${text}`,
      text,
      raw: text,
      bytes: text.length,
    },
  };
}

const CLEAR_GATE = { state: "clear" as const, reason: "Nothing blocks.", citingClaimIndexes: [] };
const SCORED = (score: number, citingClaimIndexes: number[]) => ({
  status: "scored" as const,
  score,
  reason: "Evidence-based judgement.",
  citingClaimIndexes,
});

function analystClaim(overrides: Partial<AnalystOutput["claims"][number]> = {}) {
  return {
    subject: "Fixture Co",
    predicate: "annual revenue",
    valueText: null,
    valueNumeric: 5_000_000,
    valueUnit: null,
    valueCurrency: "USD",
    valueStatus: "disclosed" as const,
    asOfDate: "2026-01-01",
    claimKind: "company_reported" as const,
    documentIndex: 0,
    excerpt: "Fixture Co reported $5,000,000 in annual revenue.",
    conflictGroup: null,
    ...overrides,
  };
}

function analystOutput(overrides: Partial<AnalystOutput> = {}): AnalystOutput {
  return {
    ...EMPTY_ANALYST_OUTPUT,
    entityResolution: {
      legalEntityConfirmed: "Fixture Co Ltd",
      matchesRecordedIdentity: true,
      note: "Confirmed by the official page.",
    },
    claims: [analystClaim()],
    dimensions: {
      strategic_fit: SCORED(4, [0]),
      incremental_capability: SCORED(3, [0]),
      market_customers_distribution: SCORED(3, []),
      product_technology: SCORED(3, []),
      financial_quality: SCORED(3, [0]),
      regulatory_feasibility: SCORED(4, []),
      integration_team: SCORED(3, []),
      deal_feasibility: SCORED(3, []),
    },
    gates: {
      regulatory: CLEAR_GATE,
      client_assets: CLEAR_GATE,
      security: CLEAR_GATE,
      integrity: CLEAR_GATE,
      deal: CLEAR_GATE,
    },
    routes: {
      build: { score: 2, reason: "Would take time." },
      partner: { score: 3, reason: "Plausible." },
      buy: { score: 4, reason: "Clean asset." },
      invest: { score: 2, reason: "Less relevant." },
      watch: { score: 1, reason: "Enough is known." },
    },
    classification: "tuck_in",
    fundamentals: {
      archetype: "b2b_infrastructure_saas",
      revenueQuality: "Recurring.",
      growthAssessment: null,
      marginAssessment: null,
      burnRunway: null,
      concentration: null,
      unknowns: ["Customer concentration is not disclosed."],
    },
    assessment: {
      strategicFitSummary: "Fits.",
      gapClosed: "Closes a gap.",
      whyNow: "Available now.",
      synergies: "Synergies.",
      risks: "Risk.",
      counterThesis: "Could be built in-house.",
      unknowns: [],
    },
    ...overrides,
  };
}

const ONE_DOCUMENT = [fetchedDocument("https://fixture.test/", "Fixture Co is a B2B company.")];

describe("evidence to validated v0.3 inputs", () => {
  it("links every accepted claim to a source that was actually fetched", () => {
    const payload = buildExtractionPayload("fixture-co", ONE_DOCUMENT, analystOutput());

    expect(payload.sources).toHaveLength(1);
    expect(payload.claims).toHaveLength(1);
    const sourceKeys = new Set(payload.sources.map((source) => source.key));
    for (const claim of payload.claims) {
      expect(claim.sources.length).toBeGreaterThan(0);
      for (const link of claim.sources) {
        expect(sourceKeys.has(link.sourceKey)).toBe(true);
      }
    }
  });

  it("drops a claim attributed to a document that was never fetched", () => {
    // A model inventing a second document is the cheapest way to smuggle an
    // unsupported claim into the evidence tree.
    const payload = buildExtractionPayload(
      "fixture-co",
      ONE_DOCUMENT,
      analystOutput({
        claims: [analystClaim(), analystClaim({ documentIndex: 7, predicate: "headcount" })],
      }),
    );

    expect(payload.claims).toHaveLength(1);
    expect(payload.claims[0].predicate).toBe("annual revenue");
  });

  it("renumbers surviving claims so a citation never points at the wrong claim", () => {
    // Claim 0 is dropped, so the analyst's claim 2 becomes claim-0. A
    // dimension citing index 2 must follow it, not keep the stale number.
    const payload = buildExtractionPayload(
      "fixture-co",
      ONE_DOCUMENT,
      analystOutput({
        claims: [
          analystClaim({ documentIndex: 9, predicate: "invented" }),
          analystClaim({ documentIndex: 4, predicate: "also invented" }),
          analystClaim({ documentIndex: 0, predicate: "real headcount" }),
        ],
        dimensions: {
          strategic_fit: SCORED(4, [2]),
          incremental_capability: SCORED(3, []),
          market_customers_distribution: SCORED(3, []),
          product_technology: SCORED(3, []),
          financial_quality: SCORED(3, []),
          regulatory_feasibility: SCORED(4, []),
          integration_team: SCORED(3, []),
          deal_feasibility: SCORED(3, []),
        },
      }),
    );

    expect(payload.claims).toHaveLength(1);
    expect(payload.claims[0].key).toBe("claim-0");
    expect(payload.claims[0].predicate).toBe("real headcount");
    expect(payload.scoring.subMetrics.strategic_fit.reason).toContain("claim-0");
  });

  it("refuses to build a payload when a citation names a discarded claim", () => {
    expect(() =>
      buildExtractionPayload(
        "fixture-co",
        ONE_DOCUMENT,
        analystOutput({
          claims: [analystClaim({ documentIndex: 9 })],
          dimensions: { ...analystOutput().dimensions, strategic_fit: SCORED(4, [0]) },
        }),
      ),
    ).toThrow(/not validly tied to a fetched document/i);
  });

  it("supplies every dimension the active v0.3 model weights", () => {
    const payload = buildExtractionPayload("fixture-co", ONE_DOCUMENT, analystOutput());

    for (const dimension of THESIS_MODEL_V0_3.dimensions) {
      expect(payload.scoring.subMetrics[dimension.key]).toBeDefined();
    }
  });

  it("supplies all seven gates, deriving the two the analyst does not judge", () => {
    const payload = buildExtractionPayload("fixture-co", ONE_DOCUMENT, analystOutput());

    // Five come from the analyst; `entity` is derived from entity resolution
    // and `coverage` from how much the engine could actually score.
    expect(Object.keys(payload.scoring.hardGates).sort()).toEqual(
      ["client_assets", "coverage", "deal", "entity", "integrity", "regulatory", "security"].sort(),
    );
    expect(payload.scoring.hardGates.entity.state).toBe("clear");
  });

  it("marks the entity gate unresolved when the analyst could not match the record", () => {
    const payload = buildExtractionPayload(
      "fixture-co",
      ONE_DOCUMENT,
      analystOutput({
        entityResolution: {
          legalEntityConfirmed: null,
          matchesRecordedIdentity: false,
          note: "The page describes a different legal entity.",
        },
      }),
    );

    expect(payload.scoring.hardGates.entity.state).toBe("unresolved");
  });

  it("keeps an unknown claim unknown, with a reason, rather than scoring it zero", () => {
    const payload = buildExtractionPayload(
      "fixture-co",
      ONE_DOCUMENT,
      analystOutput({
        claims: [analystClaim({ valueStatus: "unknown", valueNumeric: null })],
      }),
    );

    expect(payload.claims[0].valueNumeric).toBeNull();
    expect(payload.claims[0].valueStatus).toBe("unknown");
    expect(payload.claims[0].unknownReason).toBeTruthy();
  });

  it("records a valueless 'disclosed' claim as unknown instead of losing the batch", () => {
    // Observed live: the analyst asserted "legal entity registration" as
    // disclosed while supplying neither a number nor any text. The database
    // refuses that row (claims_known_value_is_present), which used to abort
    // the whole run and discard every other claim with it.
    const payload = buildExtractionPayload(
      "fixture-co",
      ONE_DOCUMENT,
      analystOutput({
        claims: [
          analystClaim({
            predicate: "legal entity registration",
            valueStatus: "disclosed",
            valueNumeric: null,
            valueText: null,
          }),
        ],
        dimensions: {
          strategic_fit: SCORED(4, []),
          incremental_capability: SCORED(3, []),
          market_customers_distribution: SCORED(3, []),
          product_technology: SCORED(3, []),
          financial_quality: SCORED(3, []),
          regulatory_feasibility: SCORED(4, []),
          integration_team: SCORED(3, []),
          deal_feasibility: SCORED(3, []),
        },
      }),
    );

    expect(payload.claims).toHaveLength(1);
    expect(payload.claims[0].valueStatus).toBe("unknown");
    expect(payload.claims[0].unknownReason).toMatch(/supplied no value/i);
    // Unknown, not zero, and not an invented empty string.
    expect(payload.claims[0].valueNumeric).toBeNull();
    expect(payload.claims[0].valueText).toBeNull();
  });

  it("leaves a disclosed claim that does carry a value alone", () => {
    const payload = buildExtractionPayload("fixture-co", ONE_DOCUMENT, analystOutput());

    expect(payload.claims[0].valueStatus).toBe("disclosed");
    expect(payload.claims[0].valueNumeric).toBe(5_000_000);
    expect(payload.claims[0].unknownReason).toBeNull();
  });

  it("carries the classification without letting it reach the scoring inputs", () => {
    // Platform/Tuck-in/Hybrid describes the acquisition shape. If it leaked
    // into `scoring`, it would be a second scorecard competing with v0.3.
    const tuckIn = buildExtractionPayload("fixture-co", ONE_DOCUMENT, analystOutput());
    const platform = buildExtractionPayload(
      "fixture-co",
      ONE_DOCUMENT,
      analystOutput({ classification: "platform" }),
    );

    expect(tuckIn.assessment.path).toBe("tuck_in");
    expect(platform.assessment.path).toBe("platform");
    expect(platform.scoring).toEqual(tuckIn.scoring);
  });

  it("labels the payload as pipeline provenance, never stub", () => {
    expect(buildExtractionPayload("fixture-co", ONE_DOCUMENT, analystOutput()).provenance).toBe(
      "pipeline",
    );
  });
});
