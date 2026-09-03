import type { TypedSupabaseClient } from "@/src/db/client";
import { toJson } from "@/src/db/json";
import { RepositoryWriteError } from "@/src/db/repositories/result";
import type { FundamentalArchetype } from "@/src/config/taxonomy";

/**
 * Fundamental and commercial analysis.
 *
 * Versioned per company rather than updated in place, so an earlier reading of a
 * company's economics survives a later one and the two can be compared.
 *
 * Each narrative field can cite the claims it rests on, through
 * `fundamental_analysis_claims`. That link is what lets the profile render a
 * judgement like "revenue quality is mixed" with a footnote instead of asking
 * the reader to take it on trust.
 */

export interface FundamentalClaimLink {
  claimId: string;
  /** The field this claim evidences: revenue_quality, growth, burn, ... */
  field: string;
}

export interface InsertFundamentalAnalysisInput {
  companyId: string;
  archetype: FundamentalArchetype;
  revenueQuality: string | null;
  growthAssessment: string | null;
  marginAssessment: string | null;
  burnRunway: string | null;
  concentration: string | null;
  derivedRatios?: Record<string, unknown>;
  /** Applicable things nobody established. Named, never dropped. */
  unknowns: string[];
  /** 0-1. Mechanically derived from the scoring inputs, not estimated. */
  evidenceCoverage: number | null;
  agentRunId: string;
  claimLinks: FundamentalClaimLink[];
}

export async function insertFundamentalAnalysis(
  client: TypedSupabaseClient,
  input: InsertFundamentalAnalysisInput,
): Promise<string> {
  // Versions are per company and monotonic, so the newest reading is
  // identifiable without relying on insertion timestamps.
  const { data: latest, error: latestError } = await client
    .from("fundamental_analyses")
    .select("version")
    .eq("company_id", input.companyId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    throw new RepositoryWriteError(
      `could not read fundamental analysis version: ${latestError.message}`,
    );
  }

  const nextVersion = (latest?.version ?? 0) + 1;

  const { data, error } = await client
    .from("fundamental_analyses")
    .insert({
      company_id: input.companyId,
      archetype: input.archetype,
      version: nextVersion,
      revenue_quality: input.revenueQuality,
      growth_assessment: input.growthAssessment,
      margin_assessment: input.marginAssessment,
      burn_runway: input.burnRunway,
      concentration: input.concentration,
      derived_ratios: toJson(input.derivedRatios ?? {}),
      unknowns: input.unknowns,
      evidence_coverage: input.evidenceCoverage,
      agent_run_id: input.agentRunId,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new RepositoryWriteError(
      `could not insert fundamental analysis: ${error?.message ?? "no row returned"}`,
    );
  }

  if (input.claimLinks.length > 0) {
    const { error: linkError } = await client.from("fundamental_analysis_claims").insert(
      input.claimLinks.map((link) => ({
        fundamental_analysis_id: data.id,
        claim_id: link.claimId,
        field: link.field,
      })),
    );
    if (linkError) {
      throw new RepositoryWriteError(
        `could not link claims to fundamental analysis: ${linkError.message}`,
      );
    }
  }

  return data.id;
}
