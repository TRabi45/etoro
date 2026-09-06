import { describe, expect, it } from "vitest";
import { mapCompanyProfile } from "@/src/db/repositories/company-profile";
import { evidencePacketSchema } from "@/src/validation/evidence-packet";
import {
  ASSESSMENT_ROW,
  CLAIM_REVENUE_UNKNOWN,
  CLAIM_USERS_HIGH,
  CLAIM_USERS_LOW,
  fullProfileRows,
  identityOnlyRows,
  SOURCE_PRESS,
  SOURCE_REGISTER,
} from "@/tests/fixtures/profile-rows";

/**
 * The mapper turns relational rows into the profile the UI renders. Everything
 * that could quietly go wrong on the way - a citation pointing at the wrong
 * source, a contradiction collapsing into one figure, an unknown disappearing -
 * is checked here, with no database involved.
 */
const NOW = new Date("2026-09-03T12:00:00.000Z");

describe("mapCompanyProfile", () => {
  it("shapes rows into the interface the profile page consumes", () => {
    const profile = mapCompanyProfile(fullProfileRows(), NOW);

    expect(profile.company).toMatchObject({
      canonicalName: "Example Co",
      slug: "example-co",
      legalEntityName: "Example Co Ltd",
      primaryDomain: "example.com",
    });
    // The assessed path comes from the assessment, not from the identity row.
    expect(profile.path).toBe("tuck_in");
    expect(profile.hasResearch).toBe(true);
    // Section 26 keeps the three numbers together, so the mapper is checked on
    // all three rather than on the headline alone.
    expect(profile.score?.normalizedScore).toBe(81.18);
    expect(profile.score?.coverage).toBe(0.85);
    expect(profile.score?.lowerBound).toBe(69);
    expect(profile.score?.upperBound).toBe(84);
    expect(profile.fundamentals?.evidenceCoverage).toBe(0.93);
    expect(profile.assessment?.counterThesis).toBe("Reproducible in-house.");
  });

  it("reads stub provenance from the run that produced the assessment, never hard-coded", () => {
    // A real pipeline run must never be labelled stub data, and stub data must
    // never look live - so this has to come from `agent_runs.is_stub`, not
    // from a constant, and the mapper has to reflect either value it is given.
    const real = mapCompanyProfile(fullProfileRows(), NOW);
    expect(real.assessment?.isStub).toBe(false);

    const stub = mapCompanyProfile(
      { ...fullProfileRows(), assessment: { ...ASSESSMENT_ROW, agent_runs: { is_stub: true } } },
      NOW,
    );
    expect(stub.assessment?.isStub).toBe(true);
  });

  it("produces an evidence packet that satisfies its own schema", () => {
    const profile = mapCompanyProfile(fullProfileRows(), NOW);
    expect(() => evidencePacketSchema.parse(profile.evidence)).not.toThrow();
  });

  it("numbers each source once, by first appearance", () => {
    const profile = mapCompanyProfile(fullProfileRows(), NOW);

    // Two distinct sources, cited repeatedly, must yield exactly two entries.
    expect(profile.sources).toHaveLength(2);
    expect(profile.sources.map((source) => source.index)).toEqual([1, 2]);
    expect(profile.sources[0].sourceId).toBe(SOURCE_REGISTER.id);
    expect(profile.sources[1].sourceId).toBe(SOURCE_PRESS.id);
  });

  it("gives every fact at least one citation", () => {
    const profile = mapCompanyProfile(fullProfileRows(), NOW);
    expect(profile.evidence.facts.length).toBeGreaterThan(0);
    for (const fact of profile.evidence.facts) {
      expect(fact.citations.length).toBeGreaterThan(0);
    }
  });

  it("excludes unknown claims from facts and lists them as unknowns instead", () => {
    const profile = mapCompanyProfile(fullProfileRows(), NOW);

    const factClaimIds = profile.evidence.facts.map((fact) => fact.claimId);
    expect(factClaimIds).not.toContain(CLAIM_REVENUE_UNKNOWN.id);
    expect(profile.evidence.unknowns).toContain("Annual revenue is not disclosed.");
  });

  it("does not restate a gap the underlying claim already reported", () => {
    // The revenue metric is derived from the revenue claim. Reporting both would
    // print the same gap twice, in weaker words the second time.
    const profile = mapCompanyProfile(fullProfileRows(), NOW);

    expect(profile.evidence.unknowns).toContain("Annual revenue is not disclosed.");
    expect(profile.evidence.unknowns).not.toContain("annual_revenue is not disclosed");
  });

  it("still reports an unknown metric that no claim covers", () => {
    // The suppression above must not swallow a gap that would otherwise go
    // unmentioned, so a metric with no backing claim still speaks.
    const rows = fullProfileRows();
    rows.metrics = [
      {
        ...rows.metrics[0],
        id: "orphan",
        metric_type: "gross_margin",
        value_status: "unknown",
        value_numeric: null,
        claim_id: null,
      },
    ];

    const profile = mapCompanyProfile(rows, NOW);
    expect(profile.evidence.unknowns).toContain("gross_margin is not disclosed");
  });

  it("keeps both sides of a contradiction instead of choosing one", () => {
    const profile = mapCompanyProfile(fullProfileRows(), NOW);

    expect(profile.evidence.contradictions).toHaveLength(1);
    const contradiction = profile.evidence.contradictions[0];
    expect(contradiction.topic).toBe("registered_users");
    expect(contradiction.claimIds).toEqual(
      expect.arrayContaining([CLAIM_USERS_HIGH.id, CLAIM_USERS_LOW.id]),
    );
    // Both figures survive into the rendered output.
    expect(contradiction.explanation).toContain("1,200,000");
    expect(contradiction.explanation).toContain("900,000");
  });

  it("preserves unknown and not_applicable metrics as distinct states", () => {
    const profile = mapCompanyProfile(fullProfileRows(), NOW);

    const revenue = profile.metrics.find((metric) => metric.metricType === "annual_revenue");
    const aua = profile.metrics.find(
      (metric) => metric.metricType === "assets_under_administration",
    );

    expect(revenue?.valueStatus).toBe("unknown");
    expect(revenue?.valueNumeric).toBeNull();
    expect(aua?.valueStatus).toBe("not_applicable");
    expect(aua?.valueNumeric).toBeNull();
    // Neither is ever a zero.
    expect(profile.metrics.every((metric) => metric.valueNumeric !== 0)).toBe(true);
  });

  it("carries citations from a metric through to its claim's sources", () => {
    const profile = mapCompanyProfile(fullProfileRows(), NOW);
    const users = profile.metrics.find((metric) => metric.metricType === "registered_users");
    expect(users?.citations.length).toBeGreaterThan(0);
  });

  it("groups citations per fundamentals field and assessment role", () => {
    const profile = mapCompanyProfile(fullProfileRows(), NOW);

    // Growth is evidenced by two claims that cite different sources.
    expect(profile.fundamentals?.citationsByField.growth_assessment).toEqual([1, 2]);
    expect(profile.assessment?.citationsByRole.strategic_fit_summary).toEqual([1]);
  });

  it("reports the newest timestamp and flags stale claims", () => {
    const profile = mapCompanyProfile(fullProfileRows(), NOW);

    expect(profile.evidence.freshness.lastUpdatedAt).toBe("2026-09-03T10:00:00.000Z");
    // The 2024 claim is well past the staleness window; the 2026 ones are not.
    expect(profile.evidence.freshness.staleFields).toEqual(["headcount"]);
  });

  it("reports a bootstrap identity as having no research", () => {
    const profile = mapCompanyProfile(identityOnlyRows(), NOW);

    expect(profile.hasResearch).toBe(false);
    expect(profile.path).toBeNull();
    expect(profile.score).toBeNull();
    expect(profile.sources).toEqual([]);
    expect(profile.evidence.facts).toEqual([]);
    expect(profile.evidence.freshness.lastUpdatedAt).toBeNull();
  });

  it("is deterministic for the same rows", () => {
    const first = mapCompanyProfile(fullProfileRows(), NOW);
    const second = mapCompanyProfile(fullProfileRows(), NOW);
    expect(second).toEqual(first);
  });
});
