/**
 * The absence of a value, said out loud.
 *
 * Three different absences reach the UI and collapsing any two of them would
 * quietly turn "we don't know" into "there's nothing to report":
 *
 *   - `unknown`         - it applies, nobody has published it. That is a
 *                         finding, and often the most useful thing on a
 *                         profile, because it names the next research task.
 *   - `not_applicable`  - the measure does not apply to this business at all.
 *                         Assets under administration for a pure B2B API
 *                         vendor is not a gap.
 *   - `missing`         - the record claims a value exists but none is stored.
 *                         A data defect; louder than the other two because
 *                         someone has to fix it rather than research it.
 *
 * Rendered muted rather than alarming. An unknown is a normal state of the
 * world in early-stage M&A research, and painting every gap red would train the
 * reader to ignore the colour.
 */

export type AbsenceKind = "unknown" | "not_applicable" | "missing";

export interface UnknownValueProps {
  kind: AbsenceKind;
  /**
   * Why it is unknown, when the pipeline recorded a reason. Shown on hover -
   * "not disclosed in any filing" is a different research task from "the
   * company has never published a figure".
   */
  reason?: string | null;
}

export function UnknownValue({ kind, reason }: UnknownValueProps) {
  if (kind === "not_applicable") {
    return (
      <span
        className="text-tertiary"
        title={reason ?? "This measure does not apply to this business."}
      >
        Not applicable
      </span>
    );
  }

  if (kind === "missing") {
    return (
      <span
        className="font-medium text-danger"
        title={
          reason ??
          "The record is marked as disclosed but carries no value. This is a data defect, not a research gap."
        }
      >
        Missing value
      </span>
    );
  }

  return (
    <span
      className="font-medium text-warning"
      title={reason ?? "Applicable to this business, but not disclosed in any source reviewed."}
    >
      Unknown
    </span>
  );
}
