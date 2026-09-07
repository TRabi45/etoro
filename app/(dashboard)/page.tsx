import Link from "next/link";
import { connection } from "next/server";
import { getMorningBrief } from "@/src/db/repositories/briefing";
import { MorningBrief } from "@/components/briefing/morning-brief";
import { AttentionRow } from "@/components/briefing/attention-row";
import { MaterialEventRow } from "@/components/briefing/material-event-row";
import { TopOpportunities } from "@/components/briefing/top-opportunities";
import { SystemStatus } from "@/components/briefing/system-status";
import { StartHere } from "@/components/briefing/start-here";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";

/**
 * The briefing - the default landing page.
 *
 * Ordered by what the analyst needs to know, not by what is easy to render:
 * the colleague summary, then what needs attention, then the ranked
 * opportunities, then the raw feed, then a quiet status strip. There are no KPI
 * cards at the top, because a row of totals answers a question nobody opening
 * this page is asking.
 *
 * `getMorningBrief` never fails as a whole - it degrades - so this page has no
 * error branch of its own. What could not be read is named inside the status
 * strip, and everything that could be read still renders. A partial brief is
 * far more useful than an error page, and hiding the good half to report the
 * bad one would be the wrong trade every morning.
 *
 * `connection()` moves rendering to request time; a build-time snapshot of a
 * monitoring product's front page would be wrong the moment it was taken.
 */
export default async function BriefingPage() {
  await connection();
  const brief = await getMorningBrief();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-page font-semibold text-primary">Briefing</h1>
        <StartHere />
      </div>

      <MorningBrief brief={brief} />

      <section aria-labelledby="needs-attention-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="needs-attention-heading" className="text-section font-semibold text-primary">
            Needs attention
          </h2>
          <span className="text-caption text-tertiary">
            Blocked gates first, then material events
          </span>
        </div>

        <div className="mt-3 overflow-hidden rounded-card border border-border bg-surface">
          {brief.needsAttention.length > 0 ? (
            <ul>
              {brief.needsAttention.map((item, index) => (
                <AttentionRow key={`${item.reason}-${item.target?.slug ?? index}`} item={item} />
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <EmptyState
                icon="check-circle"
                title="Nothing needs attention"
                nextStep={
                  <>
                    No target is blocked by a gate, none is scored on evidence below the floor, and
                    no high-materiality event was recorded in the last two weeks. This says what the
                    pipeline has recorded, not what happened in the world - run intelligence to
                    check for anything newer.
                  </>
                }
              />
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="top-opportunities-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="top-opportunities-heading" className="text-section font-semibold text-primary">
            Top opportunities
          </h2>
          <Link
            href="/targets"
            className="inline-flex items-center gap-1 rounded text-body font-medium text-primary motion-standard transition-colors hover:text-brand-hover"
          >
            All targets
            <Icon name="chevron-right" size={16} />
          </Link>
        </div>

        <div className="mt-3 overflow-hidden rounded-card border border-border bg-surface">
          {brief.topOpportunities.length > 0 ? (
            <TopOpportunities targets={brief.topOpportunities} />
          ) : (
            <div className="p-5">
              <EmptyState
                icon="targets"
                title="No company has been scored yet"
                nextStep={
                  <>
                    The universe holds{" "}
                    <span className="tabular font-medium text-primary">
                      {brief.newTargets.length}
                    </span>{" "}
                    {brief.newTargets.length === 1 ? "company" : "companies"} with no assessment.
                    Scoring happens after a research pass gathers evidence - until then they are
                    identities, not candidates.
                  </>
                }
                action={
                  <Link
                    href="/targets"
                    className="inline-flex h-10 items-center gap-1.5 rounded-control border border-border-strong bg-surface px-3.5 text-body font-medium text-primary motion-standard transition-colors hover:bg-surface-subtle"
                  >
                    Browse the universe
                    <Icon name="chevron-right" size={16} />
                  </Link>
                }
              />
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="material-changes-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="material-changes-heading" className="text-section font-semibold text-primary">
            Latest material changes
          </h2>
          <span className="text-caption text-tertiary">Last 14 days</span>
        </div>

        <div className="mt-3 overflow-hidden rounded-card border border-border bg-surface">
          {brief.materialChanges.length > 0 ? (
            <ul>
              {brief.materialChanges.slice(0, 8).map((event) => (
                <MaterialEventRow key={event.id} event={event} />
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <EmptyState
                icon="monitoring"
                title="No events recorded in the last 14 days"
                nextStep={
                  <>
                    Nothing has been <em>recorded</em>, which is not the same as nothing having
                    happened. Events appear here once a monitoring run extracts them from a fetched
                    source.
                  </>
                }
              />
            </div>
          )}
        </div>
      </section>

      <SystemStatus status={brief.systemStatus} />
    </div>
  );
}
