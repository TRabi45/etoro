"use client";

import { useCallback, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  classifyFailure,
  unreachableFailure,
  type ActionRefusal,
} from "@/components/shell/bounded-action";

/**
 * The `Run intelligence` control.
 *
 * This is the most expensive action in the product - several fetches plus a
 * model call per document - so it is deliberately not a one-click button. The
 * flow is: state the scope, get a confirmation, run, then report what actually
 * happened.
 *
 * The rule that shapes every branch below: **never imply a run succeeded before
 * the backend confirms it.** So there is no optimistic "Started!" toast, no
 * spinner that resolves on a timer, and `partial_success` gets its own outcome
 * rather than being rounded up to success. A run that fetched three of five
 * sources produced real data *and* left the universe less current than it
 * looks; both halves of that are reported.
 *
 * Refusals are classified by `classifyFailure`, which decides the one thing
 * that matters here: whether a retry is honest. It keys off the error code
 * rather than the status, because a missing operator secret and a missing model
 * key both return 503 - and both are server configuration facts that no number
 * of retries will change. Offering a "Try again" button for those would invite
 * the reader to keep clicking at something guaranteed to fail, and disguise a
 * configuration problem as a transient one.
 */

interface RunReport {
  runId: string;
  reused: boolean;
  status: "running" | "success" | "partial_success" | "failed" | "blocked";
  sourcesDiscovered: number;
  sourcesFetched: number;
  sourcesSkipped: number;
  claimsWritten: number;
  eventsWritten: number;
  companiesDiscovered: number;
  warnings: string[];
}

type Phase =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "running" }
  | { kind: "done"; report: RunReport }
  | ({ kind: "refused" } & ActionRefusal);

/** Bounded by the API itself; stated up front so the scope is never a surprise. */
const MAX_SOURCES = 5;

export function RunIntelligence() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const router = useRouter();
  const panelId = useId();
  // One key per confirmed run, so a double-click joins the existing run on the
  // server instead of starting a second one.
  const idempotencyKey = useRef<string | null>(null);

  const close = useCallback(() => setPhase({ kind: "idle" }), []);

  const start = useCallback(async () => {
    idempotencyKey.current = `ui-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setPhase({ kind: "running" });

    try {
      const response = await fetch("/api/monitor/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ maxSources: MAX_SOURCES, idempotencyKey: idempotencyKey.current }),
      });

      if (!response.ok) {
        // Every refusal is classified in one place, because the reason a
        // bounded action was refused decides whether a retry is honest - and
        // that cannot be read off the status alone. An unconfigured operator
        // secret returns 503, which would otherwise look like a transient
        // server fault and be offered a retry that can never succeed.
        const body = (await response.json().catch(() => null)) as {
          error?: { code?: string; message?: string };
        } | null;
        const refusal = classifyFailure(response, body, "run");
        setPhase({ kind: "refused", ...refusal });
        return;
      }

      const report = (await response.json()) as RunReport;
      setPhase({ kind: "done", report });
      // New claims and events only appear once the server components re-read.
      router.refresh();
    } catch {
      setPhase({ kind: "refused", ...unreachableFailure("run") });
    }
  }, [router]);

  return (
    <div className="relative">
      <Button
        variant="secondary"
        size="sm"
        icon="refresh"
        onClick={() => setPhase(phase.kind === "idle" ? { kind: "confirming" } : { kind: "idle" })}
        disabled={phase.kind === "running"}
        aria-expanded={phase.kind !== "idle"}
        aria-controls={panelId}
        title="Fetch and analyse new sources. Bounded, and confirmed before it starts."
      >
        {phase.kind === "running" ? "Running…" : "Run intelligence"}
      </Button>

      {phase.kind === "idle" ? null : (
        <div
          id={panelId}
          role="dialog"
          aria-label="Run intelligence"
          className="absolute right-0 top-[calc(100%+8px)] z-40 w-80 rounded-card border border-border bg-surface p-4 shadow-[var(--shadow-menu)]"
        >
          {phase.kind === "confirming" ? (
            <>
              <p className="text-body font-semibold text-primary">Run intelligence now?</p>
              <ul className="mt-2 flex flex-col gap-1 text-caption leading-relaxed text-secondary">
                <li>Fetches up to {MAX_SOURCES} new sources from the configured feeds.</li>
                <li>Extracts claims and events, and resolves company identities.</li>
                <li>Takes up to a few minutes. Scores are not recalculated here.</li>
              </ul>
              <div className="mt-3 flex gap-2">
                <Button variant="primary" size="sm" onClick={start}>
                  Start run
                </Button>
                <Button variant="ghost" size="sm" onClick={close}>
                  Cancel
                </Button>
              </div>
            </>
          ) : null}

          {phase.kind === "running" ? (
            <div aria-live="polite">
              <p className="flex items-center gap-2 text-body font-semibold text-primary">
                <Icon name="refresh" size={16} className="animate-spin text-brand" />
                Fetching sources
              </p>
              <p className="mt-2 text-caption leading-relaxed text-secondary">
                Reading feeds, extracting claims and resolving identities. This panel will report
                what the run actually produced - leave it open or come back to Monitoring.
              </p>
            </div>
          ) : null}

          {phase.kind === "done" ? <RunOutcome report={phase.report} onClose={close} /> : null}

          {phase.kind === "refused" ? (
            <div aria-live="polite">
              <p className="flex items-center gap-2 text-body font-semibold text-primary">
                <Icon name="alert-circle" size={16} className="text-warning" />
                {phase.title}
              </p>
              <p className="mt-2 text-caption leading-relaxed text-secondary">{phase.message}</p>
              <div className="mt-3 flex gap-2">
                {phase.retryable ? (
                  <Button variant="secondary" size="sm" onClick={start}>
                    Try again
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={close}>
                  Close
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * What the run produced.
 *
 * `partial_success` is the interesting case and gets its own headline: the run
 * completed and wrote real data, and some sources failed. Reporting it as
 * success would hide the second half; reporting it as failure would invite a
 * pointless retry that re-spends the source budget.
 */
function RunOutcome({ report, onClose }: { report: RunReport; onClose: () => void }) {
  const partial = report.status === "partial_success";
  const failed = report.status === "failed" || report.status === "blocked";

  return (
    <div aria-live="polite">
      <p className="flex items-center gap-2 text-body font-semibold text-primary">
        <Icon
          name={failed ? "alert-triangle" : partial ? "alert-circle" : "check-circle"}
          size={16}
          className={failed ? "text-danger" : partial ? "text-warning" : "text-brand"}
        />
        {failed ? "The run failed" : partial ? "Finished with gaps" : "Run complete"}
      </p>

      {report.reused ? (
        <p className="mt-2 text-caption leading-relaxed text-secondary">
          A run with the same key was already in progress, so this joined it rather than starting a
          second one.
        </p>
      ) : null}

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        {[
          ["Sources fetched", `${report.sourcesFetched} of ${report.sourcesDiscovered}`],
          ["Claims written", report.claimsWritten],
          ["Events found", report.eventsWritten],
          ["New companies", report.companiesDiscovered],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt className="text-caption text-tertiary">{label}</dt>
            <dd className="tabular text-body font-medium text-primary">{value}</dd>
          </div>
        ))}
      </dl>

      {partial ? (
        <p className="mt-3 rounded-control border border-warning/30 bg-warning-soft px-2.5 py-2 text-caption leading-relaxed text-primary">
          {report.sourcesSkipped} source{report.sourcesSkipped === 1 ? " was" : "s were"} skipped or
          failed. What was written is usable; the universe may be less current than it looks.
        </p>
      ) : null}

      {report.warnings.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-caption font-medium text-secondary">
            {report.warnings.length} warning{report.warnings.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {report.warnings.slice(0, 6).map((warning, index) => (
              <li
                key={`${index}-${warning.slice(0, 24)}`}
                className="rounded border border-border bg-surface-subtle px-2 py-1 text-caption leading-relaxed break-words text-secondary"
              >
                {warning}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="mt-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
