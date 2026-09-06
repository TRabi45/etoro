import { createPublicClient, type TypedSupabaseClient } from "@/src/db/client";
import type { RepositoryResult } from "@/src/db/repositories/result";
import { RepositoryWriteError } from "@/src/db/repositories/result";

/**
 * Monitoring run records.
 *
 * A run is the unit of observability for the pipeline: it says when the system
 * last looked at the world, how much it managed to read, and what went wrong.
 * The dashboard shows it because a monitoring system that fails silently is
 * worse than one that does not run - it looks the same as one that found
 * nothing.
 */

export type RunTrigger = "scheduled" | "manual" | "bootstrap";
/**
 * `blocked` was added for the company-research orchestrator (workstream D) -
 * a monitoring pass never blocks the way one company's unresolved entity or
 * hard gate does - but both tables share the one `run_status` enum, so the
 * type here has to cover every value the column can hold.
 */
export type RunStatus = "running" | "success" | "partial_success" | "blocked" | "failed";

export interface MonitoringRunSummary {
  id: string;
  trigger: RunTrigger;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  sourcesDiscovered: number;
  sourcesFetched: number;
  sourcesSkipped: number;
  claimsWritten: number;
  eventsWritten: number;
  companiesDiscovered: number;
  warnings: string[];
  errorSummary: string | null;
}

export interface StartRunResult {
  runId: string;
  /** True when this key already had a run, so nothing new was started. */
  reused: boolean;
}

/**
 * Creates a run, or returns the existing one for the same idempotency key.
 *
 * Overlapping triggers are expected rather than exceptional: a scheduled run can
 * fire while a manual one is still going, and a retried workflow step will use
 * the same key. Reusing the run is what stops the same day's monitoring being
 * recorded twice with half the sources in each.
 */
export async function startMonitoringRun(
  client: TypedSupabaseClient,
  trigger: RunTrigger,
  idempotencyKey: string,
): Promise<StartRunResult> {
  // A plain insert, so the unique index on `idempotency_key` decides the
  // outcome. Whether this call created the run is then a fact reported by the
  // database rather than something inferred afterwards - an earlier version
  // guessed from how recent `started_at` was, which quietly reported a second
  // trigger as a fresh run whenever the two arrived within a couple of seconds,
  // which is exactly when overlap actually happens.
  const inserted = await client
    .from("monitoring_runs")
    .insert({ trigger, idempotency_key: idempotencyKey, status: "running" })
    .select("id")
    .maybeSingle();

  if (!inserted.error && inserted.data) {
    return { runId: inserted.data.id, reused: false };
  }

  // 23505 is a unique violation: another trigger owns this key.
  if (inserted.error && inserted.error.code !== "23505") {
    throw new RepositoryWriteError(`could not start monitoring run: ${inserted.error.message}`);
  }

  const existing = await client
    .from("monitoring_runs")
    .select("id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing.error || !existing.data) {
    throw new RepositoryWriteError(
      `could not read the existing monitoring run: ${existing.error?.message ?? "no row"}`,
    );
  }

  return { runId: existing.data.id, reused: true };
}

export interface FinishRunArgs {
  status: RunStatus;
  sourcesDiscovered: number;
  sourcesFetched: number;
  sourcesSkipped: number;
  claimsWritten: number;
  eventsWritten: number;
  companiesDiscovered: number;
  warnings: string[];
  errorSummary?: string | null;
}

export async function finishMonitoringRun(
  client: TypedSupabaseClient,
  runId: string,
  args: FinishRunArgs,
): Promise<void> {
  const { error } = await client
    .from("monitoring_runs")
    .update({
      status: args.status,
      finished_at: new Date().toISOString(),
      sources_discovered: args.sourcesDiscovered,
      sources_fetched: args.sourcesFetched,
      sources_skipped: args.sourcesSkipped,
      claims_written: args.claimsWritten,
      events_written: args.eventsWritten,
      companies_discovered: args.companiesDiscovered,
      // Warnings are stored in full rather than counted. "3 warnings" tells an
      // operator nothing they can act on.
      warnings: args.warnings,
      error_summary: args.errorSummary ?? null,
    })
    .eq("id", runId);

  if (error) {
    throw new RepositoryWriteError(`could not finish monitoring run: ${error.message}`);
  }
}

/**
 * Reads back one run's persisted state.
 *
 * Exists so that reusing an idempotency key can report what the original run
 * actually did - status, real counters, real warnings - instead of a fresh
 * caller manufacturing a `success` with every counter at zero for a run it did
 * not perform.
 */
export async function getMonitoringRunById(
  client: TypedSupabaseClient,
  runId: string,
): Promise<MonitoringRunSummary> {
  const { data, error } = await client
    .from("monitoring_runs")
    .select(
      "id, trigger, status, started_at, finished_at, sources_discovered, sources_fetched, sources_skipped, claims_written, events_written, companies_discovered, warnings, error_summary",
    )
    .eq("id", runId)
    .maybeSingle();

  if (error || !data) {
    throw new RepositoryWriteError(
      `could not read monitoring run ${runId}: ${error?.message ?? "no row"}`,
    );
  }

  return {
    id: data.id,
    trigger: data.trigger,
    status: data.status,
    startedAt: data.started_at,
    finishedAt: data.finished_at,
    sourcesDiscovered: data.sources_discovered,
    sourcesFetched: data.sources_fetched,
    sourcesSkipped: data.sources_skipped,
    claimsWritten: data.claims_written,
    eventsWritten: data.events_written,
    companiesDiscovered: data.companies_discovered,
    warnings: data.warnings ?? [],
    errorSummary: data.error_summary,
  };
}

/** The most recent runs, for the dashboard's freshness indicator. */
export async function getRecentRuns(limit = 5): Promise<RepositoryResult<MonitoringRunSummary[]>> {
  const connection = createPublicClient();
  if (!connection.ok) {
    return { ok: false, problem: connection.problem };
  }

  const { data, error } = await connection.client
    .from("monitoring_runs")
    .select(
      "id, trigger, status, started_at, finished_at, sources_discovered, sources_fetched, sources_skipped, claims_written, events_written, companies_discovered, warnings, error_summary",
    )
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) {
    return {
      ok: false,
      problem: { kind: "database", message: `could not read monitoring runs: ${error.message}` },
    };
  }

  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      id: row.id,
      trigger: row.trigger,
      status: row.status,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      sourcesDiscovered: row.sources_discovered,
      sourcesFetched: row.sources_fetched,
      sourcesSkipped: row.sources_skipped,
      claimsWritten: row.claims_written,
      eventsWritten: row.events_written,
      companiesDiscovered: row.companies_discovered,
      warnings: row.warnings ?? [],
      errorSummary: row.error_summary,
    })),
  };
}
