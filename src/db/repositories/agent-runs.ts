import type { TypedSupabaseClient } from "@/src/db/client";
import { RepositoryWriteError } from "@/src/db/repositories/result";

/**
 * Agent-run provenance.
 *
 * Every runtime record the pipeline writes points back to one of these rows, so
 * any fact in the database can be traced to the run that produced it, the
 * prompt version behind it, and - once there is one - the model that generated
 * it. Without this the database could not distinguish something the agent
 * derived from something a human seeded.
 */

export interface StartAgentRunInput {
  purpose: string;
  promptVersion?: string | null;
  /**
   * Left null while there is no LLM in the pipeline. It is recorded per run
   * rather than hard-coded anywhere, so swapping models never means editing
   * application code.
   */
  modelName?: string | null;
  monitoringRunId?: string | null;
}

export async function startAgentRun(
  client: TypedSupabaseClient,
  input: StartAgentRunInput,
): Promise<string> {
  const { data, error } = await client
    .from("agent_runs")
    .insert({
      purpose: input.purpose,
      prompt_version: input.promptVersion ?? null,
      model_name: input.modelName ?? null,
      monitoring_run_id: input.monitoringRunId ?? null,
      status: "running",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new RepositoryWriteError(
      `could not start agent run: ${error?.message ?? "no row returned"}`,
    );
  }
  return data.id;
}

export async function finishAgentRun(
  client: TypedSupabaseClient,
  agentRunId: string,
  status: "success" | "partial_success" | "failed",
  errorClass?: string,
): Promise<void> {
  const { error } = await client
    .from("agent_runs")
    .update({ status, error_class: errorClass ?? null })
    .eq("id", agentRunId);

  if (error) {
    throw new RepositoryWriteError(`could not finish agent run: ${error.message}`);
  }
}
