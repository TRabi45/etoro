import type { EntityRole, MaState } from "@/src/config/taxonomy";

/**
 * The early screen of section 32.
 *
 * "First remove duplicates and already-acquired entities. Then test thesis
 * boundaries, customer type, real operations, countries, ownership,
 * permissions, scale and transaction plausibility. Do not perform full scoring
 * when identity or basic fit is unresolved."
 *
 * Pure, and deliberately upstream of everything expensive. A row that fails here
 * never reaches research, never reaches the scoring engine, and never appears in
 * a target list - which is the whole point, because the cost of screening late
 * is not wasted compute but an analyst reading Apple Pay as an acquisition
 * candidate.
 *
 * ## What this does not do
 *
 * It does not reject a company for being large, public, or a competitor.
 * Section 19 rules that out in as many words: "A very large, public or
 * competitor-owned company is not excluded by label alone." Plus500 bought an
 * Indian broker; Robinhood bought Bitstamp; Coinbase bought Deribit. A size
 * filter would be a rule the thesis does not contain, and it would quietly
 * remove the kind of target the sector actually trades in.
 *
 * What removes Visa is not its size. It is that nothing establishes it as
 * available, and section 28's deal gate turns "not for sale, or structurally
 * impossible" into "precedent or watch, not a target recommendation".
 *
 * ## Three outcomes, not two
 *
 * `screened_out` is for things that are not targets because they are not the
 * kind of thing that can be one - a product, an investor, a duplicate.
 *
 * `precedent` is for real operating companies that are not available. Their
 * events still matter. Section 20: "A competitor deal is a trigger, not a
 * score." A precedent deleted from the database takes its signal with it.
 *
 * `pass` means only that nothing disqualifying is known. It is not a judgement
 * that the company is a good target; that is what the scorecard is for.
 */

export type ScreenVerdict = "pass" | "screened_out" | "precedent";

export type ScreenReasonCode =
  | "not_an_operating_company"
  | "investor_rather_than_target"
  | "duplicate_of_tracked_entity"
  | "already_acquired"
  | "no_longer_independent"
  | "identity_unresolved";

export interface ScreenResult {
  verdict: ScreenVerdict;
  /** Null when the verdict is `pass`. */
  reason: ScreenReasonCode | null;
  /** One sentence an analyst can read without opening the code. */
  explanation: string;
}

export interface ScreenInput {
  name: string;
  entityRole: EntityRole;
  maState: MaState | null;
  /** Set when this row duplicates a company already tracked. */
  parentCompanyId: string | null;
  /** The name of that parent, for the explanation. */
  parentCompanyName?: string | null;
}

/**
 * M&A states that mean the company cannot be acquired by eToro now.
 *
 * `pending` and `announced_acquisition` are here because a signed deal is not a
 * closed one but the target is spoken for either way - which is the TradeZero
 * distinction from section 8, seen from the other side.
 */
const UNAVAILABLE_STATES: readonly MaState[] = ["completed", "announced_acquisition", "pending"];

const ROLE_EXPLANATION: Partial<Record<EntityRole, string>> = {
  product_or_brand:
    "is a product or brand rather than a company. A target has to be an entity that can be bought.",
  investor:
    "is an investor. It appears in funding coverage as a party to the story, not as its subject.",
  industry_body: "is an industry body or association, which has no ownership to acquire.",
  government_or_regulator: "is a public body, which is not an acquirable entity.",
  individual: "is a person, not a company.",
};

export function screenCompany(input: ScreenInput): ScreenResult {
  // Identity first. Section 32: "Do not perform full scoring when identity or
  // basic fit is unresolved" - and an unclassified row is unresolved, not
  // acceptable. The default has to fail closed, or every row the extractor has
  // not looked at passes by omission.
  if (input.entityRole === "unknown") {
    return {
      verdict: "screened_out",
      reason: "identity_unresolved",
      explanation: `What kind of entity ${input.name} is has not been established. Section 32 puts identity ahead of assessment.`,
    };
  }

  const roleExplanation = ROLE_EXPLANATION[input.entityRole];
  if (roleExplanation) {
    return {
      verdict: "screened_out",
      reason:
        input.entityRole === "investor"
          ? "investor_rather_than_target"
          : "not_an_operating_company",
      explanation: `${input.name} ${roleExplanation}`,
    };
  }

  // A subsidiary recorded separately from its parent is one target counted
  // twice. Section 30 warns against merging on name alone; failing to link a
  // parent and its subsidiary is the same error running the other way.
  if (input.parentCompanyId !== null) {
    const parent = input.parentCompanyName ?? "a company already tracked";
    return {
      verdict: "screened_out",
      reason: "duplicate_of_tracked_entity",
      explanation: `${input.name} is part of ${parent}, which is already in the universe. One target, one row.`,
    };
  }

  if (input.maState !== null && UNAVAILABLE_STATES.includes(input.maState)) {
    const acquired = input.maState === "completed";
    return {
      verdict: "precedent",
      reason: acquired ? "already_acquired" : "no_longer_independent",
      explanation: acquired
        ? `${input.name} has been acquired. Section 9: historical acquisitions are benchmarks, not available targets.`
        : `${input.name} is already in a transaction. A signed deal is not a closed one, but the target is spoken for either way.`,
    };
  }

  return { verdict: "pass", reason: null, explanation: "" };
}

/**
 * Whether a screened company should still be monitored.
 *
 * Section 20 makes a competitor's move "a trigger, not a score", and section 31
 * lists the events worth watching regardless of whether the subject is buyable.
 * A precedent keeps earning its row; something that was never a company does
 * not.
 */
export function remainsMonitored(verdict: ScreenVerdict): boolean {
  return verdict !== "screened_out";
}
