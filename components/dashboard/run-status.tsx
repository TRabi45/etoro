import type { MonitoringRunSummary } from "@/src/db/repositories/monitoring-runs";

/**
 * The pipeline's freshness indicator.
 *
 * A monitoring system that has silently stopped looks identical, from the
 * outside, to one that is looking and finding nothing. This panel is what makes
 * those two states distinguishable, so it shows when the last run happened and
 * what it produced whether or not that reads well.
 *
 * Warnings are listed rather than counted. "4 warnings" is not something an
 * operator can act on; "Fetch failed for example.com: timed out after 10000ms"
 * is.
 */

const STATUS_STYLES: Record<MonitoringRunSummary["status"], { label: string; className: string }> =
  {
    running: { label: "Running", className: "bg-blue-50 text-blue-800 border-blue-200" },
    success: { label: "Success", className: "bg-green-50 text-green-800 border-green-200" },
    // Amber rather than green: a partial run completed, but something was missed
    // and the universe may be less current than it looks.
    partial_success: {
      label: "Partial success",
      className: "bg-amber-50 text-amber-900 border-amber-200",
    },
    failed: { label: "Failed", className: "bg-red-50 text-red-800 border-red-200" },
  };

function formatTimestamp(value: string): string {
  return new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function RunStatus({ run }: { run: MonitoringRunSummary }) {
  const status = STATUS_STYLES[run.status];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span
            className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${status.className}`}
          >
            {status.label}
          </span>
          <span className="ml-2 text-xs text-slate-500">
            {run.trigger} run &middot; started {formatTimestamp(run.startedAt)}
          </span>
        </div>
        {run.finishedAt ? (
          <span className="text-xs text-slate-400">finished {formatTimestamp(run.finishedAt)}</span>
        ) : (
          <span className="text-xs text-slate-400">not finished</span>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        {[
          ["Discovered", run.sourcesDiscovered],
          ["Fetched", run.sourcesFetched],
          ["Claims", run.claimsWritten],
          ["Events", run.eventsWritten],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="font-mono text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>

      {run.errorSummary ? (
        <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {run.errorSummary}
        </p>
      ) : null}

      {run.warnings.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-amber-900">
            {run.warnings.length} warning{run.warnings.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-1">
            {run.warnings.map((warning, index) => (
              <li
                key={`${index}-${warning.slice(0, 24)}`}
                className="break-words rounded bg-amber-50 px-2 py-1 text-xs leading-relaxed text-amber-900"
              >
                {warning}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
