import type { ScoreView } from "@/src/db/repositories/company-profile";
import { CoverageBadge } from "@/components/ui/coverage-badge";
import { RecommendationBadge } from "@/components/ui/recommendation-badge";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime, humanizeToken } from "@/components/ui/format";

/**
 * The score, shown as arithmetic rather than as a verdict.
 *
 * Three numbers are rendered as one statement and never separated, because the
 * acquisition thesis is explicit that separating them is a lie: a normalized 82
 * at 55% coverage with a 45-90 range is not "82/100".
 *
 * The range is the width of what is still unknown - the lower bound assumes
 * every unestablished criterion scores zero, the upper bound assumes five.
 * Neither is a prediction, and an analyst deciding what to research next needs
 * that spread more than they need the point estimate.
 *
 * Gates are listed above the dimensions on purpose. A triggered gate overrides
 * the score entirely, so a reader who stops after the first block has still
 * read the most decision-relevant fact on the page.
 */

const DIMENSION_STATUS: Record<
  string,
  { label: string; tone: "neutral" | "warning" | "muted" | "brand"; hint: string }
> = {
  scored: {
    label: "Scored",
    tone: "brand",
    hint: "Backed by evidence and contributing its full weight.",
  },
  partially_scored: {
    label: "Partial",
    tone: "neutral",
    hint: "Some sub-metrics are established and some are not.",
  },
  unknown: {
    label: "Unknown",
    tone: "warning",
    hint: "Applicable, but nothing establishes it. Counted in the uncertainty range, never as zero.",
  },
  not_applicable: {
    label: "Not applicable",
    tone: "muted",
    hint: "Does not apply to this business, so it is excluded from the applicable weight entirely.",
  },
};

export function ScoreBreakdown({ score }: { score: ScoreView | null }) {
  if (!score) {
    return (
      <EmptyState
        icon="minus"
        title="No score under the active model"
        nextStep={
          <>
            Nothing has been scored for this company under the scoring model currently in force.
            That is different from scoring badly - a score requires evidence, and a company scored
            under a superseded model reads as unscored here rather than showing a number nobody
            stands behind.
          </>
        }
      />
    );
  }

  const openGates = score.gates.filter((gate) => gate.state !== "clear");
  const spread =
    score.lowerBound !== null && score.upperBound !== null
      ? score.upperBound - score.lowerBound
      : null;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-body leading-relaxed text-secondary">
        Calculated in code from the recorded inputs under model version{" "}
        <span className="font-medium text-primary">{score.modelVersion}</span>, on{" "}
        <span className="tabular">{formatDateTime(score.calculatedAt)}</span>. No language model
        produces or adjusts this number.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-card border border-border bg-surface p-4">
          <h3 className="text-caption font-semibold tracking-wide text-secondary uppercase">
            Normalised score
          </h3>
          <p className="tabular mt-1 text-page font-semibold text-primary">
            {score.normalizedScore === null ? "Not scored" : score.normalizedScore.toFixed(2)}
          </p>

          <dl className="mt-3 flex flex-col gap-2 border-t border-border pt-3 text-body">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-secondary">Evidence coverage</dt>
              <dd>
                <CoverageBadge coverage={score.coverage} />
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-secondary">Uncertainty range</dt>
              <dd className="tabular font-medium text-primary">
                {score.lowerBound === null || score.upperBound === null
                  ? "Not calculated"
                  : `${score.lowerBound.toFixed(2)} to ${score.upperBound.toFixed(2)}`}
              </dd>
            </div>
          </dl>

          {spread !== null && spread > 0 ? (
            <p className="mt-3 text-caption leading-relaxed text-secondary">
              <span className="tabular font-medium text-primary">{spread.toFixed(0)}</span> points
              of the scorecard are still unestablished. The lower bound assumes every unknown scores
              zero, the upper bound assumes every unknown scores five. Neither is a prediction.
            </p>
          ) : null}
        </div>

        <div className="rounded-card border border-border bg-surface p-4">
          <h3 className="text-caption font-semibold tracking-wide text-secondary uppercase">
            Recommendation
          </h3>
          <div className="mt-2">
            <RecommendationBadge recommendation={score.recommendation} />
          </div>

          <dl className="mt-3 flex flex-col gap-2 border-t border-border pt-3 text-body">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-secondary">Best route</dt>
              <dd className="font-medium text-primary">
                {humanizeToken(score.bestRoute) ?? "Not recorded"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-secondary">Second best</dt>
              <dd className="font-medium text-primary">
                {humanizeToken(score.secondBestRoute) ?? "Not recorded"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-secondary">Buy beats alternatives</dt>
              <dd className="font-medium text-primary">
                {score.buyBeatsAlternatives === null
                  ? "Not recorded"
                  : score.buyBeatsAlternatives
                    ? "Yes"
                    : "No"}
              </dd>
            </div>
          </dl>

          <p className="mt-3 text-caption leading-relaxed text-secondary">
            The recommendation is a separate decision from the score, and a gate overrides both. A
            score is not an approval.
          </p>
        </div>
      </div>

      <section aria-labelledby="gates-heading">
        <h3 id="gates-heading" className="text-section font-semibold text-primary">
          Hard gates
        </h3>
        <p className="mt-1 text-body text-secondary">
          A triggered gate blocks the target whatever the score says. An unresolved gate does not
          block, but denies priority diligence until it is settled.
        </p>

        <ul className="mt-3 flex flex-col gap-2">
          {score.gates.length === 0 ? (
            <li className="rounded-card border border-border bg-surface px-4 py-3 text-body text-secondary">
              No gate outcomes were recorded with this score.
            </li>
          ) : null}

          {score.gates.map((gate) => (
            <li
              key={gate.key}
              className={`rounded-card border px-4 py-3 ${
                gate.state === "triggered"
                  ? "border-danger/30 bg-danger-soft"
                  : gate.state === "unresolved"
                    ? "border-warning/30 bg-warning-soft"
                    : "border-border bg-surface"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Icon
                  name={
                    gate.state === "triggered"
                      ? "alert-triangle"
                      : gate.state === "unresolved"
                        ? "alert-circle"
                        : "check-circle"
                  }
                  size={16}
                  className={
                    gate.state === "triggered"
                      ? "text-danger"
                      : gate.state === "unresolved"
                        ? "text-warning"
                        : "text-brand"
                  }
                />
                <span className="text-body font-medium text-primary">{gate.label}</span>
                <Badge
                  tone={
                    gate.state === "triggered"
                      ? "danger"
                      : gate.state === "unresolved"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {humanizeToken(gate.state)}
                </Badge>
              </div>
              <p className="mt-1.5 text-body leading-relaxed text-secondary">{gate.action}</p>
            </li>
          ))}
        </ul>

        {openGates.length === 0 && score.gates.length > 0 ? (
          <p className="mt-2 text-caption text-secondary">
            Every gate is clear, so the score band alone decides the recommendation.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="dimensions-heading">
        <h3 id="dimensions-heading" className="text-section font-semibold text-primary">
          Dimension breakdown
        </h3>
        <p className="mt-1 text-body text-secondary">
          One global weight set. Contribution is the dimension&rsquo;s score multiplied by its
          weight; an unknown dimension contributes nothing and widens the range rather than scoring
          zero.
        </p>

        <div className="mt-3 overflow-x-auto rounded-card border border-border bg-surface">
          {score.breakdown.length === 0 ? (
            <p className="px-4 py-3 text-body text-secondary">
              No per-dimension breakdown was stored with this score.
            </p>
          ) : (
            <table className="w-full min-w-[36rem] border-collapse text-table">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="px-4 py-2.5 font-medium text-secondary">
                    Dimension
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium text-secondary">
                    Weight
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium text-secondary">
                    Score
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium text-secondary">
                    Contribution
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-secondary">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {score.breakdown.map((row) => {
                  const status = DIMENSION_STATUS[row.status] ?? DIMENSION_STATUS.unknown;
                  return (
                    <tr key={row.key} className="border-b border-border last:border-b-0">
                      <th scope="row" className="px-4 py-2.5 text-left font-medium text-primary">
                        {row.label}
                      </th>
                      <td className="tabular px-3 py-2.5 text-secondary">
                        {(row.weight * 100).toFixed(0)}%
                      </td>
                      <td className="tabular px-3 py-2.5 text-primary">
                        {row.score === null ? (
                          <span className="text-tertiary">Not scored</span>
                        ) : (
                          row.score.toFixed(2)
                        )}
                      </td>
                      <td className="tabular px-3 py-2.5 text-primary">
                        {row.contribution === null ? (
                          <span className="text-tertiary">None</span>
                        ) : (
                          row.contribution.toFixed(2)
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={status.tone} title={status.hint}>
                          {status.label}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
