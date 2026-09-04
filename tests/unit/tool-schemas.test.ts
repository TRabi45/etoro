import { describe, expect, it } from "vitest";
import {
  compareCompaniesInputSchema,
  explainScoreInputSchema,
  getCompanyFundamentalsInputSchema,
  getCompanyProfileInputSchema,
  getMarketMapInputSchema,
  getRecentEventsInputSchema,
  refreshCompanyInputSchema,
  runMonitoringQuickInputSchema,
  searchTargetsInputSchema,
} from "@/src/ai/tools/schemas";
import { AGENT_TOOL_NAMES, TOOL_ACTIVITY_LABELS } from "@/src/ai/tools";

/**
 * Tool input validation is the boundary between a model's guess and a database
 * query. These tests pin what the model is allowed to send, so a hallucinated
 * argument is rejected rather than quietly producing a misleading empty result.
 */
describe("tool input schemas", () => {
  it("exposes exactly the nine tools the architecture specifies", () => {
    expect(AGENT_TOOL_NAMES.sort()).toEqual(
      [
        "compare_companies",
        "explain_score",
        "get_company_fundamentals",
        "get_company_profile",
        "get_market_map",
        "get_recent_events",
        "refresh_company",
        "run_monitoring_quick",
        "search_targets",
      ].sort(),
    );
  });

  it("gives every tool a human-readable activity label for the UI", () => {
    for (const name of AGENT_TOOL_NAMES) {
      expect(TOOL_ACTIVITY_LABELS[name]).toBeTruthy();
    }
  });

  describe("search_targets", () => {
    it("applies a default limit and accepts controlled filters", () => {
      const parsed = searchTargetsInputSchema.parse({
        geography: "Germany",
        category: "wealth_long_term_savings",
        path: "tuck_in",
        minimum_score: 70,
      });
      expect(parsed.limit).toBe(10);
      expect(parsed.minimum_score).toBe(70);
    });

    it("rejects a category outside the controlled taxonomy", () => {
      // The model cannot invent a theme that the database has no enum value for.
      expect(searchTargetsInputSchema.safeParse({ category: "quantum_banking" }).success).toBe(
        false,
      );
    });

    it("rejects an out-of-range score or limit", () => {
      expect(searchTargetsInputSchema.safeParse({ minimum_score: 140 }).success).toBe(false);
      expect(searchTargetsInputSchema.safeParse({ minimum_score: -1 }).success).toBe(false);
      expect(searchTargetsInputSchema.safeParse({ limit: 0 }).success).toBe(false);
      expect(searchTargetsInputSchema.safeParse({ limit: 500 }).success).toBe(false);
    });
  });

  describe("slug-taking tools", () => {
    it("accepts a well-formed slug", () => {
      expect(getCompanyProfileInputSchema.parse({ slug: "getquin" }).slug).toBe("getquin");
      expect(explainScoreInputSchema.parse({ slug: "alpaca" }).slug).toBe("alpaca");
      expect(getCompanyFundamentalsInputSchema.parse({ slug: "dfns" }).slug).toBe("dfns");
    });

    it("rejects a display name where a slug is required", () => {
      // "QUIN Technologies GmbH" is a name, not an identifier; accepting it
      // would send a guaranteed-empty query and look like "no such company".
      for (const bad of ["QUIN Technologies GmbH", "get quin", "Getquin", "get_quin", ""]) {
        expect(getCompanyProfileInputSchema.safeParse({ slug: bad }).success).toBe(false);
      }
    });
  });

  describe("compare_companies", () => {
    it("accepts two to four companies", () => {
      expect(compareCompaniesInputSchema.parse({ slugs: ["getquin", "dfns"] }).slugs).toHaveLength(
        2,
      );
      expect(compareCompaniesInputSchema.safeParse({ slugs: ["a", "b", "c", "d"] }).success).toBe(
        true,
      );
    });

    it("rejects fewer than two or more than four", () => {
      expect(compareCompaniesInputSchema.safeParse({ slugs: ["getquin"] }).success).toBe(false);
      expect(
        compareCompaniesInputSchema.safeParse({ slugs: ["a", "b", "c", "d", "e"] }).success,
      ).toBe(false);
    });
  });

  describe("get_recent_events", () => {
    it("requires an ISO since_date and defaults the limit", () => {
      const parsed = getRecentEventsInputSchema.parse({ since_date: "2026-09-01" });
      expect(parsed.limit).toBe(20);
    });

    it("rejects a non-ISO date or an unknown event type", () => {
      expect(getRecentEventsInputSchema.safeParse({ since_date: "yesterday" }).success).toBe(false);
      expect(
        getRecentEventsInputSchema.safeParse({
          since_date: "2026-09-01",
          event_types: ["rocket_launch"],
        }).success,
      ).toBe(false);
    });
  });

  describe("stub tools", () => {
    it("bounds how much work a refresh may request", () => {
      expect(refreshCompanyInputSchema.parse({ slug: "getquin" }).source_limit).toBe(5);
      expect(
        refreshCompanyInputSchema.safeParse({ slug: "getquin", source_limit: 1000 }).success,
      ).toBe(false);
    });

    it("defaults monitoring runs to strict limits", () => {
      expect(runMonitoringQuickInputSchema.parse({}).strict_limits).toBe(true);
    });
  });

  it("allows an unfiltered market map", () => {
    expect(getMarketMapInputSchema.safeParse({}).success).toBe(true);
    expect(getMarketMapInputSchema.safeParse({ category: "not_a_theme" }).success).toBe(false);
  });
});
