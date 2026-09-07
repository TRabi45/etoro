"use client";

import Link from "next/link";
import type { TargetSummary } from "@/src/db/repositories/targets";
import { MIN_COMPARISON, MAX_COMPARISON } from "@/src/domain/targets/target-filters";
import { useTargetQuery } from "@/components/targets/use-target-query";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

/**
 * The selection tray, docked at the foot of the target list.
 *
 * Appears the moment anything is selected rather than only at two, because a
 * reader who has ticked one row needs to be told what ticking does. It states
 * the bound in words - two to four - so "Compare" being unavailable at one
 * selection is explained rather than mysterious.
 *
 * The comparison itself is a link carrying the current selection, so the
 * comparison view is a real URL that can be shared and reloaded rather than a
 * modal holding state that vanishes on refresh.
 */

export interface CompareTrayProps {
  selected: readonly TargetSummary[];
  /** Slugs that were selected but no longer match the filters, or do not exist. */
  missingSlugs: readonly string[];
}

export function CompareTray({ selected, missingSlugs }: CompareTrayProps) {
  const { toggleCompare, clearCompare } = useTargetQuery();
  const total = selected.length + missingSlugs.length;

  if (total === 0) {
    return null;
  }

  const ready = total >= MIN_COMPARISON;
  const compareHref = `/targets/compare?slugs=${[
    ...selected.map((target) => target.slug),
    ...missingSlugs,
  ].join(",")}`;

  return (
    <div className="sticky bottom-0 z-20 border-t border-border bg-surface px-4 py-3 shadow-[var(--shadow-menu)]">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-body font-medium text-primary">
          <span className="tabular">{total}</span> selected
        </p>

        <ul className="flex flex-wrap gap-1.5">
          {selected.map((target) => (
            <li key={target.slug}>
              <button
                type="button"
                onClick={() => toggleCompare(target.slug)}
                aria-label={`Remove ${target.canonicalName} from the comparison`}
                className="inline-flex items-center gap-1.5 rounded-pill border border-border-strong bg-surface-subtle px-2.5 py-1 text-caption text-primary motion-standard transition-colors hover:border-secondary"
              >
                {target.canonicalName}
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
          {missingSlugs.map((slug) => (
            <li key={slug}>
              <button
                type="button"
                onClick={() => toggleCompare(slug)}
                aria-label={`Remove ${slug} from the comparison`}
                title="Selected earlier, but this company is not in the current filtered list."
                className="inline-flex items-center gap-1.5 rounded-pill border border-warning/40 bg-warning-soft px-2.5 py-1 text-caption text-primary motion-standard transition-colors"
              >
                {slug}
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          {!ready ? (
            <span className="text-caption text-secondary">
              Select at least {MIN_COMPARISON} to compare, up to {MAX_COMPARISON}.
            </span>
          ) : null}
          <Button variant="ghost" size="sm" onClick={clearCompare}>
            Clear
          </Button>
          {ready ? (
            <Link
              href={compareHref}
              className="inline-flex h-8 items-center gap-1.5 rounded-control border border-brand bg-brand px-3 text-caption font-medium text-primary motion-standard transition-colors hover:bg-brand-hover"
            >
              <Icon name="compare" size={14} />
              Compare {total}
            </Link>
          ) : (
            <Button variant="primary" size="sm" icon="compare" disabled>
              Compare
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
