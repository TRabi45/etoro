import type { MonitoringRunSummary } from "@/src/db/repositories/monitoring-runs";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Icon, type IconName } from "@/components/ui/icon";
import { formatDateTime, formatRelative, pluralize } from "@/components/ui/format";

/**
 * One pipeline run, reported honestly.
 *
 * Warnings are listed rather than counted, because "4 warnings" is not
 * something an operator can act on and "Fetch failed for example.com: timed out
 * after 10000ms" is. They sit behind a disclosure so an analyst reading review
 * dates does not have to scroll past them, which is as far as technical detail
 * is allowed into the main UI.
 *
 * `partial_success` is styled as its own state rather than rounded to success.
 * A run that fetched three of five sources wrote real data and left coverage
 * incomplete; both halves matter, and a green tick would erase the second.
 */

const STATUS: Record<
  MonitoringRunSummary["status"],
  { label: string; tone: BadgeTone; icon: IconName; meaning: string }
> = {
  running: {
    label: "Running",
    tone: "info",
    icon: "clock",
    meaning: "In progress. Counts below will change until it finishes.",
  },
  success: {
    label: "Success",
    tone: "brand",
    icon: "check-circle",
    meaning: "Every planned source was fetched and processed.",
  },
  partial_success: {
    label: "Partial success",
    tone: "warning",
    icon: "alert-circle",
    meaning:
      "The run completed and wrote real data, and some sources failed. Results are usable; coverage may be incomplete.",
  },
  failed: {
    label: "Failed",
    tone: "danger",
    icon: "alert-triangle",
    meaning: "The run did not complete. Nothing here should be treated as current.",
  },
  blocked: {
    label: "Blocked",
    tone: "danger",
    icon: "alert-triangle",
    meaning: "The run could not start or was stopped by a guard.",
  },
};

export function RunStatus({ run }: { run: MonitoringRunSummary }) {
  const status = STATUS[run.status];

  return (
    <article className="rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Icon
          name={status.icon}
          size={16}
          className={
            run.status === "success"
              ? "text-brand"
              : run.status === "partial_success"
                ? "text-warning"
                : run.status === "running"
                  ? "text-info"
                  : "text-danger"
          }
        />
        <Badge tone={status.tone} title={status.meaning}>
          {status.label}
        </Badge>
        <span className="text-caption text-secondary">{run.trigger} run</span>
        <span
          className="tabular text-caption text-tertiary"
          title={formatDateTime(run.startedAt) ?? undefined}
        >
          started {formatRelative(run.startedAt)}
        </span>
        {run.finishedAt ? (
          <span
            className="tabular text-caption text-tertiary"
            title={formatDateTime(run.finishedAt) ?? undefined}
          >
            · finished {formatRelative(run.finishedAt)}
          </span>
        ) : (
          <span className="text-caption text-tertiary">· not finished</span>
        )}
      </div>

      <p className="mt-2 text-body leading-relaxed text-secondary">{status.meaning}</p>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 sm:grid-cols-5">
        {[
          ["Discovered", run.sourcesDiscovered],
          ["Fetched", run.sourcesFetched],
          ["Skipped", run.sourcesSkipped],
          ["Claims", run.claimsWritten],
          ["Events", run.eventsWritten],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt className="text-caption text-tertiary">{label}</dt>
            <dd className="tabular text-body font-medium text-primary">{value}</dd>
          </div>
        ))}
      </dl>

      {run.errorSummary ? (
        <p className="mt-3 rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-body leading-relaxed text-primary">
          {run.errorSummary}
        </p>
      ) : null}

      {run.warnings.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-caption font-medium text-secondary">
            {run.warnings.length} {pluralize(run.warnings.length, "warning")} - named, not counted
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {run.warnings.map((warning, index) => (
              <li
                key={`${index}-${warning.slice(0, 24)}`}
                className="rounded border border-border bg-surface-subtle px-2.5 py-1.5 text-caption leading-relaxed break-words text-secondary"
              >
                {warning}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}
