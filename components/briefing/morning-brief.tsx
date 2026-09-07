import Link from "next/link";
import type { MorningBrief as MorningBriefData } from "@/src/db/repositories/briefing";
import { Greeting } from "@/components/briefing/greeting";
import { Icon } from "@/components/ui/icon";
import { countInWords, pluralize } from "@/components/ui/format";

/**
 * The colleague summary at the top of the briefing.
 *
 * Every sentence is composed from counts the brief actually carries. Nothing
 * here is written ahead of time and filled in, which is why the empty and
 * never-run cases get their own wording rather than a template that reads
 * "I reviewed 0 sources and found no material changes" - technically true, and
 * exactly the kind of sentence that makes a reader stop trusting the product.
 *
 * The one thing it never does is characterise a finding it has not counted.
 * "One target moved into priority diligence" is printed only when a target
 * actually holds that recommendation.
 */

export function MorningBrief({ brief }: { brief: MorningBriefData }) {
  const { sourcesReviewed, materialChanges, newTargets, leadItem, systemStatus } = brief;
  const hasRun = systemStatus.lastRun !== null;

  return (
    <section
      aria-labelledby="morning-brief-heading"
      className="rounded-card border border-border bg-surface p-5"
    >
      <h2 id="morning-brief-heading" className="sr-only">
        Morning brief
      </h2>

      <p className="text-lead leading-relaxed text-primary">
        <Greeting />{" "}
        {!hasRun ? (
          <>
            No monitoring run has completed yet, so I have nothing to report from the feeds. The
            universe below is the seeded watchlist, not research output.
          </>
        ) : (
          <>
            I reviewed{" "}
            <strong className="tabular font-semibold">
              {sourcesReviewed} {pluralize(sourcesReviewed, "source")}
            </strong>{" "}
            and found{" "}
            <strong className="font-semibold">
              {countInWords(materialChanges.length)}{" "}
              {pluralize(materialChanges.length, "material change")}
            </strong>
            {newTargets.length > 0 ? (
              <>
                . {countInWords(newTargets.length)} {pluralize(newTargets.length, "company", "companies")} in
                the universe {newTargets.length === 1 ? "has" : "have"} no assessment yet
              </>
            ) : null}
            .
          </>
        )}
      </p>

      {leadItem ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="flex items-center gap-1.5 text-caption font-semibold tracking-wide text-secondary uppercase">
            <Icon name="spark" size={14} />
            Most important today
          </p>
          <p className="mt-1.5 text-body leading-relaxed text-primary">{leadItem.headline}</p>
          <p className="mt-1 text-body leading-relaxed text-secondary">{leadItem.whyItMatters}</p>
          {leadItem.target ? (
            <Link
              href={`/companies/${leadItem.target.slug}`}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-control text-body font-medium text-primary motion-standard transition-colors hover:text-brand-hover"
            >
              Open {leadItem.target.canonicalName}
              <Icon name="chevron-right" size={16} />
            </Link>
          ) : null}
        </div>
      ) : hasRun ? (
        <p className="mt-3 text-body leading-relaxed text-secondary">
          Nothing is flagged for attention. That means no target is blocked, none is scored on
          evidence below the floor, and no high-materiality event was recorded in the window - not
          that nothing happened in the world.
        </p>
      ) : null}
    </section>
  );
}
