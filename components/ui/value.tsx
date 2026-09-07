import type { ValueStatus } from "@/src/config/taxonomy";
import { UnknownValue } from "@/components/ui/unknown-value";

/**
 * Renders a value, or delegates to `UnknownValue` to say why there isn't one.
 *
 * Every numeric fact on a profile goes through this component, which is what
 * makes the "a missing number is never a zero" rule structurally true rather
 * than a habit. The four `ValueStatus` states map onto exactly two renderers:
 * a real figure here, and each kind of absence in `UnknownValue`, so the two
 * cannot drift into disagreeing about what `unknown` looks like.
 *
 * Numbers use tabular figures because these sit in columns that readers scan
 * vertically.
 */

export interface ValueProps {
  status: ValueStatus;
  value: number | null;
  unit?: string | null;
  currency?: string | null;
  /** Passed through to the absence renderer when there is no value. */
  unknownReason?: string | null;
}

export function Value({ status, value, unit, currency, unknownReason }: ValueProps) {
  if (status === "unknown") {
    return <UnknownValue kind="unknown" reason={unknownReason} />;
  }

  if (status === "not_applicable") {
    return <UnknownValue kind="not_applicable" reason={unknownReason} />;
  }

  if (value === null) {
    // A disclosed status with no number is a data defect, not a zero.
    return <UnknownValue kind="missing" />;
  }

  const formatted = currency
    ? `${currency} ${value.toLocaleString("en-US")}`
    : value.toLocaleString("en-US");

  return (
    <span className="tabular font-medium text-primary">
      {formatted}
      {unit ? <span className="ml-1 font-normal text-secondary">{unit}</span> : null}
      {status === "estimated" ? (
        <span
          className="ml-2 rounded-pill border border-border bg-surface-subtle px-1.5 py-0.5 text-caption font-normal text-secondary"
          title="Third-party estimate, not a figure the company disclosed."
        >
          Estimate
        </span>
      ) : null}
    </span>
  );
}
