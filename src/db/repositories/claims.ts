import type { TypedSupabaseClient } from "@/src/db/client";
import { RepositoryWriteError } from "@/src/db/repositories/result";
import type {
  ClaimKind,
  ClaimSourceRelation,
  ConfidenceLevel,
  ValueStatus,
  VerificationStatus,
} from "@/src/config/taxonomy";

/**
 * Claim persistence.
 *
 * This module is where the project's central evidence rule is actually enforced:
 * a claim cannot exist in the database without at least one source behind it.
 * The check lives here, at the repository boundary, rather than in the caller,
 * because "every fact is traceable" is only true if there is no way to write an
 * untraceable one - and a future pipeline, a future script and a future test all
 * go through this function.
 *
 * A claim and its source links are written together, and the links are inserted
 * first-fails-loudly: if linking fails, the orphaned claim is removed rather
 * than left behind as a fact with no evidence.
 */

export interface ClaimSourceLinkInput {
  sourceId: string;
  /** Support and contradiction are both recorded; neither is inferred. */
  relation: ClaimSourceRelation;
  excerpt: string | null;
}

export interface InsertClaimInput {
  companyId: string;
  subject: string;
  predicate: string;
  valueText?: string | null;
  valueNumeric?: number | null;
  valueUnit?: string | null;
  valueCurrency?: string | null;
  /** `unknown` and `not_applicable` must carry no number. */
  valueStatus: ValueStatus;
  /** The date the fact is true for, not the date it was published. */
  asOfDate: string | null;
  claimKind: ClaimKind;
  /** Extraction confidence, stored separately from source trust. */
  aiConfidence?: ConfidenceLevel | null;
  verificationStatus?: VerificationStatus;
  /**
   * Claims that disagree share a conflict group. They are never merged and the
   * later one never overwrites the earlier one.
   */
  conflictGroup?: string | null;
  unknownReason?: string | null;
  agentRunId: string;
  sources: ClaimSourceLinkInput[];
}

export async function insertClaim(
  client: TypedSupabaseClient,
  input: InsertClaimInput,
): Promise<string> {
  if (input.sources.length === 0) {
    throw new RepositoryWriteError(
      `claim "${input.subject} / ${input.predicate}" has no source: a claim must cite at least one source`,
    );
  }

  const { data, error } = await client
    .from("claims")
    .insert({
      company_id: input.companyId,
      subject: input.subject,
      predicate: input.predicate,
      value_text: input.valueText ?? null,
      value_numeric: input.valueNumeric ?? null,
      value_unit: input.valueUnit ?? null,
      value_currency: input.valueCurrency ?? null,
      value_status: input.valueStatus,
      as_of_date: input.asOfDate,
      claim_kind: input.claimKind,
      ai_confidence: input.aiConfidence ?? null,
      verification_status: input.verificationStatus ?? "unverified",
      conflict_group: input.conflictGroup ?? null,
      unknown_reason: input.unknownReason ?? null,
      agent_run_id: input.agentRunId,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new RepositoryWriteError(
      `could not insert claim "${input.predicate}": ${error?.message ?? "no row returned"}`,
    );
  }

  const claimId = data.id;
  const { error: linkError } = await client.from("claim_sources").insert(
    input.sources.map((source) => ({
      claim_id: claimId,
      source_id: source.sourceId,
      relation: source.relation,
      excerpt: source.excerpt,
    })),
  );

  if (linkError) {
    // Do not leave a claim standing with no evidence behind it.
    await client.from("claims").delete().eq("id", claimId);
    throw new RepositoryWriteError(
      `could not link sources to claim "${input.predicate}", claim rolled back: ${linkError.message}`,
    );
  }

  return claimId;
}
