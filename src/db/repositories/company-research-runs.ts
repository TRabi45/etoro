import type { TypedSupabaseClient } from "@/src/db/client";
import { RepositoryWriteError } from "@/src/db/repositories/result";
import type { RunTrigger } from "@/src/db/repositories/monitoring-runs";

/**
 * Company-research run records.
 *
 * The idempotency unit for `researchCompany` (workstream D): one row per
 * attempt, created-or-reused by a unique key exactly the way
 * `monitoring_runs` already proves out for the feed loop. A retried trigger -
 * a double-click, a redelivered webhook, an overlapping scheduled and manual
 * call - reuses the existing run rather than starting a second one.
 */

export type CompanyResearchRunStatus =
  "running" | "success" | "partial_success" | "blocked" | "failed";

export interface CompanyResearchRunSummary {
  id: string;
  companyId: string;
  trigger: RunTrigger;
  status: CompanyResearchRunStatus;
  startedAt: string;
  finishedAt: string | null;
  sourcesPlanned: number;
  sourcesFetched: number;
  claimsWritten: number;
  warnings: string[];
  errorSummary: string | null;
}

export interface StartCompanyResearchRunResult {
  runId: string;
  reused: boolean;
}

export async function startCompanyResearchRun(
  client: TypedSupabaseClient,
  companyId: string,
  trigger: RunTrigger,
  idempotencyKey: string,
): Promise<StartCompanyResearchRunResult> {
  // A plain insert, so the unique index on idempotency_key decides the
  // outcome - the same pattern `startMonitoringRun` uses, and for the same
  // reason: whether this call created the run is a fact the database reports,
  // not something inferred from how recent `started_at` looks.
  const inserted = await client
    .from("company_research_runs")
    .insert({ company_id: companyId, trigger, idempotency_key: idempotencyKey, status: "running" })
    .select("id")
    .maybeSingle();

  if (!inserted.error && inserted.data) {
    return { runId: inserted.data.id, reused: false };
  }

  if (inserted.error && inserted.error.code !== "23505") {
    throw new RepositoryWriteError(
      `could not start company research run: ${inserted.error.message}`,
    );
  }

  const existing = await client
    .from("company_research_runs")
    .select("id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing.error || !existing.data) {
    throw new RepositoryWriteError(
      `could not read the existing company research run: ${existing.error?.message ?? "no row"}`,
    );
  }

  return { runId: existing.data.id, reused: true };
}

export interface FinishCompanyResearchRunArgs {
  status: CompanyResearchRunStatus;
  sourcesPlanned: number;
  sourcesFetched: number;
  claimsWritten: number;
  warnings: string[];
  errorSummary?: string | null;
}

export async function finishCompanyResearchRun(
  client: TypedSupabaseClient,
  runId: string,
  args: FinishCompanyResearchRunArgs,
): Promise<void> {
  const { error } = await client
    .from("company_research_runs")
    .update({
      status: args.status,
      finished_at: new Date().toISOString(),
      sources_planned: args.sourcesPlanned,
      sources_fetched: args.sourcesFetched,
      claims_written: args.claimsWritten,
      warnings: args.warnings,
      error_summary: args.errorSummary ?? null,
    })
    .eq("id", runId);

  if (error) {
    throw new RepositoryWriteError(`could not finish company research run: ${error.message}`);
  }
}

/** Reads a run back, so reusing an idempotency key can report the truth instead of fabricating one. */
export async function getCompanyResearchRunById(
  client: TypedSupabaseClient,
  runId: string,
): Promise<CompanyResearchRunSummary> {
  const { data, error } = await client
    .from("company_research_runs")
    .select(
      "id, company_id, trigger, status, started_at, finished_at, sources_planned, sources_fetched, claims_written, warnings, error_summary",
    )
    .eq("id", runId)
    .maybeSingle();

  if (error || !data) {
    throw new RepositoryWriteError(
      `could not read company research run ${runId}: ${error?.message ?? "no row"}`,
    );
  }

  return {
    id: data.id,
    companyId: data.company_id,
    trigger: data.trigger,
    status: data.status,
    startedAt: data.started_at,
    finishedAt: data.finished_at,
    sourcesPlanned: data.sources_planned,
    sourcesFetched: data.sources_fetched,
    claimsWritten: data.claims_written,
    warnings: data.warnings ?? [],
    errorSummary: data.error_summary,
  };
}
