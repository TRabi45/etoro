"use client";

import Link from "next/link";
import type { TargetSummary } from "@/src/db/repositories/targets";
import { MAX_COMPARISON } from "@/src/domain/targets/target-filters";
import { useTargetQuery } from "@/components/targets/use-target-query";
import { TargetCell } from "@/components/targets/target-cell";
import { RecommendationBadge } from "@/components/ui/recommendation-badge";
import { ScoreDisplay } from "@/components/ui/score-display";
import { CoverageBadge } from "@/components/ui/coverage-badge";
import { FreshnessLabel } from "@/components/ui/freshness-label";
import { UnknownValue } from "@/components/ui/unknown-value";
import { Badge } from "@/components/ui/badge";
import { formatCountry, humanizeToken } from "@/components/ui/format";

/**
 * The ranked target explorer.
 *
 * A table, because the whole point is comparison down a column - a card gallery
 * makes that impossible and is why most target lists end up unusable at twenty
 * rows.
 *
 * Two structural details that matter more than they look:
 *
 *   - the header is sticky, so the columns stay meaningful when a reader
 *     scrolls into the middle of the universe;
 *   - the identity cell carries the link rather than the row. A link cannot
 *     legally wrap a `tr`, and an onClick on the row would not be reachable by
 *     keyboard - so the row is clickable in the sense that matters (a large,
 *     obvious target in the first column) without breaking either rule.
 *
 * Selection for comparison lives in the URL, so a comparison survives a reload
 * and the agent can see which companies the analyst means by "compare them".
 */

export interface TargetTableProps {
  targets: readonly TargetSummary[];
  selected: readonly string[];
}

export function TargetTable({ targets, selected }: TargetTableProps) {
  const { toggleCompare } = useTargetQuery();
  const atCapacity = selected.length >= MAX_COMPARISON;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[64rem] border-collapse text-table">
        <caption className="sr-only">
          Monitored acquisition targets, ranked. Select two to four rows to compare them.
        </caption>
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="border-b border-border text-left">
            <th scope="col" className="w-10 px-3 py-2.5">
              <span className="sr-only">Select for comparison</span>
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium text-secondary">
              Target
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium text-secondary">
              Thesis
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium text-secondary">
              Country
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium text-secondary">
              Category
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
            <th scope="col" className="px-3 py-2.5 font-medium text-secondary">
              Why now
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium text-secondary">
              Updated
            </th>
          </tr>
        </thead>
        <tbody>
          {targets.map((target) => {
            const isSelected = selected.includes(target.slug);
            return (
              <tr
                key={target.slug}
                className={`border-b border-border last:border-b-0 motion-standard transition-colors ${
                  isSelected ? "bg-brand-soft/50" : "hover:bg-surface-subtle"
                }`}
              >
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleCompare(target.slug)}
                    // Disabled only when adding would exceed the cap - an
                    // already-selected row must stay clickable to deselect.
                    disabled={!isSelected && atCapacity}
                    aria-label={`Select ${target.canonicalName} for comparison`}
                    title={
                      !isSelected && atCapacity
                        ? `Comparison is limited to ${MAX_COMPARISON} companies. Deselect one first.`
                        : undefined
                    }
                    className="h-4 w-4 accent-[var(--brand-primary)] disabled:opacity-40"
                  />
                </td>

                <td className="px-3 py-3">
                  <Link href={`/companies/${target.slug}`} className="block rounded-control">
                    <TargetCell target={target} />
                  </Link>
                </td>

                <td className="max-w-[20rem] px-3 py-3 text-secondary">
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
                  {formatCountry(target.hqCountry) ?? (
                    <UnknownValue
                      kind="unknown"
                      reason="No source has established this company's headquarters country."
                    />
                  )}
                </td>

                <td className="px-3 py-3">
                  {target.themeTags.length > 0 ? (
                    <span className="flex flex-wrap gap-1">
                      {target.themeTags.map((theme) => (
                        <Badge key={theme} tone="neutral">
                          {humanizeToken(theme)}
                        </Badge>
                      ))}
                    </span>
                  ) : (
                    <UnknownValue kind="unknown" reason="Not yet classified into a theme." />
                  )}
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

                <td className="max-w-[16rem] px-3 py-3 text-secondary">
                  {target.whyNow ? (
                    <span className="line-clamp-2">{target.whyNow}</span>
                  ) : (
                    <UnknownValue
                      kind="unknown"
                      reason="No timing argument has been recorded for this company."
                    />
                  )}
                </td>

                <td className="px-4 py-3">
                  <FreshnessLabel lastResearchedAt={target.lastResearchedAt} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
