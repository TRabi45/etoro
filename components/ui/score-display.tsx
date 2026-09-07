import { CoverageBadge } from "@/components/ui/coverage-badge";

/**
 * The score, its coverage and its uncertainty range - always together.
 *
 * Section 26 is unambiguous: "A normalized 82 at 55% coverage with a 45-90
 * range is not '82/100'." So this component takes all three and there is no
 * prop for rendering the number on its own. If a surface only has room for one
 * figure, it uses the `compact` variant, which still shows the range - a bare
 * number is the one thing the model is not allowed to claim.
 *
 * The range is the lower and upper bound assuming every unknown criterion
 * scores 0 and 5 respectively. A wide gap is the honest signal that the score
 * rests on thin evidence, which is why it is never suppressed for tidiness.
 */

export interface ScoreDisplayProps {
  /** 0-100, or null when nothing has been scored under the active model. */
  score: number | null;
  /** 0..1 share of applicable weight backed by evidence. */
  coverage: number | null;
  lowerBound: number | null;
  upperBound: number | null;
  /** `compact` suits a table cell; `full` suits a profile header. */
  variant?: "compact" | "full";
}

function formatRange(lower: number | null, upper: number | null): string | null {
  if (lower === null || upper === null) {
    return null;
  }
  return `${Math.round(lower)}-${Math.round(upper)}`;
}

export function ScoreDisplay({
  score,
  coverage,
  lowerBound,
  upperBound,
  variant = "compact",
}: ScoreDisplayProps) {
  const range = formatRange(lowerBound, upperBound);

  if (score === null) {
    // Not "0". Nothing has been scored, and a zero would read as a verdict.
    return (
      <span className="text-tertiary" title="No score exists under the active scoring model.">
        Not scored
      </span>
    );
  }

  if (variant === "compact") {
    return (
      <span className="flex flex-col gap-0.5 leading-none">
        <span className="tabular text-body font-semibold text-primary">{Math.round(score)}</span>
        {range ? (
          <span
            className="tabular text-caption text-tertiary"
            title={`Uncertainty range: ${range} out of 100, assuming every unknown criterion scores lowest and highest.`}
          >
            {range}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="tabular text-page font-semibold text-primary">{Math.round(score)}</span>
        <span className="text-body text-tertiary">/ 100</span>
        {range ? (
          <span
            className="tabular text-body text-secondary"
            title="Lower and upper bound assuming every unknown criterion scores lowest and highest. A wide range means the score rests on thin evidence."
          >
            range {range}
          </span>
        ) : null}
      </div>
      <div>
        <CoverageBadge coverage={coverage} />
      </div>
    </div>
  );
}
