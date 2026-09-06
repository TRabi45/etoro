import type { TypedSupabaseClient } from "@/src/db/client";
import { RepositoryWriteError } from "@/src/db/repositories/result";
import type { ConfidenceLevel } from "@/src/config/taxonomy";
import type { ResearchTier, TierDecision } from "@/src/domain/tiering/tier-policy";

/**
 * Research tier and refresh-schedule persistence.
 *
 * Two invariants matter more than the shape of the data:
 *
 * 1. Re-running unchanged inputs must not create a false transition. The tier
 *    policy is pure (`decideResearchTier`), so the only way to honour this is
 *    to compare its answer to what is already stored and write history only
 *    on an actual change - never on every call.
 * 2. Every transition records why, in the screen's own vocabulary, so a
 *    reader asking "why is this company deep" does not have to trust a
 *    comment in the code that computed it.
 */

export type ResearchState = "pending" | "running" | "complete" | "partial" | "blocked" | "failed";

export interface CompanyTierState {
  researchTier: ResearchTier;
  researchTierReason: string | null;
  researchTierConfidence: ConfidenceLevel | null;
  researchState: ResearchState;
  lastResearchedAt: string | null;
  nextRefreshAt: string | null;
  lastMaterialChangeAt: string | null;
}

export async function getCompanyTierState(
  client: TypedSupabaseClient,
  companyId: string,
): Promise<CompanyTierState> {
  const { data, error } = await client
    .from("companies")
    .select(
      "research_tier, research_tier_reason, research_tier_confidence, research_state, last_researched_at, next_refresh_at, last_material_change_at",
    )
    .eq("id", companyId)
    .single();

  if (error || !data) {
    throw new RepositoryWriteError(
      `could not read tier state for company ${companyId}: ${error?.message ?? "no row"}`,
    );
  }

  return {
    researchTier: data.research_tier,
    researchTierReason: data.research_tier_reason,
    researchTierConfidence: data.research_tier_confidence,
    researchState: data.research_state,
    lastResearchedAt: data.last_researched_at,
    nextRefreshAt: data.next_refresh_at,
    lastMaterialChangeAt: data.last_material_change_at,
  };
}

export interface ApplyTierDecisionInput {
  companyId: string;
  decision: TierDecision;
  confidence: ConfidenceLevel | null;
  /** The company_research_runs row that made this decision, for the transition's own provenance. */
  researchRunId: string;
}

export interface ApplyTierDecisionResult {
  tier: ResearchTier;
  /** False when the decision matched the stored tier and nothing was written. */
  changed: boolean;
}

/**
 * Applies a tier decision, writing a transition row only if the tier itself
 * changed. The reason and confidence are refreshed on the company row either
 * way, since "why" can usefully be re-stated even when the verdict is
 * unchanged - but that is an update, not a new row in the append-only history.
 */
export async function applyTierDecision(
  client: TypedSupabaseClient,
  input: ApplyTierDecisionInput,
): Promise<ApplyTierDecisionResult> {
  const current = await getCompanyTierState(client, input.companyId);
  const changed = current.researchTier !== input.decision.tier;

  const { error: updateError } = await client
    .from("companies")
    .update({
      research_tier: input.decision.tier,
      research_tier_reason: input.decision.reason,
      research_tier_confidence: input.confidence,
      tier_changed_by_run_id: input.researchRunId,
    })
    .eq("id", input.companyId);

  if (updateError) {
    throw new RepositoryWriteError(
      `could not update tier for company ${input.companyId}: ${updateError.message}`,
    );
  }

  if (changed) {
    const { error: historyError } = await client.from("company_tier_transitions").insert({
      company_id: input.companyId,
      from_tier: current.researchTier,
      to_tier: input.decision.tier,
      reason: input.decision.reason,
      confidence: input.confidence,
      research_run_id: input.researchRunId,
    });

    if (historyError) {
      throw new RepositoryWriteError(
        `could not record tier transition for company ${input.companyId}: ${historyError.message}`,
      );
    }
  }

  return { tier: input.decision.tier, changed };
}

export interface ApplyRefreshScheduleInput {
  companyId: string;
  nextRefreshAt: string;
  researchState: ResearchState;
  /** Set when a research pass just completed, successfully or not. */
  lastResearchedAt?: string;
  /** Set when this update is itself the reaction to a material event. */
  lastMaterialChangeAt?: string;
}

export async function applyRefreshSchedule(
  client: TypedSupabaseClient,
  input: ApplyRefreshScheduleInput,
): Promise<void> {
  const { error } = await client
    .from("companies")
    .update({
      next_refresh_at: input.nextRefreshAt,
      research_state: input.researchState,
      ...(input.lastResearchedAt !== undefined
        ? { last_researched_at: input.lastResearchedAt }
        : {}),
      ...(input.lastMaterialChangeAt !== undefined
        ? { last_material_change_at: input.lastMaterialChangeAt }
        : {}),
    })
    .eq("id", input.companyId);

  if (error) {
    throw new RepositoryWriteError(
      `could not update refresh schedule for company ${input.companyId}: ${error.message}`,
    );
  }
}

/** Deep before monitored before indexed. Enum text order does not match this, so ranking is done here rather than in SQL. */
const TIER_PRIORITY: Record<ResearchTier, number> = { deep: 0, monitored: 1, indexed: 2 };

/**
 * The most eligible companies for automated research: `next_refresh_at` has
 * arrived or was never set, ranked deep-first and then by how overdue they
 * are.
 *
 * Fetches a bounded working set rather than the true full match count -
 * `WORKING_SET_SIZE` candidates is enough to rank correctly in practice
 * without a full-table scan as the universe grows, and this function only
 * ever backs "pick a handful," never a paginated listing.
 */
const WORKING_SET_SIZE = 200;

export async function listCompaniesDueForRefresh(
  client: TypedSupabaseClient,
  now: string,
  limit: number,
): Promise<{ id: string; slug: string; researchTier: ResearchTier }[]> {
  const { data, error } = await client
    .from("companies")
    .select("id, slug, research_tier, next_refresh_at")
    .not("lifecycle_status", "in", "(screened_out,precedent)")
    .or(`next_refresh_at.is.null,next_refresh_at.lte.${now}`)
    .order("next_refresh_at", { ascending: true, nullsFirst: true })
    .limit(WORKING_SET_SIZE);

  if (error) {
    throw new RepositoryWriteError(`could not list companies due for refresh: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => ({ id: row.id, slug: row.slug, researchTier: row.research_tier }))
    .sort((left, right) => TIER_PRIORITY[left.researchTier] - TIER_PRIORITY[right.researchTier])
    .slice(0, limit);
}
