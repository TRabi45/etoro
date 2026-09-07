import { createPublicClient, type TypedSupabaseClient } from "@/src/db/client";
import { toJson } from "@/src/db/json";
import { getActiveScoringModelId } from "@/src/db/repositories/scoring-models";
import { RepositoryWriteError, type RepositoryResult } from "@/src/db/repositories/result";
import type { RecommendationState } from "@/src/config/taxonomy";
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
      // v0.3 has one global model, so a score is no longer filed under a path.
      path: null,
      // The exact inputs and everything derived from them, kept together so the
      // stored number can be re-derived without the pipeline that made it.
      input_snapshot: toJson({ input, breakdown: result.breakdown }),
      input_hash: result.inputHash,
      // With no penalties in the model, the normalised score *is* the final
      // score. Both columns are written so a reader who knows only one of them
      // still gets the right number.
      positive_normalized: result.normalizedScore,
      final_score: result.normalizedScore,
      lower_bound: result.lowerBound,
      upper_bound: result.upperBound,
      weighted_coverage: result.coverage,
      // NULL rather than zero. v0.3 has no risk or evidence penalty at all, and
      // section 30's rule applies to this table too: a concept that does not
      // exist is not the same as one measured at zero.
      risk_penalty: null,
      evidence_penalty: null,
      score_state: result.normalizedScore === null ? "research_only" : "scored",
      recommendation: result.recommendation,
      best_route: result.bestRoute,
      second_best_route: result.secondBestRoute,
      buy_beats_alternatives: result.buyBeatsAlternatives,
      gates: toJson(result.gates),
      blocking_gates: result.blockingGates,
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

/**
 * Every score ever written for a company, newest first.
 *
 * Used by the profile's activity timeline, where the question is not "what is
 * the score" but "when did it change and why". Rows written under a superseded
 * model are deliberately included: they are immutable historical records, and
 * the timeline is the one place where showing them is correct - the reader is
 * asking what happened, and "this was scored under v0.2 in August" is part of
 * the answer. Every row carries its own model version, so a superseded score is
 * never mistaken for the current one.
 */
export interface ScoreHistoryEntry {
  id: string;
  modelVersion: string;
  normalizedScore: number | null;
  coverage: number;
  recommendation: RecommendationState;
  blockingGates: string[];
  calculatedAt: string;
  /** True for the row that is currently the company's answer. */
  isCurrent: boolean;
}

export async function getScoreHistory(
  slug: string,
): Promise<RepositoryResult<ScoreHistoryEntry[]>> {
  const connection = createPublicClient();
  if (!connection.ok) {
    return { ok: false, problem: connection.problem };
  }

  const company = await connection.client
    .from("companies")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (company.error) {
    return { ok: false, problem: { kind: "database", message: company.error.message } };
  }
  if (!company.data) {
    return { ok: true, data: [] };
  }

  const activeModel = await getActiveScoringModelId(connection.client);
  if (!activeModel.ok) {
    return { ok: false, problem: activeModel.problem };
  }

  const { data, error } = await connection.client
    .from("scores")
    .select(
      "id, model_version, positive_normalized, weighted_coverage, recommendation, blocking_gates, calculated_at, scoring_model_id",
    )
    .eq("company_id", company.data.id)
    .order("calculated_at", { ascending: false });

  if (error) {
    return { ok: false, problem: { kind: "database", message: error.message } };
  }

  type Row = {
    id: string;
    model_version: string;
    positive_normalized: number | null;
    weighted_coverage: number;
    recommendation: RecommendationState;
    blocking_gates: string[] | null;
    calculated_at: string;
    scoring_model_id: string;
  };

  // Only the newest row from the active model is "current"; everything else is
  // history, including a newer row written under a model that is no longer in
  // force.
  let seenCurrent = false;
  const entries = ((data ?? []) as Row[]).map((row) => {
    const fromActiveModel = row.scoring_model_id === activeModel.data;
    const isCurrent = fromActiveModel && !seenCurrent;
    if (isCurrent) {
      seenCurrent = true;
    }
    return {
      id: row.id,
      modelVersion: row.model_version,
      normalizedScore: row.positive_normalized,
      coverage: row.weighted_coverage,
      recommendation: row.recommendation,
      blockingGates: row.blocking_gates ?? [],
      calculatedAt: row.calculated_at,
      isCurrent,
    };
  });

  return { ok: true, data: entries };
}
