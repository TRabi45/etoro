import Link from "next/link";
import type { SystemStatus as SystemStatusData } from "@/src/db/repositories/briefing";
import { Icon } from "@/components/ui/icon";
import { formatDateTime, formatRelative, pluralize } from "@/components/ui/format";

/**
 * The quiet footer strip.
 *
 * Deliberately the least prominent thing on the page and deliberately always
 * present. A monitoring product that has silently stopped looks exactly like
 * one that is running and finding nothing, and this strip is the only thing
 * that distinguishes them - so it is never hidden when healthy, because a
 * status line that only appears on failure teaches the reader that its absence
 * means nothing at all.
 *
 * Failures are named, not counted. "2 issues" is not actionable; "Fetch failed
 * for example.com: timed out" tells an operator what to do.
 */

export function SystemStatus({ status }: { status: SystemStatusData }) {
  const { lastRun, failures, degraded } = status;

  return (
    <section
      aria-labelledby="system-status-heading"
      className="rounded-card border border-border bg-surface-subtle px-5 py-4"
    >
      <h2
        id="system-status-heading"
        className="text-caption font-semibold tracking-wide text-secondary uppercase"
      >
        System status
      </h2>

      <dl className="mt-2.5 flex flex-wrap gap-x-8 gap-y-2">
        <div>
          <dt className="text-caption text-tertiary">Last run</dt>
          <dd className="flex items-center gap-1.5 text-body text-primary">
            {lastRun ? (
              <>
                <Icon
                  name={
                    lastRun.status === "success"
                      ? "check-circle"
                      : lastRun.status === "running"
                        ? "clock"
                        : "alert-circle"
                  }
                  size={15}
                  className={
                    lastRun.status === "success"
                      ? "text-brand"
                      : lastRun.status === "partial_success"
                        ? "text-warning"
                        : lastRun.status === "running"
                          ? "text-secondary"
                          : "text-danger"
                  }
                />
                <span title={formatDateTime(lastRun.finishedAt ?? lastRun.startedAt) ?? undefined}>
                  {lastRun.status === "success"
                    ? "Succeeded"
                    : lastRun.status === "partial_success"
                      ? "Partial success"
                      : lastRun.status === "running"
                        ? "Running"
                        : lastRun.status === "blocked"
                          ? "Blocked"
                          : "Failed"}{" "}
                  <span className="tabular text-secondary">
                    {formatRelative(lastRun.finishedAt ?? lastRun.startedAt)}
                  </span>
                </span>
              </>
            ) : (
              <>
                <Icon name="minus" size={15} className="text-tertiary" />
                Never run
              </>
            )}
          </dd>
        </div>

        <div>
          <dt className="text-caption text-tertiary">Sources fetched</dt>
          <dd className="tabular text-body text-primary">
            {lastRun ? `${lastRun.sourcesFetched} of ${lastRun.sourcesDiscovered}` : "-"}
          </dd>
        </div>

        <div>
          <dt className="text-caption text-tertiary">Source failures</dt>
          <dd className="text-body text-primary">
            {failures.length === 0 ? (
              "None recorded"
            ) : (
              <span className="text-warning">
                {failures.length} {pluralize(failures.length, "warning")}
              </span>
            )}
          </dd>
        </div>

        <div>
          <dt className="text-caption text-tertiary">Diagnostics</dt>
          <dd className="text-body">
            <Link href="/monitoring" className="text-info hover:underline">
              Open Monitoring
            </Link>
          </dd>
        </div>
      </dl>

      {degraded.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1 border-t border-border pt-3">
          {degraded.map((line) => (
            <li key={line} className="flex items-start gap-1.5 text-caption text-warning">
              <Icon name="alert-circle" size={14} className="mt-0.5" />
              {line}
            </li>
          ))}
        </ul>
      ) : null}

      {failures.length > 0 ? (
        <details className="mt-3 border-t border-border pt-3">
          <summary className="cursor-pointer text-caption font-medium text-secondary">
            Show the {failures.length} {pluralize(failures.length, "warning")} from the last run
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {failures.map((failure, index) => (
              <li
                key={`${index}-${failure.slice(0, 24)}`}
                className="rounded border border-border bg-surface px-2.5 py-1.5 text-caption leading-relaxed break-words text-secondary"
              >
                {failure}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
