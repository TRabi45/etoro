"use client";

import { useCallback, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  classifyFailure,
  unreachableFailure,
  type ActionRefusal,
} from "@/components/shell/bounded-action";

/**
 * The profile's bounded refresh.
 *
 * Same contract as the global run control, for the same reason: this spends a
 * source budget and a model call, so the scope is stated before it starts and
 * the outcome is whatever the backend actually reports.
 *
 * The case that matters most here is `scored: false`. A pass can gather real
 * evidence and still not produce a score, because the entity gate has not been
 * cleared - and reporting that as a failure would be wrong twice over: work
 * happened, and the reason nothing was scored is a finding about identity
 * rather than a fault in the run.
 */

interface RefreshReport {
  runId: string;
  reused: boolean;
  companySlug: string;
  status: string;
  sourcesPlanned: number;
  sourcesFetched: number;
  claimsWritten: number;
  scored: boolean;
  tier: string;
  nextRefreshAt: string;
  warnings: string[];
}

type Phase =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "running" }
  | { kind: "done"; report: RefreshReport }
  | ({ kind: "refused" } & ActionRefusal);

export function RefreshCompany({ slug, name }: { slug: string; name: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const panelId = useId();
  const router = useRouter();

  const close = useCallback(() => setPhase({ kind: "idle" }), []);

  const start = useCallback(async () => {
    setPhase({ kind: "running" });
    try {
      const response = await fetch(`/api/companies/${slug}/refresh`, { method: "POST" });

      if (!response.ok) {
        // Shared with the global run control: the reason a bounded action was
        // refused decides whether a retry is honest, and an unconfigured
        // operator secret returns 503 rather than a 4xx.
        const body = (await response.json().catch(() => null)) as {
          error?: { code?: string; message?: string };
        } | null;
        setPhase({ kind: "refused", ...classifyFailure(response, body, "refresh") });
        return;
      }

      const report = (await response.json()) as RefreshReport;
      setPhase({ kind: "done", report });
      router.refresh();
    } catch {
      setPhase({ kind: "refused", ...unreachableFailure("refresh") });
    }
  }, [slug, router]);

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
      >
        {phase.kind === "running" ? "Researching…" : "Refresh"}
      </Button>

      {phase.kind === "idle" ? null : (
        <div
          id={panelId}
          role="dialog"
          aria-label={`Refresh ${name}`}
          className="absolute right-0 top-[calc(100%+8px)] z-40 w-80 rounded-card border border-border bg-surface p-4 text-left shadow-[var(--shadow-menu)]"
        >
          {phase.kind === "confirming" ? (
            <>
              <p className="text-body font-semibold text-primary">Refresh {name}?</p>
              <ul className="mt-2 flex flex-col gap-1 text-caption leading-relaxed text-secondary">
                <li>Builds a source plan and fetches within a bounded budget.</li>
                <li>Extracts claims, then re-scores if the entity gate is clear.</li>
                <li>Once per company per day - a second run today joins the first.</li>
              </ul>
              <div className="mt-3 flex gap-2">
                <Button variant="primary" size="sm" onClick={start}>
                  Start research
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
                Checking recent filings
              </p>
              <p className="mt-2 text-caption leading-relaxed text-secondary">
                Fetching planned sources and extracting claims. This panel will report what the pass
                actually produced.
              </p>
            </div>
          ) : null}

          {phase.kind === "done" ? (
            <div aria-live="polite">
              <p className="flex items-center gap-2 text-body font-semibold text-primary">
                <Icon
                  name={phase.report.scored ? "check-circle" : "alert-circle"}
                  size={16}
                  className={phase.report.scored ? "text-brand" : "text-warning"}
                />
                {phase.report.reused ? "Joined today's pass" : "Research complete"}
              </p>

              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                {[
                  [
                    "Sources fetched",
                    `${phase.report.sourcesFetched} of ${phase.report.sourcesPlanned}`,
                  ],
                  ["Claims written", phase.report.claimsWritten],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <dt className="text-caption text-tertiary">{label}</dt>
                    <dd className="tabular text-body font-medium text-primary">{value}</dd>
                  </div>
                ))}
              </dl>

              {!phase.report.scored ? (
                <p className="mt-3 rounded-control border border-warning/30 bg-warning-soft px-2.5 py-2 text-caption leading-relaxed text-primary">
                  Evidence was gathered but nothing was scored. That means the entity gate is not
                  clear - identity has to be resolved before scoring, which is a finding about this
                  company rather than a failure of the run.
                </p>
              ) : null}

              {phase.report.warnings.length > 0 ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-caption font-medium text-secondary">
                    {phase.report.warnings.length} warning
                    {phase.report.warnings.length === 1 ? "" : "s"}
                  </summary>
                  <ul className="mt-2 flex flex-col gap-1">
                    {phase.report.warnings.slice(0, 6).map((warning, index) => (
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
                <Button variant="ghost" size="sm" onClick={close}>
                  Close
                </Button>
              </div>
            </div>
          ) : null}

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
