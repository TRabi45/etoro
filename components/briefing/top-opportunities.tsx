import Link from "next/link";
import type { TargetSummary } from "@/src/db/repositories/targets";
import { TargetCell } from "@/components/targets/target-cell";
import { RecommendationBadge } from "@/components/ui/recommendation-badge";
import { ScoreDisplay } from "@/components/ui/score-display";
import { CoverageBadge } from "@/components/ui/coverage-badge";
import { UnknownValue } from "@/components/ui/unknown-value";
import { formatCountry } from "@/components/ui/format";

/**
 * The five highest-scoring assessed targets.
 *
 * A table rather than a card gallery: these rows exist to be compared down
 * their columns, and cards make vertical comparison impossible. The columns are
 * the ones an analyst uses to triage - who, the thesis in one line, where, the
 * score with its coverage, the recommendation, and the timing argument.
 *
 * Score and coverage sit in adjacent columns rather than the score standing
 * alone, so the reader cannot take a number without seeing what it rests on.
 */

export function TopOpportunities({ targets }: { targets: readonly TargetSummary[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] border-collapse text-table">
        <thead>
          <tr className="border-b border-border text-left">
            <th scope="col" className="px-5 py-2.5 font-medium text-secondary">
              Target
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium text-secondary">
              Thesis
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium text-secondary">
              Country
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium text-secondary">
              Score
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium text-secondary">
              Coverage
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium text-secondary">
              Recommendation
            </th>
            <th scope="col" className="px-5 py-2.5 font-medium text-secondary">
              Why now
            </th>
          </tr>
        </thead>
        <tbody>
          {targets.map((target) => (
            <tr
              key={target.slug}
              className="border-b border-border last:border-b-0 motion-standard transition-colors hover:bg-surface-subtle"
            >
              <td className="px-5 py-3">
                {/* The link sits on the identity cell rather than wrapping the
                    row: a link cannot legally contain a table row, and an
                    onClick handler on the row would not be keyboard reachable. */}
                <Link href={`/companies/${target.slug}`} className="rounded-control">
                  <TargetCell target={target} />
                </Link>
              </td>
              <td className="max-w-[18rem] px-3 py-3 text-secondary">
                {target.thesis ? (
                  <span className="line-clamp-2">{target.thesis}</span>
                ) : (
                  <UnknownValue
                    kind="unknown"
                    reason="No assessment has written a thesis for this company yet."
                  />
                )}
              </td>
              <td className="px-3 py-3 text-secondary">
                {formatCountry(target.hqCountry) ?? <UnknownValue kind="unknown" />}
              </td>
              <td className="px-3 py-3">
                <ScoreDisplay
                  score={target.normalizedScore}
                  coverage={target.coverage}
                  lowerBound={target.lowerBound}
                  upperBound={target.upperBound}
                />
              </td>
              <td className="px-3 py-3">
                <CoverageBadge coverage={target.coverage} compact />
              </td>
              <td className="px-3 py-3">
                <RecommendationBadge recommendation={target.recommendation} />
              </td>
              <td className="max-w-[14rem] px-5 py-3 text-secondary">
                {target.whyNow ? (
                  <span className="line-clamp-2">{target.whyNow}</span>
                ) : (
                  <UnknownValue
                    kind="unknown"
                    reason="No timing argument has been recorded for this company."
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
