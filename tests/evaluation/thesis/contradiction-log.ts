/**
 * §9. The mandatory contradiction log.
 *
 * Five cases where the public record disagrees with itself, and the document
 * states the correct handling for each. None of them is resolvable with better
 * research - that is the point. They are a test of whether the system can hold
 * two incompatible claims at once without quietly preferring the convenient one.
 *
 * §29 states the rule these cases exercise: "Do not silently choose. Preserve
 * versions, compare definitions, dates and entities, select only with explained
 * precedence and create a next query."
 *
 * The current implementation stores contradictions and renders them, but nothing
 * detects one - `conflict_group` is only ever populated by a hand-written stub.
 * These cases are what detection has to get right.
 */

export type ContradictionKind =
  | "date_disagreement"
  | "measurement_basis_disagreement"
  | "status_superseded"
  | "date_class_confusion";

export interface ContradictionCase {
  key: string;
  subject: string;
  /** The two or more claims that disagree, as the document reports them. */
  claims: readonly string[];
  kind: ContradictionKind;
  /** §9's "Correct handling" column, verbatim in substance. */
  requiredHandling: string;
  /** What a wrong implementation would do instead. */
  failureMode: string;
}

export const CONTRADICTION_LOG: readonly ContradictionCase[] = [
  {
    key: "marq_completion_date",
    subject: "Marq Millions",
    claims: [
      "An earlier SEC disclosure places the transaction in December 2019.",
      "A later eToro narrative places it in 2020; the acquisition was announced 2020-07-29.",
    ],
    kind: "date_disagreement",
    requiredHandling:
      "Store publication dates and both reports. The exact completion day remains an acknowledged gap, not a resolved fact.",
    failureMode:
      "Picking the more recent source and recording a single completion date, which erases a disagreement the business is required to see.",
  },
  {
    key: "deep_agreement_vs_narrative",
    subject: "Deep / Deep It",
    claims: [
      "A 20-F note describes an October 2023 asset purchase agreement for $525,000 cash and 39,000 shares.",
      "The business narrative mentions January 2024.",
    ],
    kind: "date_class_confusion",
    requiredHandling:
      "Classify as an asset and IP deal from the note. Keep agreement date and narrative date distinct; a closing date was never proven.",
    failureMode:
      "Merging the two into one date, or inferring a completion event that no source establishes.",
  },
  {
    key: "spaceship_consideration_basis",
    subject: "Spaceship",
    claims: [
      "Headline consideration up to AUD 80 million at announcement.",
      "Acquisition-date accounting consideration of US$20.796 million in the 20-F.",
    ],
    kind: "measurement_basis_disagreement",
    requiredHandling:
      "Store currency and consideration basis with each figure. Do not compare or convert without reconciliation - §25 keeps maximum consideration and acquisition-date consideration as separate fields.",
    failureMode:
      "Treating AUD 80m and US$20.8m as rival estimates of one number, and preferring one.",
  },
  {
    key: "zengo_conditional_then_completed",
    subject: "Zengo",
    claims: [
      "2026-04-15: an agreement is announced, conditional.",
      "Q2 2026: eToro confirms completion.",
    ],
    kind: "status_superseded",
    requiredHandling:
      "Later completion evidence updates current status without erasing history. The conditional announcement stays in the record as what was true on its date.",
    failureMode:
      "Overwriting the announcement row, which destroys the ability to answer 'what did we know, and when'.",
  },
  {
    key: "july_launch_inside_q2_release",
    subject: "eToro new app launch",
    claims: [
      "The product launched 2026-07-07.",
      "It is described inside the Q2 2026 results release, published 2026-08-11.",
    ],
    kind: "date_class_confusion",
    requiredHandling:
      "Keep event date, reporting period and publication date distinct. A launch described in a quarterly release did not happen during that quarter merely because the release covers it.",
    failureMode:
      "Recording the reporting period as the event date, which is the look-ahead error §33 forbids.",
  },
] as const;
