import type { TypedSupabaseClient } from "@/src/db/client";
import { RepositoryWriteError } from "@/src/db/repositories/result";
import type { ConfidenceLevel, ValueStatus } from "@/src/config/taxonomy";

/**
 * Company metric observations.
 *
 * A metric is a dated observation, not a current-state field, so the same
 * measure can be recorded for several periods without one overwriting another.
 *
 * The `unknown` / `not_applicable` statuses carry no number, enforced both here
 * and by a CHECK constraint on the table. This is the single most important
 * property of this table: a private company that has never published its revenue
 * must produce a row that says so, not a row that says zero.
 */

export interface InsertMetricInput {
  companyId: string;
  metricType: string;
  valueNumeric: number | null;
  valueUnit: string | null;
  currency?: string | null;
  valueStatus: ValueStatus;
  periodStart?: string | null;
  periodEnd?: string | null;
  asOfDate: string | null;
  /** The claim this observation came from, which carries the sources. */
  claimId: string | null;
  confidence?: ConfidenceLevel | null;
  agentRunId: string;
}

export async function insertMetric(
  client: TypedSupabaseClient,
  input: InsertMetricInput,
): Promise<string> {
  const hasValue = input.valueStatus === "disclosed" || input.valueStatus === "estimated";
  if (!hasValue && input.valueNumeric !== null) {
    throw new RepositoryWriteError(
      `metric ${input.metricType} is ${input.valueStatus} but carries a value; unknown is never a number`,
    );
  }

  const { data, error } = await client
    .from("company_metrics")
    .insert({
      company_id: input.companyId,
      metric_type: input.metricType,
      value_numeric: input.valueNumeric,
      value_unit: input.valueUnit,
      currency: input.currency ?? null,
      value_status: input.valueStatus,
      period_start: input.periodStart ?? null,
      period_end: input.periodEnd ?? null,
      as_of_date: input.asOfDate,
      claim_id: input.claimId,
      confidence: input.confidence ?? null,
      agent_run_id: input.agentRunId,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new RepositoryWriteError(
      `could not insert metric ${input.metricType}: ${error?.message ?? "no row returned"}`,
    );
  }
  return data.id;
}
