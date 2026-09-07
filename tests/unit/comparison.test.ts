import { describe, expect, it } from "vitest";
import {
  buildComparison,
  collectComparisonWarnings,
  type ComparisonSubject,
} from "@/src/domain/targets/comparison";
import type { CompanyProfileView, MetricView } from "@/src/db/repositories/company-profile";

/**
 * Comparison alignment.
 *
 * A comparison table asserts that adjacent cells hold the same kind of number,
 * so these tests are about the assertions it must refuse to make: comparing
 * across different measurement periods without saying so, collapsing "not
 * applicable" into "unknown", or leaving a gap blank so it reads as nothing to
 * report.
 */

function metric(overrides: Partial<MetricView> = {}): MetricView {
  return {
    id: "metric-1",
    metricType: "revenue",
    valueNumeric: 1_000_000,
    valueUnit: null,
    currency: "EUR",
    valueStatus: "disclosed",
    periodLabel: "2025",
    asOfDate: null,
    confidence: null,
    citations: [],
    ...overrides,
  };
}

function profile(overrides: Partial<CompanyProfileView> = {}): CompanyProfileView {
  return {
    company: {
      id: "id",
      canonicalName: "Example",
      slug: "example",
      legalEntityName: null,
      primaryDomain: null,
      themeTags: [],
      enablingLayers: [],
      recordOrigin: "agent_generated",
      researchTier: "tier_3",
      researchTierReason: null,
      researchTierConfidence: null,
      researchState: "complete",
      lastResearchedAt: null,
      nextRefreshAt: null,
    },
    path: null,
    metrics: [],
    fundamentals: null,
    assessment: null,
    score: null,
    evidence: {
      facts: [],
      contradictions: [],
      unknowns: [],
      freshness: { lastUpdatedAt: null, staleFields: [] },
    },
    sources: [],
    hasResearch: true,
    ...overrides,
  } as CompanyProfileView;
}

function subject(slug: string, overrides: Partial<CompanyProfileView> = {}): ComparisonSubject {
  return { slug, name: slug, profile: profile(overrides) };
}

function findRow(sections: ReturnType<typeof buildComparison>, key: string) {
  return sections.flatMap((section) => section.rows).find((row) => row.key === key);
}

describe("buildComparison", () => {
  it("gives every company a cell in every row, so a gap is never a blank", () => {
    const sections = buildComparison([
      subject("a", { assessment: { whyNow: "Licence just granted" } as never }),
      subject("b"),
    ]);

    const row = findRow(sections, "why_now");
    expect(row?.cells).toHaveLength(2);
    expect(row?.cells[0].kind).toBe("value");
    expect(row?.cells[1].kind).toBe("unknown");
    expect(row?.cells[1].note).toBeTruthy();
  });

  it("warns when the same measure covers different periods", () => {
    // The classic way a comparison table produces a confident wrong answer.
    const sections = buildComparison([
      subject("a", { metrics: [metric({ periodLabel: "2025" })] }),
      subject("b", { metrics: [metric({ periodLabel: "2023" })] }),
    ]);

    const row = findRow(sections, "metric:revenue");
    expect(row?.warning).toContain("Different measurement periods");
    expect(row?.warning).toContain("2025");
    expect(row?.warning).toContain("2023");
  });

  it("does not warn when the periods agree", () => {
    const sections = buildComparison([
      subject("a", { metrics: [metric({ periodLabel: "2025" })] }),
      subject("b", { metrics: [metric({ periodLabel: "2025", valueNumeric: 2_000_000 })] }),
    ]);

    expect(findRow(sections, "metric:revenue")?.warning).toBeNull();
  });

  it("warns when a comparable figure has no period recorded at all", () => {
    const sections = buildComparison([
      subject("a", { metrics: [metric({ periodLabel: "2025" })] }),
      subject("b", { metrics: [metric({ periodLabel: null, asOfDate: null })] }),
    ]);

    expect(findRow(sections, "metric:revenue")?.warning).toContain("no measurement period");
  });

  it("does not let a company without the figure create a period mismatch", () => {
    // One company reporting nothing cannot make two periods disagree.
    const sections = buildComparison([
      subject("a", { metrics: [metric({ periodLabel: "2025" })] }),
      subject("b"),
    ]);

    expect(findRow(sections, "metric:revenue")?.warning).toBeNull();
  });

  it("keeps not-applicable distinct from unknown", () => {
    const sections = buildComparison([
      subject("a", { metrics: [metric({ valueStatus: "not_applicable", valueNumeric: null })] }),
      subject("b", { metrics: [metric({ valueStatus: "unknown", valueNumeric: null })] }),
    ]);

    const row = findRow(sections, "metric:revenue");
    expect(row?.cells[0].kind).toBe("not_applicable");
    expect(row?.cells[1].kind).toBe("unknown");
  });

  it("labels an estimate as an estimate rather than presenting it as disclosed", () => {
    const sections = buildComparison([
      subject("a", { metrics: [metric({ valueStatus: "estimated" })] }),
      subject("b", { metrics: [metric()] }),
    ]);

    expect(findRow(sections, "metric:revenue")?.cells[0].note).toContain("Estimate");
  });

  it("always keeps the counter-thesis row, even when nobody recorded one", () => {
    // A target nobody has argued against is in a weaker position, not a tidier one.
    const sections = buildComparison([subject("a"), subject("b")]);
    const row = findRow(sections, "counter");
    expect(row).toBeDefined();
    expect(row?.cells.every((cell) => cell.kind === "unknown")).toBe(true);
  });

  it("raises a comparison-level warning when any company has contradictory sources", () => {
    const sections = buildComparison([
      subject("a", {
        evidence: {
          facts: [],
          contradictions: [{ topic: "revenue", claimIds: [], explanation: "", claims: [] }],
          unknowns: [],
          freshness: { lastUpdatedAt: null, staleFields: [] },
        } as never,
      }),
      subject("b"),
    ]);

    expect(collectComparisonWarnings(sections).join(" ")).toContain("sources that disagree");
  });
});
