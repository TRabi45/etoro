import Link from "next/link";
import { connection } from "next/server";
import { getRecentRuns, type MonitoringRunSummary } from "@/src/db/repositories/monitoring-runs";
import { getRecentEvents } from "@/src/db/repositories/events";
import { searchTargets, type TargetSummary } from "@/src/db/repositories/targets";
import { STALE_AFTER_DAYS } from "@/src/domain/targets/target-filters";
import { RunStatus } from "@/components/monitoring/run-status";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FreshnessLabel } from "@/components/ui/freshness-label";
import { Icon } from "@/components/ui/icon";
import { ageInDays, formatDate, formatRelative, pluralize } from "@/components/ui/format";

/**
 * Pipeline health and the watchlist's review schedule.
 *
 * A monitoring product that has silently stopped looks identical, from the
 * outside, to one that is running and finding nothing. This page is where that
 * difference is made visible, so it is deliberately blunt about failure: runs
 * that partially succeeded say so, failed sources are named rather than
 * counted, and a company nobody has looked at is listed rather than assumed
 * fine.
 *
 * Technical logs stay out of the main flow. Warnings are one disclosure away
 * inside each run, which is close enough for an operator and far enough that an
 * analyst reading review dates never has to scroll past a stack trace.
 */

/**
 * The event window, computed outside the component.
 *
 * Reading the clock inside a component body is flagged as impure - correctly in
 * general, even though an async Server Component runs once per request. Keeping
 * it in a module function states the intent and keeps the rule meaningful
 * everywhere else.
 */
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export default async function MonitoringPage() {
  await connection();

  const [runsResult, targetsResult, eventsResult] = await Promise.all([
    getRecentRuns(5),
    searchTargets({ limit: 500 }),
    getRecentEvents({
      sinceDate: daysAgoIso(30),
      limit: 50,
    }),
  ]);

  const runs = runsResult.ok ? runsResult.data : [];
  const targets = targetsResult.ok ? targetsResult.data : [];
  const events = eventsResult.ok ? eventsResult.data : [];

  const problems = [
    runsResult.ok ? null : `Run history: ${runsResult.problem.message}`,
    targetsResult.ok ? null : `Watchlist: ${targetsResult.problem.message}`,
    eventsResult.ok ? null : `Events: ${eventsResult.problem.message}`,
  ].filter((problem): problem is string => problem !== null);

  const stale = targets.filter((target) => {
    const age = ageInDays(target.lastResearchedAt);
    return age !== null && age > STALE_AFTER_DAYS;
  });
  const neverResearched = targets.filter((target) => target.lastResearchedAt === null);
  const dueForReview = targets
    .filter((target) => target.nextRefreshAt !== null)
    .sort((left, right) => (left.nextRefreshAt ?? "").localeCompare(right.nextRefreshAt ?? ""));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
      <div>
        <h1 className="text-page font-semibold text-primary">Monitoring</h1>
        <p className="mt-1 max-w-prose text-body text-secondary">
          What the pipeline last did, what it found, and which profiles are overdue. A quiet feed
          and a stopped pipeline look the same from outside, so this page distinguishes them.
        </p>
      </div>

      {problems.length > 0 ? (
        <ErrorState
          tone={problems.length === 3 ? "error" : "partial"}
          title={
            problems.length === 3
              ? "Monitoring data could not be read"
              : "Part of this page could not be read"
          }
          impact={
            problems.length === 3 ? (
              <>
                None of the three views below could be loaded, so nothing here should be taken as
                evidence that the pipeline is healthy.
              </>
            ) : (
              <>
                The sections that loaded are shown in full. Treat the missing ones as unknown rather
                than as empty.
              </>
            )
          }
          detail={problems.join(" | ")}
        />
      ) : null}

      <section aria-labelledby="runs-heading">
        <h2 id="runs-heading" className="text-section font-semibold text-primary">
          Recent runs
        </h2>

        <div className="mt-3 flex flex-col gap-3">
          {runs.length === 0 ? (
            <div className="rounded-card border border-border bg-surface p-5">
              <EmptyState
                icon="monitoring"
                title="The pipeline has not run yet"
                nextStep={
                  <>
                    Nothing on any screen in this product reflects a fetched source until a run
                    completes. Start one with <Code>pnpm monitor</Code>, or use{" "}
                    <span className="font-medium text-primary">Run intelligence</span> in the top
                    bar.
                  </>
                }
              />
            </div>
          ) : (
            runs.map((run) => <RunStatus key={run.id} run={run} />)
          )}
        </div>
      </section>

      <section aria-labelledby="watchlist-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="watchlist-heading" className="text-section font-semibold text-primary">
            Watchlist by review status
          </h2>
          <Link
            href="/targets"
            className="inline-flex items-center gap-1 text-body font-medium text-primary hover:text-brand-hover"
          >
            All targets
            <Icon name="chevron-right" size={16} />
          </Link>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <ReviewGroup
            title="Stale"
            tone="warning"
            count={stale.length}
            description={`Last verified more than ${STALE_AFTER_DAYS} days ago. The figures may still be right; nobody has confirmed them.`}
            targets={stale}
            emptyLine="No profile has aged past the staleness threshold."
          />
          <ReviewGroup
            title="Never researched"
            tone="neutral"
            count={neverResearched.length}
            description="In the universe, but no research pass has ever completed. Not stale - nothing has gone off, nothing has been done."
            targets={neverResearched}
            emptyLine="Every company has been researched at least once."
          />
          <ReviewGroup
            title="Scheduled for review"
            tone="neutral"
            count={dueForReview.length}
            description="Policy has set a next refresh date for these companies."
            targets={dueForReview}
            emptyLine="No company has a scheduled refresh date."
            showNextRefresh
          />
        </div>
      </section>

      <section aria-labelledby="found-heading">
        <h2 id="found-heading" className="text-section font-semibold text-primary">
          Material events found
        </h2>
        <p className="mt-1 text-body text-secondary">
          Last 30 days. {events.length === 0 ? "None recorded." : null}
        </p>

        <div className="mt-3 overflow-hidden rounded-card border border-border bg-surface">
          {events.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon="monitoring"
                title="No events recorded in the last 30 days"
                nextStep={
                  <>
                    Nothing has been <em>recorded</em>, which is not the same as nothing having
                    happened. If runs are succeeding and this stays empty, the source list is the
                    thing to check.
                  </>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {events.slice(0, 12).map((event) => (
                <li key={event.id} className="flex flex-wrap items-baseline gap-2 px-5 py-3">
                  <span className="tabular text-caption text-tertiary">
                    {formatDate(event.eventDate ?? event.publishedAt) ?? "Undated"}
                  </span>
                  {event.companySlug && event.companyName ? (
                    <Link
                      href={`/companies/${event.companySlug}`}
                      className="text-body font-medium text-primary hover:underline"
                    >
                      {event.companyName}
                    </Link>
                  ) : (
                    <span className="text-body text-tertiary">Unattributed</span>
                  )}
                  <span className="min-w-0 flex-1 text-body text-secondary">{event.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="help-heading" id="help" className="scroll-mt-4">
        <h2 id="help-heading" className="text-section font-semibold text-primary">
          Help and definitions
        </h2>
        <dl className="mt-3 grid gap-3 rounded-card border border-border bg-surface p-5 sm:grid-cols-2">
          {[
            {
              term: "Coverage",
              definition:
                "The share of applicable scoring weight actually backed by evidence. Reported beside the score and never folded into it.",
            },
            {
              term: "Uncertainty range",
              definition:
                "The score if every unestablished criterion scored lowest, and if every one scored highest. Neither bound is a prediction.",
            },
            {
              term: "Hard gate",
              definition:
                "A condition that overrides the score. Triggered blocks the target outright; unresolved denies priority diligence until settled.",
            },
            {
              term: "Tuck-in vs Platform",
              definition:
                "A classification of the operating shape a deal would take, not a second scorecard. A hybrid gets the one global score.",
            },
            {
              term: "Unknown vs Not applicable",
              definition:
                "Unknown means it applies and nobody has published it. Not applicable means the measure does not apply to that business. Neither is zero.",
            },
            {
              term: "Partial success",
              definition:
                "A run that completed and wrote real data while some sources failed. The results are usable; coverage may be incomplete.",
            },
          ].map((entry) => (
            <div key={entry.term}>
              <dt className="text-body font-medium text-primary">{entry.term}</dt>
              <dd className="mt-0.5 text-body leading-relaxed text-secondary">
                {entry.definition}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function ReviewGroup({
  title,
  tone,
  count,
  description,
  targets,
  emptyLine,
  showNextRefresh = false,
}: {
  title: string;
  tone: "warning" | "neutral";
  count: number;
  description: string;
  targets: readonly TargetSummary[];
  emptyLine: string;
  showNextRefresh?: boolean;
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-body font-semibold text-primary">{title}</h3>
        <Badge tone={count > 0 && tone === "warning" ? "warning" : "neutral"}>{count}</Badge>
      </div>
      <p className="mt-1 text-caption leading-relaxed text-secondary">{description}</p>

      {count === 0 ? (
        <p className="mt-3 text-caption text-tertiary">{emptyLine}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {targets.slice(0, 6).map((target) => (
            <li key={target.slug}>
              <Link
                href={`/companies/${target.slug}`}
                className="flex flex-col rounded-control px-2 py-1.5 motion-standard transition-colors hover:bg-surface-subtle"
              >
                <span className="truncate text-body font-medium text-primary">
                  {target.canonicalName}
                </span>
                {showNextRefresh ? (
                  <span className="tabular text-caption text-tertiary">
                    Due {formatRelative(target.nextRefreshAt)} ({formatDate(target.nextRefreshAt)})
                  </span>
                ) : (
                  <FreshnessLabel lastResearchedAt={target.lastResearchedAt} />
                )}
              </Link>
            </li>
          ))}
          {targets.length > 6 ? (
            <li className="px-2 text-caption text-tertiary">
              and {targets.length - 6} {pluralize(targets.length - 6, "other")}
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-border bg-surface-subtle px-1 py-0.5 font-mono text-caption">
      {children}
    </code>
  );
}

export type { MonitoringRunSummary };
