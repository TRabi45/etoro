import { describe, expect, it } from "vitest";
import { BOOTSTRAP_COMPANIES } from "@/data/seed/bootstrap";
import {
  bootstrapCompanySchema,
  bootstrapUniverseSchema,
  PROHIBITED_BOOTSTRAP_FIELDS,
} from "@/src/validation/bootstrap";
import { STRATEGIC_THEMES } from "@/src/config/taxonomy";
import { GOLD_BENCHMARK_NAMES } from "@/tests/evaluation/gold/gold-benchmark";

/**
 * The bootstrap seed is the one place where stage-two research could leak into
 * the product and be mistaken for the agent's own work. These tests exist to
 * make that leak impossible to commit quietly.
 */
describe("bootstrap universe", () => {
  it("contains exactly six identities", () => {
    expect(BOOTSTRAP_COMPANIES).toHaveLength(6);
  });

  it("validates against the strict bootstrap schema", () => {
    expect(() => bootstrapUniverseSchema.parse(BOOTSTRAP_COMPANIES)).not.toThrow();
  });

  it("holds the expected six companies", () => {
    expect(BOOTSTRAP_COMPANIES.map((company) => company.canonicalName).sort()).toEqual([
      "Alpaca",
      "Dfns",
      "Griffin",
      "Hypernative",
      "Swan",
      "getquin",
    ]);
  });

  it("has unique slugs and unique domains", () => {
    const slugs = BOOTSTRAP_COMPANIES.map((company) => company.slug);
    const domains = BOOTSTRAP_COMPANIES.map((company) => company.primaryDomain);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(domains).size).toBe(domains.length);
  });

  it("does not overlap with the gold benchmark", () => {
    // The benchmark measures what the pipeline can discover unaided. Any overlap
    // would mean testing the agent on companies it was handed.
    const bootstrapNames = new Set(
      BOOTSTRAP_COMPANIES.map((company) => company.canonicalName.toLowerCase()),
    );
    const overlap = GOLD_BENCHMARK_NAMES.filter((name) => bootstrapNames.has(name.toLowerCase()));
    expect(overlap).toEqual([]);
    expect(GOLD_BENCHMARK_NAMES).toHaveLength(8);
  });

  it("carries no researched field on any record", () => {
    for (const company of BOOTSTRAP_COMPANIES) {
      const keys = Object.keys(company);
      for (const prohibited of PROHIBITED_BOOTSTRAP_FIELDS) {
        expect(keys).not.toContain(prohibited);
      }
    }
  });

  it("rejects a record that carries any prohibited researched field", () => {
    // Asserted field by field rather than relying on the strict schema as a
    // side effect, so the prohibition is visible in the test output.
    for (const prohibited of PROHIBITED_BOOTSTRAP_FIELDS) {
      const contaminated = { ...BOOTSTRAP_COMPANIES[0], [prohibited]: "researched content" };
      const result = bootstrapCompanySchema.safeParse(contaminated);
      expect(result.success, `${prohibited} should be rejected`).toBe(false);
    }
  });

  it("uses only controlled theme values", () => {
    for (const company of BOOTSTRAP_COMPANIES) {
      expect(company.themeTags.length).toBeGreaterThan(0);
      for (const theme of company.themeTags) {
        expect(STRATEGIC_THEMES).toContain(theme);
      }
    }
  });

  it("supplies at least one search lead per company", () => {
    // Leads are what let the first monitoring run start somewhere useful. A
    // company with none would sit in the universe with nothing to research.
    for (const company of BOOTSTRAP_COMPANIES) {
      expect(company.searchLeads.length).toBeGreaterThan(0);
    }
  });

  it("leaves an unestablished legal entity null rather than copying the brand", () => {
    // Hypernative's parent perimeter is not established in public evidence.
    // Recording the brand as the legal entity would be a fabricated fact.
    const hypernative = BOOTSTRAP_COMPANIES.find(
      (company) => company.canonicalName === "Hypernative",
    );
    expect(hypernative?.legalEntityName).toBeNull();
    expect(hypernative?.aliases.every((alias) => !alias.isExactLegalEntity)).toBe(true);
  });

  it("records each Alpaca group entity separately", () => {
    // A group parent and its regulated subsidiaries are different acquirable
    // objects, so they are separate aliases rather than one merged name.
    const alpaca = BOOTSTRAP_COMPANIES.find((company) => company.canonicalName === "Alpaca");
    const legalEntities = alpaca?.aliases
      .filter((alias) => alias.isExactLegalEntity)
      .map((alias) => alias.alias);
    expect(legalEntities).toEqual(["AlpacaDB, Inc.", "Alpaca Clearing LLC", "Alpaca Crypto LLC"]);
  });
});
