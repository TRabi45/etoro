import { describe, expect, it } from "vitest";
import { isSameEntityName, normalizeEntityName } from "@/src/validation/identity";
import { claimSchema, transactionStatusSchema } from "@/src/validation/evidence";

/**
 * Identity resolution is where a research agent most easily produces a
 * confidently wrong answer, so the rule is equality after normalisation and
 * nothing more. No fuzzy matching, no edit distance, no "close enough".
 */
describe("entity identity", () => {
  it("treats B2C2 and Bit2C as different companies", () => {
    // The assignment brief names B2C2. The transaction eToro actually completed
    // was with Bit2C, a different company. Any matcher loose enough to merge
    // these two would invent a transaction that never happened.
    expect(isSameEntityName("B2C2", "Bit2C")).toBe(false);
    expect(normalizeEntityName("B2C2")).not.toBe(normalizeEntityName("Bit2C"));
    expect(normalizeEntityName("B2C2")).toBe("b2c2");
    expect(normalizeEntityName("Bit2C")).toBe("bit2c");
  });

  it("still matches the same entity across corporate suffixes and case", () => {
    expect(isSameEntityName("DFNS SAS", "Dfns")).toBe(true);
    expect(isSameEntityName("Swan SAS", "swan")).toBe(true);
    expect(isSameEntityName("QUIN Technologies GmbH", "Quin")).toBe(true);
  });

  it("does not merge a brand with a differently named legal entity", () => {
    // Griffin and Griffin Bank Ltd are related, but establishing that is the
    // alias table's job - not a guess made from the strings.
    expect(isSameEntityName("Griffin Bank Ltd", "Griffin")).toBe(false);
    expect(isSameEntityName("QUIN Technologies GmbH", "getquin")).toBe(false);
  });

  it("keeps sibling group entities distinct", () => {
    expect(isSameEntityName("Alpaca Clearing LLC", "Alpaca Crypto LLC")).toBe(false);
    expect(isSameEntityName("AlpacaDB, Inc.", "Alpaca Clearing LLC")).toBe(false);
  });

  it("never matches on an empty or suffix-only name", () => {
    expect(isSameEntityName("", "")).toBe(false);
    expect(isSameEntityName("Ltd", "Limited")).toBe(false);
  });
});

describe("transaction status", () => {
  it("accepts a pending transaction with an expected close date", () => {
    // eToro announced TradeZero in August 2026 with an expected close in H1
    // 2027. That is announced, not completed.
    const result = transactionStatusSchema.safeParse({
      status: "announced",
      announcedDate: "2026-08-11",
      signedDate: null,
      expectedCloseDate: "2027-06-30",
      closedDate: null,
      terminatedDate: null,
    });
    expect(result.success).toBe(true);
  });

  it("refuses to call a transaction closed on an expected date alone", () => {
    const result = transactionStatusSchema.safeParse({
      status: "closed",
      announcedDate: "2026-08-11",
      signedDate: "2026-08-11",
      expectedCloseDate: "2027-06-30",
      closedDate: null,
      terminatedDate: null,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a closed transaction that has an actual close date", () => {
    const result = transactionStatusSchema.safeParse({
      status: "closed",
      announcedDate: "2026-04-15",
      signedDate: "2026-04-15",
      expectedCloseDate: null,
      closedDate: "2026-06-30",
      terminatedDate: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("claims", () => {
  const baseClaim = {
    subject: "Example Ltd",
    predicate: "annual_revenue",
    valueText: null,
    valueNumeric: null,
    valueUnit: null,
    valueCurrency: null,
    valueStatus: "unknown" as const,
    asOfDate: null,
    claimKind: "unknown" as const,
    aiConfidence: null,
    verificationStatus: "unverified" as const,
    conflictGroup: null,
    unknownReason: "Not disclosed by a private company.",
  };

  it("accepts an unknown value with no number attached", () => {
    expect(claimSchema.safeParse(baseClaim).success).toBe(true);
  });

  it("refuses to attach a number to an unknown value", () => {
    // This is the guard against a missing private-company figure quietly
    // becoming zero.
    const result = claimSchema.safeParse({ ...baseClaim, valueNumeric: 0 });
    expect(result.success).toBe(false);
  });

  it("never lets analysis be marked as a verified fact", () => {
    const result = claimSchema.safeParse({
      ...baseClaim,
      claimKind: "analysis",
      valueStatus: "disclosed",
      valueText: "Strong strategic fit with the wealth theme.",
      verificationStatus: "verified",
    });
    expect(result.success).toBe(false);
  });

  it("keeps a company-reported figure labelled as such", () => {
    const result = claimSchema.safeParse({
      ...baseClaim,
      claimKind: "company_reported",
      valueStatus: "disclosed",
      valueNumeric: 200000,
      valueUnit: "users",
      unknownReason: null,
      aiConfidence: "medium",
    });
    expect(result.success).toBe(true);
    // Precision is not verification: a precise company-reported number stays
    // company-reported until a primary source confirms it.
    expect(result.success && result.data.claimKind).toBe("company_reported");
    expect(result.success && result.data.verificationStatus).toBe("unverified");
  });
});
