import { SCORING_THRESHOLDS_V0_3 } from "@/src/config/scoring/v0-3";
import { Badge } from "@/components/ui/badge";

/**
 * Evidence coverage, which never travels without the score it qualifies.
 *
 * Coverage is the share of applicable weight that was actually scored from
 * evidence - section 26's "scored / applicable". It is reported *beside* the
 * score and never folded into it, because mandatory principle 5 is that missing
 * information is never hidden inside a number.
 *
 * The two thresholds come from the scoring policy rather than being restated
 * here, so a calibration change moves this badge automatically:
 *
 *   - below `coverageGateFloor` (0.60): too thin to shortlist at all.
 *   - below `priorityMinCoverage` (0.75): can be shortlisted, never promoted
 *     to priority diligence.
 */

const { coverageGateFloor, priorityMinCoverage } = SCORING_THRESHOLDS_V0_3;

export interface CoverageBadgeProps {
  /** Fraction in 0..1, or null when the company has no score at all. */
  coverage: number | null;
  /** Compact form for table cells: percentage only, no leading word. */
  compact?: boolean;
}

export function CoverageBadge({ coverage, compact = false }: CoverageBadgeProps) {
  if (coverage === null) {
    return (
      <Badge
        tone="muted"
        title="No score under the active model, so nothing has been measured yet."
      >
        No coverage
      </Badge>
    );
  }

  const percentage = Math.round(coverage * 100);

  if (coverage < coverageGateFloor) {
    return (
      <Badge
        tone="warning"
        icon="alert-circle"
        title={`Only ${percentage}% of applicable scoring weight is backed by evidence, below the ${Math.round(
          coverageGateFloor * 100,
        )}% floor. Section 28: research only, no shortlist.`}
      >
        {compact ? `${percentage}%` : `${percentage}% coverage`}
      </Badge>
    );
  }

  if (coverage < priorityMinCoverage) {
    return (
      <Badge
        tone="neutral"
        title={`${percentage}% of applicable scoring weight is backed by evidence. Above the shortlist floor, below the ${Math.round(
          priorityMinCoverage * 100,
        )}% needed for priority diligence.`}
      >
        {compact ? `${percentage}%` : `${percentage}% coverage`}
      </Badge>
    );
  }

  return (
    <Badge
      tone="brand"
      title={`${percentage}% of applicable scoring weight is backed by evidence, clearing the ${Math.round(
        priorityMinCoverage * 100,
      )}% priority floor.`}
    >
      {compact ? `${percentage}%` : `${percentage}% coverage`}
    </Badge>
  );
}
