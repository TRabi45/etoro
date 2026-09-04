import { describe, expect, it } from "vitest";
import { repairToolInput } from "@/src/ai/tools/repair";

/**
 * These tests define the boundary between a shape problem and a meaning problem.
 *
 * The shape cases must be repaired, because failing them would kill an answer
 * over a quoted number. The meaning cases must NOT be repaired, because a query
 * that silently stops meaning what it said is the more dangerous outcome: the
 * tool succeeds, the model reports the result as the answer, and nothing in the
 * transcript records that the question changed.
 */

describe("repairToolInput - shape, which is repaired", () => {
  it("coerces a quoted number", () => {
    const result = repairToolInput("search_targets", { limit: "5" });
    expect(result).toEqual({ repaired: true, input: { limit: 5 } });
  });

  it("coerces a quoted boolean", () => {
    const result = repairToolInput("run_monitoring_quick", { strict_limits: "false" });
    expect(result).toEqual({ repaired: true, input: { strict_limits: false } });
  });

  it("wraps a single value where a list belongs", () => {
    const result = repairToolInput("compare_companies", { slugs: "getquin" });
    // Still invalid - a comparison needs two - so the shape fix alone is not
    // enough to make this call legal, and it correctly stays unrepaired.
    expect(result.repaired).toBe(false);
  });

  it("splits a comma-separated list into an array", () => {
    const result = repairToolInput("compare_companies", { slugs: "getquin, dfns" });
    expect(result).toEqual({ repaired: true, input: { slugs: ["getquin", "dfns"] } });
  });

  it("trims stray whitespace around a slug", () => {
    const result = repairToolInput("get_company_profile", { slug: "  getquin " });
    expect(result).toEqual({ repaired: true, input: { slug: "getquin" } });
  });

  it("parses input that arrives as a JSON string", () => {
    const result = repairToolInput("explain_score", '{"slug":"getquin"}');
    expect(result).toEqual({ repaired: true, input: { slug: "getquin" } });
  });
});

describe("repairToolInput - meaning, which is not repaired", () => {
  it("refuses to drop an invented enum value", () => {
    // Dropping `category` would run an unfiltered search and let the model
    // present the whole universe as the answer to a question about one theme.
    const result = repairToolInput("search_targets", { category: "fintech", limit: 5 });
    expect(result.repaired).toBe(false);
  });

  it("refuses a slug that is not a slug", () => {
    const result = repairToolInput("get_company_profile", { slug: "Getquin GmbH" });
    expect(result.repaired).toBe(false);
  });

  it("refuses a date that is not a date", () => {
    const result = repairToolInput("get_recent_events", { since_date: "yesterday" });
    expect(result.repaired).toBe(false);
  });

  it("gives up on an unknown tool rather than guessing a shape", () => {
    expect(repairToolInput("delete_everything", { slug: "getquin" }).repaired).toBe(false);
  });

  it("gives up on unparseable input", () => {
    expect(repairToolInput("explain_score", "{not json").repaired).toBe(false);
    expect(repairToolInput("explain_score", ["getquin"]).repaired).toBe(false);
  });
});
