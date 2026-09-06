import { describe, expect, it } from "vitest";
import {
  buildCompanySourcePlan,
  DEFAULT_COMPANY_SOURCE_BUDGET,
} from "@/src/research/sources/company-source-plan";

describe("buildCompanySourcePlan", () => {
  it("prioritises existing evidence and official pages over search leads", () => {
    const plan = buildCompanySourcePlan({
      primaryDomain: "example.com",
      searchLeads: [{ label: "Series A", query: "example.com Series A funding" }],
      existingEvidenceUrls: ["https://example.com/press/series-a"],
    });

    expect(plan.candidates[0].family).toBe("existing_evidence");
    expect(plan.candidates.slice(1).every((c) => c.family === "official")).toBe(true);
  });

  it("warns instead of silently dropping coverage when no primary domain is on record", () => {
    const plan = buildCompanySourcePlan({
      primaryDomain: null,
      searchLeads: [],
      existingEvidenceUrls: [],
    });

    expect(plan.candidates).toHaveLength(0);
    expect(plan.warnings.some((w) => w.includes("primary domain"))).toBe(true);
  });

  it("warns explicitly when search leads exist but no provider is configured", () => {
    // The whole point of a lead is a query, not a URL - it cannot become a
    // candidate without a provider to resolve it, and that gap must be
    // visible, not a quietly smaller plan.
    const plan = buildCompanySourcePlan({
      primaryDomain: null,
      searchLeads: [
        { label: "imprint/terms", query: null },
        { label: "Series A", query: "funding" },
      ],
      existingEvidenceUrls: [],
    });

    const warning = plan.warnings.find((w) => w.includes("search lead"));
    expect(warning).toBeDefined();
    expect(warning).toContain("imprint/terms");
    expect(warning).toContain("Series A");
    expect(warning).toContain("SEARCH_PROVIDER_API_KEY");
  });

  it("deduplicates a URL that appears as both existing evidence and an official path", () => {
    const plan = buildCompanySourcePlan({
      primaryDomain: "example.com",
      searchLeads: [],
      existingEvidenceUrls: ["https://example.com/"],
    });

    const rootMatches = plan.candidates.filter((c) => c.url === "https://example.com/");
    expect(rootMatches).toHaveLength(1);
    // The earlier, higher-priority proposal wins the family tag.
    expect(rootMatches[0].family).toBe("existing_evidence");
  });

  it("discards a malformed candidate with a warning rather than throwing", () => {
    const plan = buildCompanySourcePlan({
      primaryDomain: null,
      searchLeads: [],
      existingEvidenceUrls: ["not a url", "https://example.com/real"],
    });

    expect(plan.candidates).toHaveLength(1);
    expect(plan.warnings.some((w) => w.includes("malformed"))).toBe(true);
  });

  it("bounds the plan to the configured maximum and warns about what was dropped", () => {
    const manyUrls = Array.from({ length: 5 }, (_, i) => `https://example.com/evidence-${i}`);
    const plan = buildCompanySourcePlan({
      primaryDomain: "example.com",
      searchLeads: [],
      existingEvidenceUrls: manyUrls,
      budget: { maxCandidateUrls: 3 },
    });

    expect(plan.candidates).toHaveLength(3);
    expect(plan.warnings.some((w) => w.includes("budget"))).toBe(true);
  });

  it("falls back to the default budget for any field not overridden", () => {
    const plan = buildCompanySourcePlan({
      primaryDomain: null,
      searchLeads: [],
      existingEvidenceUrls: [],
      budget: { maxCandidateUrls: 3 },
    });

    expect(plan.budget.maxFetchedDocuments).toBe(DEFAULT_COMPANY_SOURCE_BUDGET.maxFetchedDocuments);
    expect(plan.budget.maxCandidateUrls).toBe(3);
  });
});
