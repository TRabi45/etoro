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
export type RunStatus = "running" | "success" | "partial_success" | "failed";

export interface MonitoringRunSummary {
  id: string;
  trigger: RunTrigger;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  sourcesDiscovered: number;
  sourcesFetched: number;
  claimsWritten: number;
  eventsWritten: number;
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
  claimsWritten: number;
  eventsWritten: number;
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
      claims_written: args.claimsWritten,
      events_written: args.eventsWritten,
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

/** The most recent runs, for the dashboard's freshness indicator. */
export async function getRecentRuns(limit = 5): Promise<RepositoryResult<MonitoringRunSummary[]>> {
  const connection = createPublicClient();
  if (!connection.ok) {
    return { ok: false, problem: connection.problem };
  }

  const { data, error } = await connection.client
    .from("monitoring_runs")
    .select(
      "id, trigger, status, started_at, finished_at, sources_discovered, sources_fetched, claims_written, events_written, warnings, error_summary",
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
      claimsWritten: row.claims_written,
      eventsWritten: row.events_written,
      warnings: row.warnings ?? [],
      errorSummary: row.error_summary,
    })),
  };
}
