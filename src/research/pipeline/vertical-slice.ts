import type { TypedSupabaseClient } from "@/src/db/client";
import { finishAgentRun, startAgentRun } from "@/src/db/repositories/agent-runs";
import { insertAssessment } from "@/src/db/repositories/assessments";
import { insertClaim } from "@/src/db/repositories/claims";
import { insertFundamentalAnalysis } from "@/src/db/repositories/fundamentals";
import { insertMetric } from "@/src/db/repositories/metrics";
import { RepositoryWriteError } from "@/src/db/repositories/result";
import { insertScore } from "@/src/db/repositories/scores";
import { ensureScoringModel } from "@/src/db/repositories/scoring-models";
import { upsertSource } from "@/src/db/repositories/sources";
import {
  SCORING_MODEL_GOVERNANCE,
  SCORING_POLICY_V0_3,
  THESIS_MODEL_V0_3,
} from "@/src/config/scoring/v0-3";
import { scoreTarget } from "@/src/domain/scoring/engine";
import type { ScoringResult } from "@/src/domain/scoring/types";
import {
  extractionPayloadSchema,
  type ExtractionPayload,
} from "@/src/research/pipeline/extraction-payload";

/**
 * The evidence-backed vertical slice.
 *
 * This is the real pipeline: validate a structured payload, write the evidence
 * tree, then compute the score deterministically from the recorded inputs and
 * persist it with the model version and input hash.
 *
 * What produces the payload is deliberately not this module's concern. Today a
 * hand-written stub satisfies the contract; from Milestone 3 the Claude adapter
 * will. Either way the numbers are computed here, by code, from validated
 * inputs - a model may propose what the inputs are, but it never produces the
 * score.
 *
 * Ordering matters and is not arbitrary:
 *   1. score first (pure, no I/O), so a payload that cannot be scored fails
 *      before anything is written;
 *   2. sources, then claims, so no claim is ever written without its evidence;
 *   3. fundamentals carry the coverage the engine actually calculated, rather
 *      than a separately-guessed number that could contradict the score.
 */

export interface VerticalSliceSummary {
  companySlug: string;
  companyId: string;
  agentRunId: string;
  sourcesWritten: number;
  claimsWritten: number;
  metricsWritten: number;
  fundamentalAnalysisId: string;
  assessmentId: string;
  /** Null when entity identity blocks decision scoring. Evidence still persists. */
  scoreId: string | null;
  scoreCreated: boolean;
  result: ScoringResult;
}

export interface RunVerticalSliceOptions {
  /**
   * Entity resolution happens before scoring. False persists useful evidence
   * and the evidence-backed assessment, but deliberately writes no score row.
   */
  allowScore?: boolean;
  /** Provenance of the producer of this payload, never inferred from the row. */
  agentRun?: {
    purpose: string;
    promptVersion: string | null;
    modelName: string | null;
    isStub: boolean;
  };
}

export async function runVerticalSlice(
  client: TypedSupabaseClient,
  rawPayload: ExtractionPayload,
  options: RunVerticalSliceOptions = {},
): Promise<VerticalSliceSummary> {
  const parsed = extractionPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    throw new RepositoryWriteError(
      `invalid extraction payload: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  const payload = parsed.data;

  const company = await client
    .from("companies")
    .select("id, canonical_name")
    .eq("slug", payload.companySlug)
    .maybeSingle();

  if (company.error) {
    throw new RepositoryWriteError(`could not read company: ${company.error.message}`);
  }
  if (!company.data) {
    throw new RepositoryWriteError(
      `no company with slug "${payload.companySlug}"; seed the bootstrap identities first`,
    );
  }
  const companyId = company.data.id;

  // Pure and first: the Analyst supplies inputs, TypeScript derives every
  // numeric output. `allowScore` controls only persistence after the entity
  // gate, not whether an LLM gets to calculate the value.
  const result = scoreTarget({
    config: THESIS_MODEL_V0_3,
    policy: SCORING_POLICY_V0_3,
    input: payload.scoring,
  });

  const agentRunId = await startAgentRun(client, {
    purpose:
      options.agentRun?.purpose ??
      (payload.provenance === "stub" ? "vertical_slice_stub" : "company_research_consolidation"),
    promptVersion: options.agentRun?.promptVersion ?? null,
    modelName: options.agentRun?.modelName ?? null,
    isStub: options.agentRun?.isStub ?? payload.provenance === "stub",
  });

  try {
    const sourceIdByKey = new Map<string, string>();
    for (const source of payload.sources) {
      const sourceId = await upsertSource(client, {
        url: source.url,
        urlNormalized: source.urlNormalized,
        title: source.title,
        publisher: source.publisher,
        sourceType: source.sourceType,
        trustTier: source.trustTier,
        publishedAt: source.publishedAt,
        contentHash: source.contentHash ?? null,
        // Every source in an ExtractionPayload was gathered for this one
        // company, so its content hash de-duplicates within this company
        // rather than against an unrelated company's identical boilerplate.
        researchCompanyId: companyId,
        agentRunId,
      });
      sourceIdByKey.set(source.key, sourceId);
    }

    // Conflict groups are payload-local keys; they become one shared uuid per
    // group so contradictory claims stay joined in the database.
    const conflictGroupIds = new Map<string, string>();
    const claimIdByKey = new Map<string, string>();

    for (const claim of payload.claims) {
      let conflictGroup: string | null = null;
      if (claim.conflictGroup) {
        conflictGroup = conflictGroupIds.get(claim.conflictGroup) ?? crypto.randomUUID();
        conflictGroupIds.set(claim.conflictGroup, conflictGroup);
      }

      const claimId = await insertClaim(client, {
        companyId,
        subject: claim.subject,
        predicate: claim.predicate,
        valueText: claim.valueText ?? null,
        valueNumeric: claim.valueNumeric ?? null,
        valueUnit: claim.valueUnit ?? null,
        valueCurrency: claim.valueCurrency ?? null,
        valueStatus: claim.valueStatus,
        asOfDate: claim.asOfDate,
        claimKind: claim.claimKind,
        aiConfidence: claim.aiConfidence ?? null,
        verificationStatus: claim.verificationStatus,
        conflictGroup,
        unknownReason: claim.unknownReason ?? null,
        agentRunId,
        sources: claim.sources.map((link) => {
          const sourceId = sourceIdByKey.get(link.sourceKey);
          if (!sourceId) {
            throw new RepositoryWriteError(`unresolved source key "${link.sourceKey}"`);
          }
          return { sourceId, relation: link.relation, excerpt: link.excerpt };
        }),
      });
      claimIdByKey.set(claim.key, claimId);
    }

    const resolveClaim = (key: string): string => {
      const claimId = claimIdByKey.get(key);
      if (!claimId) {
        throw new RepositoryWriteError(`unresolved claim key "${key}"`);
      }
      return claimId;
    };

    for (const metric of payload.metrics) {
      await insertMetric(client, {
        companyId,
        metricType: metric.metricType,
        valueNumeric: metric.valueNumeric,
        valueUnit: metric.valueUnit,
        currency: metric.currency ?? null,
        valueStatus: metric.valueStatus,
        periodStart: metric.periodStart ?? null,
        periodEnd: metric.periodEnd ?? null,
        asOfDate: metric.asOfDate,
        claimId: metric.claimKey ? resolveClaim(metric.claimKey) : null,
        confidence: metric.confidence ?? null,
        agentRunId,
      });
    }

    const fundamentalAnalysisId = await insertFundamentalAnalysis(client, {
      companyId,
      archetype: payload.fundamentals.archetype,
      revenueQuality: payload.fundamentals.revenueQuality,
      growthAssessment: payload.fundamentals.growthAssessment,
      marginAssessment: payload.fundamentals.marginAssessment,
      burnRunway: payload.fundamentals.burnRunway,
      concentration: payload.fundamentals.concentration,
      derivedRatios: payload.fundamentals.derivedRatios,
      unknowns: payload.fundamentals.unknowns,
      // The coverage the engine actually calculated, so the fundamentals
      // section and the score can never disagree about how well evidenced
      // this company is.
      evidenceCoverage: result.coverage,
      agentRunId,
      claimLinks: payload.fundamentals.claimLinks.map((link) => ({
        claimId: resolveClaim(link.claimKey),
        field: link.field,
      })),
    });

    const assessmentId = await insertAssessment(client, {
      companyId,
      thesisVersion: payload.assessment.thesisVersion,
      path: payload.assessment.path,
      strategicFitSummary: payload.assessment.strategicFitSummary,
      gapClosed: payload.assessment.gapClosed,
      whyNow: payload.assessment.whyNow,
      synergies: payload.assessment.synergies,
      risks: payload.assessment.risks,
      counterThesis: payload.assessment.counterThesis,
      unknowns: payload.assessment.unknowns,
      routeAssessment: payload.scoring.routes,
      agentRunId,
      claimLinks: payload.assessment.claimLinks.map((link) => ({
        claimId: resolveClaim(link.claimKey),
        role: link.role,
      })),
    });

    let scoreId: string | null = null;
    let created = false;
    if (options.allowScore ?? true) {
      const scoringModelId = await ensureScoringModel(client, {
        config: THESIS_MODEL_V0_3,
        policy: SCORING_POLICY_V0_3,
        governance: SCORING_MODEL_GOVERNANCE,
      });

      const insertedScore = await insertScore(client, {
        companyId,
        scoringModelId,
        input: payload.scoring,
        result,
        agentRunId,
      });
      scoreId = insertedScore.scoreId;
      created = insertedScore.created;
    }

    await finishAgentRun(client, agentRunId, "success");

    return {
      companySlug: payload.companySlug,
      companyId,
      agentRunId,
      sourcesWritten: payload.sources.length,
      claimsWritten: payload.claims.length,
      metricsWritten: payload.metrics.length,
      fundamentalAnalysisId,
      assessmentId,
      scoreId,
      scoreCreated: created,
      result,
    };
  } catch (error) {
    // A failed run stays on the record. Silently discarding it would leave
    // whatever was written without an explanation for why it is incomplete.
    await finishAgentRun(
      client,
      agentRunId,
      "failed",
      error instanceof Error ? error.name : "unknown",
    );
    throw error;
  }
}
