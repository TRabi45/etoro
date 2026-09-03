import type { TypedSupabaseClient } from "@/src/db/client";
import { toJson } from "@/src/db/json";
import { RepositoryWriteError } from "@/src/db/repositories/result";
import type { ScoringInput, ScoringResult } from "@/src/domain/scoring/types";

/**
 * Score persistence.
 *
 * A score row stores the model version, the validated input snapshot and the
 * hash of those inputs, so any published number can be recomputed and audited
 * later. Writing a row also locks the configuration that produced it, via a
 * database trigger.
 *
 * Re-running the pipeline with unchanged inputs is not a new score: the unique
 * index on (company, model, input hash) makes that a no-op rather than a
 * duplicate, which keeps the score history meaningful instead of counting how
 * many times the pipeline happened to run.
 */

export interface InsertScoreInput {
  companyId: string;
  scoringModelId: string;
  input: ScoringInput;
  result: ScoringResult;
  agentRunId: string;
}

export async function insertScore(
  client: TypedSupabaseClient,
  { companyId, scoringModelId, input, result, agentRunId }: InsertScoreInput,
): Promise<{ scoreId: string; created: boolean }> {
  const existing = await client
    .from("scores")
    .select("id")
    .eq("company_id", companyId)
    .eq("scoring_model_id", scoringModelId)
    .eq("input_hash", result.inputHash)
    .maybeSingle();

  if (existing.error) {
    throw new RepositoryWriteError(`could not read existing score: ${existing.error.message}`);
  }
  if (existing.data) {
    return { scoreId: existing.data.id, created: false };
  }

  const { data, error } = await client
    .from("scores")
    .insert({
      company_id: companyId,
      scoring_model_id: scoringModelId,
      model_version: result.modelVersion,
      path: result.path,
      // The exact inputs and the breakdown they produced, kept together so the
      // stored number can be re-derived without the pipeline that made it.
      input_snapshot: toJson({
        input,
        breakdown: result.breakdown,
        acquireBlockers: result.acquireBlockers,
        triggeredPermanentGates: result.triggeredPermanentGates,
        unresolvedCriticalGates: result.unresolvedCriticalGates,
        subtype: result.subtype,
      }),
      input_hash: result.inputHash,
      positive_normalized: result.positiveNormalized,
      risk_penalty: result.riskPenalty,
      evidence_penalty: result.evidencePenalty,
      weighted_coverage: result.weightedCoverage,
      final_score: result.finalScore,
      score_state: result.scoreState,
      recommendation: result.recommendation,
      agent_run_id: agentRunId,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new RepositoryWriteError(
      `could not insert score: ${error?.message ?? "no row returned"}`,
    );
  }
  return { scoreId: data.id, created: true };
}
