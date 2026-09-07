import { describe, expect, it } from "vitest";
import {
  applyTargetQuery,
  describeActiveFilters,
  hasActiveFilters,
  parseTargetQuery,
} from "@/src/domain/targets/target-filters";
import type { TargetSummary } from "@/src/db/repositories/targets";

/**
 * The target explorer's query model.
 *
 * These tests are about honesty rather than mechanics. The failures worth
 * catching here are the ones where a filter quietly changes what the reader
 * believes: an unscored company disappearing from a ranking, "never
 * researched" being counted as stale, or a typo in a shared URL producing an
 * empty table that looks like a real answer.
 */

const NOW = new Date("2026-09-07T00:00:00Z");

function target(overrides: Partial<TargetSummary> = {}): TargetSummary {
  return {
    slug: "example",
    canonicalName: "Example",
    legalEntityName: null,
    primaryDomain: null,
    themeTags: [],
    hqCountry: null,
    maState: null,
    path: null,
    normalizedScore: null,
    coverage: null,
    lowerBound: null,
    upperBound: null,
    recommendation: null,
    thesis: null,
    whyNow: null,
    lastResearchedAt: null,
    nextRefreshAt: null,
    researchState: "pending",
    hasResearch: false,
    ...overrides,
  };
}

describe("parseTargetQuery", () => {
  it("falls back to neutral defaults when nothing is supplied", () => {
    const query = parseTargetQuery({});
    expect(query.view).toBe("all");
    expect(query.sort).toBe("score_desc");
    expect(query.coverage).toBe("any");
    expect(query.recommendation).toBeNull();
    expect(hasActiveFilters(query)).toBe(false);
  });

  it("ignores values outside the controlled vocabulary rather than filtering on them", () => {
    // A typo in a shared URL must not look like "no results".
    const query = parseTargetQuery({
      view: "not-a-view",
      recommendation: "definitely_buy",
      category: "crypto",
      sort: "random",
    });
    expect(query.view).toBe("all");
    expect(query.recommendation).toBeNull();
    expect(query.category).toBeNull();
    expect(query.sort).toBe("score_desc");
  });

  it("drops an out-of-range or non-numeric minimum score instead of clamping it", () => {
    // A clamped filter would show a different list from the one the URL states.
    expect(parseTargetQuery({ minScore: "150" }).minScore).toBeNull();
    expect(parseTargetQuery({ minScore: "-5" }).minScore).toBeNull();
    expect(parseTargetQuery({ minScore: "abc" }).minScore).toBeNull();
    expect(parseTargetQuery({ minScore: "65" }).minScore).toBe(65);
  });

  it("reads only the first value when a param repeats", () => {
    expect(parseTargetQuery({ view: ["priority", "blocked"] }).view).toBe("priority");
  });

  it("bounds the comparison set at four", () => {
    const query = parseTargetQuery({ compare: "a,b,c,d,e,f" });
    expect(query.compare).toEqual(["a", "b", "c", "d"]);
  });
});

describe("applyTargetQuery", () => {
  it("keeps unscored companies visible, sorted last, under every score order", () => {
    // An unassessed company is the work that has not been done. A ranking that
    // hides it makes the universe look smaller than it is.
    const scored = target({ slug: "scored", canonicalName: "Scored", normalizedScore: 70 });
    const unscored = target({ slug: "unscored", canonicalName: "Unscored" });

    const descending = applyTargetQuery([unscored, scored], parseTargetQuery({}), NOW);
    expect(descending.map((row) => row.slug)).toEqual(["scored", "unscored"]);

    const ascending = applyTargetQuery(
      [unscored, scored],
      parseTargetQuery({ sort: "score_asc" }),
      NOW,
    );
    expect(ascending.map((row) => row.slug)).toEqual(["scored", "unscored"]);
  });

  it("treats no score as its own coverage band, not as low coverage", () => {
    // Nobody measured this company's evidence and found it thin.
    const unscored = target({ slug: "unscored" });
    const thin = target({ slug: "thin", coverage: 0.4, normalizedScore: 60 });

    const low = applyTargetQuery([unscored, thin], parseTargetQuery({ coverage: "low" }), NOW);
    expect(low.map((row) => row.slug)).toEqual(["thin"]);

    const none = applyTargetQuery([unscored, thin], parseTargetQuery({ coverage: "none" }), NOW);
    expect(none.map((row) => row.slug)).toEqual(["unscored"]);
  });

  it("separates never-researched from stale", () => {
    const never = target({ slug: "never" });
    const stale = target({ slug: "stale", lastResearchedAt: "2025-01-01T00:00:00Z" });
    const fresh = target({ slug: "fresh", lastResearchedAt: "2026-09-01T00:00:00Z" });
    const all = [never, stale, fresh];

    expect(
      applyTargetQuery(all, parseTargetQuery({ freshness: "never" }), NOW).map((r) => r.slug),
    ).toEqual(["never"]);
    expect(
      applyTargetQuery(all, parseTargetQuery({ freshness: "stale" }), NOW).map((r) => r.slug),
    ).toEqual(["stale"]);
    expect(
      applyTargetQuery(all, parseTargetQuery({ freshness: "fresh" }), NOW).map((r) => r.slug),
    ).toEqual(["fresh"]);
  });

  it("distinguishes the New view from the Needs research view", () => {
    // Never assessed is not the same as assessed on thin evidence: one needs a
    // first pass, the other needs the gaps closed.
    const untouched = target({ slug: "untouched", hasResearch: false });
    const thin = target({ slug: "thin", hasResearch: true, coverage: 0.3, normalizedScore: 55 });
    const solid = target({ slug: "solid", hasResearch: true, coverage: 0.9, normalizedScore: 85 });
    const all = [untouched, thin, solid];

    expect(
      applyTargetQuery(all, parseTargetQuery({ view: "new" }), NOW).map((r) => r.slug),
    ).toEqual(["untouched"]);
    expect(
      applyTargetQuery(all, parseTargetQuery({ view: "needs_research" }), NOW).map((r) => r.slug),
    ).toEqual(["thin"]);
  });

  it("matches text across name, legal entity, domain, country and thesis", () => {
    const rows = [
      target({ slug: "a", canonicalName: "Alpha", legalEntityName: "Alpha Holdings GmbH" }),
      target({ slug: "b", canonicalName: "Beta", hqCountry: "Germany" }),
      target({ slug: "c", canonicalName: "Gamma", thesis: "Closes the custody gap" }),
    ];

    expect(applyTargetQuery(rows, parseTargetQuery({ q: "gmbh" }), NOW).map((r) => r.slug)).toEqual(
      ["a"],
    );
    expect(
      applyTargetQuery(rows, parseTargetQuery({ q: "germany" }), NOW).map((r) => r.slug),
    ).toEqual(["b"]);
    expect(
      applyTargetQuery(rows, parseTargetQuery({ q: "custody" }), NOW).map((r) => r.slug),
    ).toEqual(["c"]);
  });

  it("does not mutate the array it is given", () => {
    const rows = [
      target({ slug: "low", normalizedScore: 10 }),
      target({ slug: "high", normalizedScore: 90 }),
    ];
    applyTargetQuery(rows, parseTargetQuery({}), NOW);
    expect(rows.map((row) => row.slug)).toEqual(["low", "high"]);
  });
});

describe("describeActiveFilters", () => {
  it("returns one chip per applied filter and nothing for the neutral state", () => {
    expect(describeActiveFilters(parseTargetQuery({}))).toEqual([]);

    const chips = describeActiveFilters(
      parseTargetQuery({ view: "priority", country: "Germany", coverage: "low" }),
    );
    expect(chips.map((chip) => chip.param)).toEqual(["view", "country", "coverage"]);
    expect(chips.find((chip) => chip.param === "country")?.value).toBe("Germany");
  });

  it("does not produce a chip for the sort order, which narrows nothing", () => {
    const chips = describeActiveFilters(parseTargetQuery({ sort: "name_asc" }));
    expect(chips).toEqual([]);
  });
});
