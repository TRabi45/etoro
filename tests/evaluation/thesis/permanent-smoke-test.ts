/**
 * §31. The permanent smoke test.
 *
 * "Zengo and Bit2C must show completed; TradeZero pending; B2C2 a different
 * SBI-owned company. Failure disables automatic recommendations."
 *
 * That last sentence makes this more than a unit test. It is a runtime
 * precondition: a system that has these four facts wrong is a system whose
 * recommendations cannot be trusted, because each one is a different way of
 * being wrong about the single question the agent exists to answer - what does
 * eToro already own, and what is actually available to buy.
 *
 * The four cases are not arbitrary. Zengo and Bit2C test that a completed
 * acquisition is removed from the target universe. TradeZero tests that a signed
 * deal is not treated as a closed one. B2C2 tests that two companies with
 * similar names are not merged - the failure mode §30 calls out by name.
 */

export type TransactionState =
  "rumored" | "announced" | "signed" | "regulatory_review" | "completed" | "terminated";

export interface SmokeTestFact {
  /** The entity as the document names it. */
  entity: string;
  /** Whether eToro is a party at all. */
  etoroTransaction: boolean;
  requiredState: TransactionState | null;
  /** What the system must never say about this entity. */
  mustNotAssert: readonly string[];
  /** Why this specific entity is in the permanent test. */
  rationale: string;
  /** The document section and dated source behind the required state. */
  evidence: string;
}

export const PERMANENT_SMOKE_TEST: readonly SmokeTestFact[] = [
  {
    entity: "Zengo",
    etoroTransaction: true,
    requiredState: "completed",
    mustNotAssert: [
      "Zengo is an available acquisition target",
      "self-custody wallet capability is still a gap for eToro",
    ],
    rationale:
      "A completed acquisition must leave the target universe, and its capability must stop counting as a gap. §7: the agent must not assume eToro starts from zero.",
    evidence: "§8, §39. Agreement announced 2026-04-15; completed Q2 2026.",
  },
  {
    entity: "Bit2C",
    etoroTransaction: true,
    requiredState: "completed",
    mustNotAssert: [
      "Bit2C is an available acquisition target",
      "Bit2C and B2C2 are the same company",
      "every share of the original company was acquired",
    ],
    rationale:
      "Completed in Q2 2026 as an acquisition of business and activity. §8 warns against asserting full share acquisition, because the transaction mechanics were not verified.",
    evidence: "§8, §39. Bit2C notices dated 2026-05-07 and 2026-05-13.",
  },
  {
    entity: "TradeZero",
    etoroTransaction: true,
    requiredState: "signed",
    mustNotAssert: [
      "TradeZero is an eToro subsidiary",
      "TradeZero customers or revenue are consolidated",
      "the acquisition is complete",
    ],
    rationale:
      "Signing is not completion. §36 states the acceptance condition directly: TradeZero is not 'acquired'. Closing is expected H1 2027 and remains subject to approvals.",
    evidence:
      "§8. Announced 2026-08-11; up to $231m in cash and up to 2.5m Class A shares; closing expected H1 2027.",
  },
  {
    entity: "B2C2",
    etoroTransaction: false,
    requiredState: null,
    mustNotAssert: [
      "B2C2 is an eToro acquisition",
      "B2C2 is an eToro acquisition precedent",
      "B2C2 is Bit2C",
    ],
    rationale:
      "The identity test. B2C2 has been an SBI consolidated subsidiary since December 2020 and has no eToro relationship. §36 requires no false merge and no licence leakage between entities.",
    evidence: "§8, §18, §39. SBI reports B2C2 as consolidated since December 2020.",
  },
] as const;

/**
 * §31's consequence, stated as a flag the system is expected to honour.
 *
 * Recorded here so the requirement is visible from the test that checks it,
 * rather than living only in prose.
 */
export const SMOKE_TEST_FAILURE_CONSEQUENCE = "disable_automatic_recommendations" as const;
