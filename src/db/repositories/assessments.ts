import type { TypedSupabaseClient } from "@/src/db/client";
import { toJson } from "@/src/db/json";
import { RepositoryWriteError } from "@/src/db/repositories/result";
import type { TargetPath } from "@/src/config/taxonomy";

/**
 * Strategic assessment.
 *
 * The assessment is the system's own reasoning: fit, gap closed, why now,
 * synergies, risks, counter-thesis and remaining unknowns. It is explicitly
 * *not* evidence - it is a judgement built on evidence, which is why every
 * conclusion is linked to the claims behind it through `assessment_claims`.
 *
 * `routeAssessment` records how acquisition compares with build, partner, invest
 * and monitor. The scoring engine reads it to decide whether Acquire is even
 * eligible, so the comparison is a stored input rather than an afterthought
 * written once a score already exists.
 */

export interface AssessmentClaimLink {
  claimId: string;
  /** Which conclusion this claim supports: why_now, risks, synergies, ... */
  role: string;
}

export interface InsertAssessmentInput {
  companyId: string;
  thesisVersion: string;
  path: TargetPath;
  strategicFitSummary: string | null;
  gapClosed: string | null;
  whyNow: string | null;
  synergies: string | null;
  risks: string | null;
  /** The strongest argument against the thesis, kept on the record. */
  counterThesis: string | null;
  unknowns: string[];
  routeAssessment: Record<string, unknown>;
  agentRunId: string;
  claimLinks: AssessmentClaimLink[];
}

export async function insertAssessment(
  client: TypedSupabaseClient,
  input: InsertAssessmentInput,
): Promise<string> {
  const { data, error } = await client
    .from("assessments")
    .insert({
      company_id: input.companyId,
      thesis_version: input.thesisVersion,
      path: input.path,
      strategic_fit_summary: input.strategicFitSummary,
      gap_closed: input.gapClosed,
      why_now: input.whyNow,
      synergies: input.synergies,
      risks: input.risks,
      counter_thesis: input.counterThesis,
      unknowns: input.unknowns,
      route_assessment: toJson(input.routeAssessment),
      agent_run_id: input.agentRunId,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new RepositoryWriteError(
      `could not insert assessment: ${error?.message ?? "no row returned"}`,
    );
  }

  if (input.claimLinks.length > 0) {
    const { error: linkError } = await client.from("assessment_claims").insert(
      input.claimLinks.map((link) => ({
        assessment_id: data.id,
        claim_id: link.claimId,
        role: link.role,
      })),
    );
    if (linkError) {
      throw new RepositoryWriteError(`could not link claims to assessment: ${linkError.message}`);
    }
  }

  return data.id;
}
