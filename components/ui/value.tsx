import type { ValueStatus } from "@/src/config/taxonomy";

/**
 * Renders a value, or renders honestly why there isn't one.
 *
 * Every numeric fact on a profile goes through this component, which is what
 * makes the "a missing number is never a zero" rule structurally true rather
 * than a habit. The three states are visually distinct on purpose:
 *
 *   - a real figure;
 *   - `Unknown` - it applies, nobody has published it, and that is a finding;
 *   - `Not applicable` - the measure does not apply to this business at all.
 *
 * Collapsing the last two, or hiding either row, would quietly turn "we don't
 * know" into "there's nothing to report".
 */

export interface ValueProps {
  status: ValueStatus;
  value: number | null;
  unit?: string | null;
  currency?: string | null;
}

export function Value({ status, value, unit, currency }: ValueProps) {
  if (status === "unknown") {
    return (
      <span className="font-medium text-amber-700" title="Applicable, but not disclosed anywhere">
        Unknown
      </span>
    );
  }

  if (status === "not_applicable") {
    return (
      <span className="font-medium text-slate-400" title="This measure does not apply">
        Not applicable
      </span>
    );
  }

  if (value === null) {
    // A disclosed status with no number is a data defect, not a zero. Say so
    // rather than inventing a value to fill the space.
    return <span className="font-medium text-red-700">Missing value</span>;
  }

  const formatted = currency
    ? `${currency} ${value.toLocaleString("en-US")}`
    : value.toLocaleString("en-US");

  return (
    <span className="font-medium text-slate-900">
      {formatted}
      {unit ? <span className="ml-1 font-normal text-slate-500">{unit}</span> : null}
      {status === "estimated" ? (
        <span
          className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600"
          title="Third-party estimate, not a disclosed figure"
        >
          estimate
        </span>
      ) : null}
    </span>
  );
}
