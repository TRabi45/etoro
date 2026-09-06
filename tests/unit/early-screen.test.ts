import { describe, expect, it } from "vitest";
import { remainsMonitored, screenCompany } from "@/src/domain/screening/early-screen";

/**
 * The early screen of section 32.
 *
 * The cases below are the actual rows the monitoring pipeline produced, because
 * a screen tested only against invented inputs is a screen tested against the
 * author's imagination. Apple Pay, Andreessen Horowitz, Navi Finserv and Visa
 * were all in the universe, all unclassified, and all presented to an analyst as
 * ordinary candidates.
 */

const operatingCompany = {
  name: "Yuno",
  entityRole: "operating_company",
  maState: null,
  parentCompanyId: null,
} as const;

describe("what the screen removes", () => {
  it("removes a product presented as a company", () => {
    // Apple Pay is a product of Apple Inc. It reached the universe because the
    // extractor returns the entity name an article uses, and nothing then asked
    // what kind of entity it was.
    const result = screenCompany({
      ...operatingCompany,
      name: "Apple Pay",
      entityRole: "product_or_brand",
    });

    expect(result.verdict).toBe("screened_out");
    expect(result.reason).toBe("not_an_operating_company");
    expect(result.explanation).toContain("Apple Pay");
  });

  it("removes an investor named in a funding round", () => {
    const result = screenCompany({
      ...operatingCompany,
      name: "Andreessen Horowitz",
      entityRole: "investor",
    });

    expect(result.verdict).toBe("screened_out");
    expect(result.reason).toBe("investor_rather_than_target");
  });

  it("removes a subsidiary already tracked as its parent", () => {
    // Navi Finserv is Navi's NBFC. Two rows, one target. Section 30 warns
    // against merging on name alone; this is the same error running backwards.
    const result = screenCompany({
      ...operatingCompany,
      name: "Navi Finserv",
      parentCompanyId: "11111111-1111-1111-1111-111111111111",
      parentCompanyName: "Navi",
    });

    expect(result.verdict).toBe("screened_out");
    expect(result.reason).toBe("duplicate_of_tracked_entity");
    expect(result.explanation).toContain("Navi");
  });

  it("fails closed on an unclassified row", () => {
    // The default has to be a stop. If `unknown` passed, every row the extractor
    // had not looked at would be screened in by omission - which is how the
    // universe filled up in the first place.
    const result = screenCompany({ ...operatingCompany, entityRole: "unknown" });

    expect(result.verdict).toBe("screened_out");
    expect(result.reason).toBe("identity_unresolved");
  });
});

describe("what the screen keeps as a precedent rather than a target", () => {
  it("moves an acquired company out of the target universe", () => {
    const result = screenCompany({ ...operatingCompany, name: "Bit2C", maState: "completed" });

    expect(result.verdict).toBe("precedent");
    expect(result.reason).toBe("already_acquired");
  });

  it("treats a signed but unclosed deal as spoken for", () => {
    // Section 8's TradeZero distinction, seen from the other side: signing is
    // not completion, but the target is unavailable either way.
    const result = screenCompany({
      ...operatingCompany,
      name: "TradeZero",
      maState: "announced_acquisition",
    });

    expect(result.verdict).toBe("precedent");
    expect(result.reason).toBe("no_longer_independent");
  });

  it("keeps monitoring a precedent but not a screened-out row", () => {
    // Section 20: "A competitor deal is a trigger, not a score." The trigger
    // only fires if the company is still being watched.
    expect(remainsMonitored("precedent")).toBe(true);
    expect(remainsMonitored("pass")).toBe(true);
    expect(remainsMonitored("screened_out")).toBe(false);
  });
});

describe("what the screen must not remove", () => {
  it("passes a large public company that nothing has ruled out", () => {
    // Section 19: "A very large, public or competitor-owned company is not
    // excluded by label alone." Plus500 bought an Indian broker, Robinhood
    // bought Bitstamp, Coinbase bought Deribit. A size filter would encode a
    // rule the thesis does not contain.
    //
    // What removes Visa from a target list is the deal gate reaching an
    // evidenced conclusion about availability - not this screen deciding it is
    // too big to buy.
    const result = screenCompany({ ...operatingCompany, name: "Visa" });

    expect(result.verdict).toBe("pass");
    expect(result.reason).toBeNull();
  });

  it("passes a company in a sale process, which is availability rather than its absence", () => {
    const result = screenCompany({ ...operatingCompany, maState: "sale_process" });
    expect(result.verdict).toBe("pass");
  });

  it("passes a company with a strategic investor on the register", () => {
    // A minority holder is a fact about the cap table, not a bar to acquisition.
    // Section 28's deal gate wants "structurally impossible", not "complicated".
    const result = screenCompany({ ...operatingCompany, maState: "strategic_investor" });
    expect(result.verdict).toBe("pass");
  });

  it("does not treat passing as a judgement that the company is a good target", () => {
    // The screen answers one question: is there a disqualifying fact. Whether
    // the company is worth buying is what the scorecard is for, and conflating
    // the two would let a company that merely survived the screen read as
    // endorsed.
    const result = screenCompany(operatingCompany);
    expect(result.explanation).toBe("");
  });
});
