import { createServiceClient, type TypedSupabaseClient } from "@/src/db/client";
import {
  finishCompanyResearchRun,
  getCompanyResearchRunById,
  startCompanyResearchRun,
  type CompanyResearchRunStatus,
} from "@/src/db/repositories/company-research-runs";
import {
  getCompanyResearchContext,
  getCompanyResearchIdentity,
} from "@/src/db/repositories/company-research-context";
import {
  applyRefreshSchedule,
  applyTierDecision,
  type ResearchState,
} from "@/src/db/repositories/company-tiers";
import type { RunTrigger } from "@/src/db/repositories/monitoring-runs";
import { analyzeCompanyEvidence } from "@/src/ai/provider-adapter";
import { ANALYST_PROMPT_VERSION } from "@/src/ai/prompts/v1/analyst";
import type { AnalystOutput } from "@/src/ai/prompts/v1/analyst";
import {
  buildCompanySourcePlan,
  type SourceFamily,
} from "@/src/research/sources/company-source-plan";
import { fetchSource, type FetchedDocument } from "@/src/research/sources/fetcher";
import { runVerticalSlice } from "@/src/research/pipeline/vertical-slice";
import type { ExtractionPayload } from "@/src/research/pipeline/extraction-payload";
import { decideResearchTier } from "@/src/domain/tiering/tier-policy";
import { computeNextRefresh, type LastResearchOutcome } from "@/src/domain/tiering/refresh-policy";
import type { RecommendationLabel } from "@/src/domain/scoring/types";
import type { SourceTrustTier, SourceType } from "@/src/config/taxonomy";

/** `CompanyResearchRunStatus` to `ResearchState`: the run vocabulary is not the company's persisted-state vocabulary. */
const RUN_STATUS_TO_RESEARCH_STATE: Record<CompanyResearchRunStatus, ResearchState> = {
  running: "running",
  success: "complete",
  partial_success: "partial",
  blocked: "blocked",
  failed: "failed",
};

/**
 * The company-research orchestrator (workstream D).
 *
 * One shared function for every trigger - CLI, chat tool, automated
 * monitoring, an API route - so there is exactly one business pipeline for
 * "gather evidence for this company and, where the evidence allows it, score
 * it." Each trigger only decides *when* to call this; none of them re-implement
 * *what* it does.
 *
 * Nine stages, matching section 33's workflow more than they resemble a
 * typical CRUD handler:
 *
 *   1. Start or reuse an idempotent run (company-research-runs.ts).
 *   2. Load identity, domain and everything already on file.
 *   3. Build the bounded source plan (company-source-plan.ts).
 *   4. Fetch it through the existing guarded fetcher - one failure costs one
 *      source, never the run.
 *   5. Run the Analyst over what was fetched, producing claims plus the
 *      dimension/gate/route judgements the engine needs.
 *   6. Map that into an ExtractionPayload and hand it to `runVerticalSlice`,
 *      which already does sources -> claims -> fundamentals -> assessment ->
 *      the deterministic score, correctly, for any company.
 *   7. Apply the tier policy.
 *   8. Apply the refresh policy.
 *   9. Finish the run with real counters - never a fabricated one.
 */

export interface ResearchCompanyOptions {
  slug: string;
  trigger: RunTrigger;
  /** Defaults to one attempt per company per calendar day. */
  idempotencyKey?: string;
  /** Injected in tests so no network call happens. */
  fetchImpl?: typeof fetch;
  /** Injected in tests so no provider call happens. */
  analyzeImpl?: typeof analyzeCompanyEvidence;
  now?: Date;
}

export interface CompanyResearchReport {
  runId: string;
  reused: boolean;
  companySlug: string;
  status: CompanyResearchRunStatus;
  sourcesPlanned: number;
  sourcesFetched: number;
  claimsWritten: number;
  scored: boolean;
  tier: string;
  nextRefreshAt: string;
  warnings: string[];
}

function dailyIdempotencyKey(slug: string, now: Date): string {
  return `research:${slug}:${now.toISOString().slice(0, 10)}`;
}

/** Maps a source's discovery family to what it is and how much to trust it, absent a closer read. */
const FAMILY_SOURCE_TYPE: Record<
  SourceFamily,
  { sourceType: SourceType; trustTier: SourceTrustTier }
> = {
  existing_evidence: { sourceType: "other", trustTier: "secondary" },
  official: { sourceType: "company_official", trustTier: "primary" },
  regulatory: { sourceType: "regulator_registry", trustTier: "primary" },
  ownership_registry: { sourceType: "regulator_registry", trustTier: "primary" },
  filing: { sourceType: "securities_filing", trustTier: "primary" },
  transaction_release: { sourceType: "transaction_party", trustTier: "primary" },
  financial_reporting: { sourceType: "financial_press", trustTier: "secondary" },
  specialist_database: { sourceType: "specialist_database", trustTier: "secondary" },
  news_event: { sourceType: "trade_press", trustTier: "tertiary" },
};

interface FetchedCandidate {
  document: FetchedDocument;
  family: SourceFamily;
}

/**
 * Walks the plan through the existing fetcher, sequentially, honouring the
 * document and attempt ceilings and an overall deadline.
 *
 * Sequential rather than a concurrency pool: the plan is at most a few dozen
 * candidates and the document ceiling is single digits, so a pool would add
 * complexity without a measurable speed benefit. `perHostConcurrency` in the
 * budget is still honoured - trivially, since one in-flight request is within
 * any positive limit - and documented here rather than silently ignored.
 */
async function fetchPlannedDocuments(
  candidates: { url: string; family: SourceFamily }[],
  budget: { maxFetchedDocuments: number; maxAttempts: number; overallDeadlineMs: number },
  fetchImpl: typeof fetch | undefined,
  now: Date,
): Promise<{ fetched: FetchedCandidate[]; warnings: string[] }> {
  const deadline = now.getTime() + budget.overallDeadlineMs;
  const fetched: FetchedCandidate[] = [];
  const warnings: string[] = [];
  let attempts = 0;

  for (const candidate of candidates) {
    if (fetched.length >= budget.maxFetchedDocuments || attempts >= budget.maxAttempts) {
      break;
    }
    if (Date.now() >= deadline) {
      warnings.push("Stopped fetching: the company research run's overall deadline was reached.");
      break;
    }

    attempts += 1;
    const outcome = await fetchSource(candidate.url, { fetchImpl });
    if (outcome.ok) {
      fetched.push({ document: outcome.document, family: candidate.family });
    } else {
      // One failed source costs one source, not the run.
      warnings.push(`Could not fetch ${candidate.url}: ${outcome.reason}`);
    }
  }

  return { fetched, warnings };
}

/** Builds an ExtractionPayload from the Analyst's output and the documents it read. */
function buildExtractionPayload(
  companySlug: string,
  fetchedDocuments: FetchedCandidate[],
  analysis: AnalystOutput,
): ExtractionPayload {
  const sourceKeyByIndex = fetchedDocuments.map((_, index) => `doc-${index}`);

  const sources: ExtractionPayload["sources"] = fetchedDocuments.map(
    ({ document, family }, index) => {
      const mapping = FAMILY_SOURCE_TYPE[family];
      return {
        key: sourceKeyByIndex[index],
        url: document.url,
        urlNormalized: document.normalizedUrl,
        title: document.title,
        publisher: null,
        sourceType: mapping.sourceType,
        trustTier: mapping.trustTier,
        publishedAt: document.publishedAt,
      };
    },
  );

  const claims: ExtractionPayload["claims"] = analysis.claims
    .filter((claim) => claim.documentIndex >= 0 && claim.documentIndex < sourceKeyByIndex.length)
    .map((claim, index) => ({
      key: `claim-${index}`,
      subject: claim.subject,
      predicate: claim.predicate,
      valueText: claim.valueText,
      valueNumeric: claim.valueNumeric,
      valueUnit: claim.valueUnit,
      valueCurrency: claim.valueCurrency,
      valueStatus: claim.valueStatus,
      asOfDate: claim.asOfDate,
      claimKind: claim.claimKind,
      conflictGroup: claim.conflictGroup,
      unknownReason:
        claim.valueStatus === "unknown" ? "Not established by any fetched document." : null,
      sources: [
        {
          sourceKey: sourceKeyByIndex[claim.documentIndex],
          relation: "supports" as const,
          excerpt: claim.excerpt,
        },
      ],
    }));

  const claimKeyByAnalystIndex = new Map<number, string>();
  let nextClaimKey = 0;
  for (let i = 0; i < analysis.claims.length; i += 1) {
    const claim = analysis.claims[i];
    if (claim.documentIndex >= 0 && claim.documentIndex < sourceKeyByIndex.length) {
      claimKeyByAnalystIndex.set(i, `claim-${nextClaimKey}`);
      nextClaimKey += 1;
    }
  }
  const resolveClaimKeys = (indexes: number[]): string[] =>
    indexes
      .map((i) => claimKeyByAnalystIndex.get(i))
      .filter((key): key is string => key !== undefined);

  const dimensionEntries = Object.entries(analysis.dimensions) as [
    keyof AnalystOutput["dimensions"],
    AnalystOutput["dimensions"][keyof AnalystOutput["dimensions"]],
  ][];
  const subMetrics: ExtractionPayload["scoring"]["subMetrics"] = Object.fromEntries(
    dimensionEntries.map(([key, value]) => [
      key,
      {
        status: value.status,
        score: value.score,
        reason: `${value.reason}${
          resolveClaimKeys(value.citingClaimIndexes).length > 0
            ? ` (claims: ${resolveClaimKeys(value.citingClaimIndexes).join(", ")})`
            : ""
        }`,
      },
    ]),
  );

  const analystGateEntries = Object.entries(analysis.gates) as [
    keyof AnalystOutput["gates"],
    AnalystOutput["gates"][keyof AnalystOutput["gates"]],
  ][];
  const hardGates: ExtractionPayload["scoring"]["hardGates"] = {
    entity: {
      state: analysis.entityResolution.matchesRecordedIdentity ? "clear" : "unresolved",
      reason: analysis.entityResolution.note,
    },
    // The engine derives this from how much it was able to score; supplying
    // "clear" here is a starting value the engine is free to override, never
    // a claim that coverage is already known to be sufficient.
    coverage: { state: "clear" },
    ...Object.fromEntries(
      analystGateEntries.map(([key, value]) => [
        key,
        {
          state: value.state,
          reason: `${value.reason}${
            resolveClaimKeys(value.citingClaimIndexes).length > 0
              ? ` (claims: ${resolveClaimKeys(value.citingClaimIndexes).join(", ")})`
              : ""
          }`,
        },
      ]),
    ),
  };

  return {
    companySlug,
    provenance: "pipeline",
    sources,
    claims,
    metrics: [],
    fundamentals: {
      archetype: analysis.fundamentals.archetype,
      revenueQuality: analysis.fundamentals.revenueQuality,
      growthAssessment: analysis.fundamentals.growthAssessment,
      marginAssessment: analysis.fundamentals.marginAssessment,
      burnRunway: analysis.fundamentals.burnRunway,
      concentration: analysis.fundamentals.concentration,
      unknowns: analysis.fundamentals.unknowns,
      claimLinks: [],
    },
    assessment: {
      thesisVersion: "thesis/v1.0",
      path: analysis.classification,
      strategicFitSummary: analysis.assessment.strategicFitSummary,
      gapClosed: analysis.assessment.gapClosed,
      whyNow: analysis.assessment.whyNow,
      synergies: analysis.assessment.synergies,
      risks: analysis.assessment.risks,
      counterThesis: analysis.assessment.counterThesis,
      unknowns: analysis.assessment.unknowns,
      claimLinks: [],
    },
    scoring: {
      subMetrics,
      hardGates,
      routes: analysis.routes,
      notes: `Produced by ${ANALYST_PROMPT_VERSION} from ${fetchedDocuments.length} fetched document(s).`,
    },
  };
}

export async function researchCompany(
  options: ResearchCompanyOptions,
): Promise<CompanyResearchReport> {
  const connection = createServiceClient();
  if (!connection.ok) {
    throw new Error(connection.problem.message);
  }
  const client: TypedSupabaseClient = connection.client;
  const now = options.now ?? new Date();
  const analyze = options.analyzeImpl ?? analyzeCompanyEvidence;

  const identity = await getCompanyResearchIdentity(client, options.slug);
  if (!identity) {
    throw new Error(`no company with slug "${options.slug}"`);
  }

  const idempotencyKey = options.idempotencyKey ?? dailyIdempotencyKey(options.slug, now);
  const { runId, reused } = await startCompanyResearchRun(
    client,
    identity.id,
    options.trigger,
    idempotencyKey,
  );

  if (reused) {
    const existingRun = await getCompanyResearchRunById(client, runId);
    return {
      runId,
      reused: true,
      companySlug: identity.slug,
      status: existingRun.status,
      sourcesPlanned: 0,
      sourcesFetched: existingRun.sourcesFetched,
      claimsWritten: existingRun.claimsWritten,
      scored: false,
      tier: "unchanged",
      nextRefreshAt: "unchanged",
      warnings: [
        ...existingRun.warnings,
        `A research run already exists for "${idempotencyKey}"; returning its recorded result instead of researching again.`,
      ],
    };
  }

  const warnings: string[] = [];

  try {
    if (identity.entityRole !== "operating_company" && identity.entityRole !== "unknown") {
      // Section 32's screen runs at discovery; this is the same rule applied
      // again at research time, in case a role changed - or was set - after
      // discovery. A product or an investor is never worth a research pass.
      await finishCompanyResearchRun(client, runId, {
        status: "blocked",
        sourcesPlanned: 0,
        sourcesFetched: 0,
        claimsWritten: 0,
        warnings: [
          `Entity role is "${identity.entityRole}", not an operating company; research refused.`,
        ],
      });
      return {
        runId,
        reused: false,
        companySlug: identity.slug,
        status: "blocked",
        sourcesPlanned: 0,
        sourcesFetched: 0,
        claimsWritten: 0,
        scored: false,
        tier: "indexed",
        nextRefreshAt: now.toISOString(),
        warnings: [
          `Entity role is "${identity.entityRole}", not an operating company; research refused.`,
        ],
      };
    }

    const context = await getCompanyResearchContext(client, identity.id);
    const plan = buildCompanySourcePlan({
      primaryDomain: identity.primaryDomain,
      searchLeads: context.searchLeads,
      existingEvidenceUrls: context.existingEvidenceUrls,
    });
    warnings.push(...plan.warnings);

    const { fetched, warnings: fetchWarnings } = await fetchPlannedDocuments(
      plan.candidates,
      plan.budget,
      options.fetchImpl,
      now,
    );
    warnings.push(...fetchWarnings);

    if (fetched.length === 0) {
      await finishCompanyResearchRun(client, runId, {
        status: "partial_success",
        sourcesPlanned: plan.candidates.length,
        sourcesFetched: 0,
        claimsWritten: 0,
        warnings: [...warnings, "No document could be fetched; nothing to analyze."],
      });
      const decision = decideResearchTier({
        screenVerdict: "pass",
        entityResolved: identity.legalEntityName !== null,
        hasEvidence: context.existingEvidenceUrls.length > 0,
        recommendation: null,
        hasUnreflectedMaterialEvent: false,
      });
      await applyTierDecision(client, {
        companyId: identity.id,
        decision,
        confidence: "low",
        researchRunId: runId,
      });
      const refresh = computeNextRefresh({
        tier: decision.tier,
        now,
        hasUnreflectedMaterialEvent: false,
        lastResearchOutcome: "partial",
      });
      await applyRefreshSchedule(client, {
        companyId: identity.id,
        nextRefreshAt: refresh.nextRefreshAt.toISOString(),
        researchState: "partial",
        lastResearchedAt: now.toISOString(),
      });

      return {
        runId,
        reused: false,
        companySlug: identity.slug,
        status: "partial_success",
        sourcesPlanned: plan.candidates.length,
        sourcesFetched: 0,
        claimsWritten: 0,
        scored: false,
        tier: decision.tier,
        nextRefreshAt: refresh.nextRefreshAt.toISOString(),
        warnings: [...warnings, "No document could be fetched; nothing to analyze."],
      };
    }

    const analysis = await analyze(
      {
        canonicalName: identity.canonicalName,
        recordedLegalEntityName: identity.legalEntityName,
        primaryDomain: identity.primaryDomain,
      },
      fetched.map(({ document }) => ({
        context: {
          url: document.url,
          title: document.title,
          publisher: null,
          publishedAt: document.publishedAt,
        },
        bodyText: document.text,
      })),
    );
    if (analysis.problem) {
      warnings.push(`Analysis problem: ${analysis.problem}`);
    }

    const payload = buildExtractionPayload(identity.slug, fetched, analysis.output);

    let scored = false;
    let claimsWritten = 0;
    let recommendation: RecommendationLabel | null = null;
    // A 404 on a *guessed* official path (most companies do not have every
    // one of /investors, /press, /legal...) is the normal, expected shape of
    // this kind of source planning, not a completeness problem - it is
    // recorded in `warnings` either way ("every miss must remain visible"),
    // but it must not by itself turn a run that found what it needed into a
    // "partial_success". A real coverage gap - the plan's own structural
    // warnings, or the analyst failing outright - does.
    let hasMeaningfulGap = plan.warnings.length > 0 || analysis.problem !== null;

    if (payload.claims.length === 0) {
      warnings.push("The analyst produced no claims from the fetched documents.");
      hasMeaningfulGap = true;
    } else {
      const summary = await runVerticalSlice(client, payload);
      claimsWritten = summary.claimsWritten;
      scored = summary.result.normalizedScore !== null;
      recommendation = summary.result.recommendation;
    }

    const runStatus: CompanyResearchRunStatus =
      recommendation === "blocked" ? "blocked" : hasMeaningfulGap ? "partial_success" : "success";

    await finishCompanyResearchRun(client, runId, {
      status: runStatus,
      sourcesPlanned: plan.candidates.length,
      sourcesFetched: fetched.length,
      claimsWritten,
      warnings,
    });

    const tierDecision = decideResearchTier({
      screenVerdict: "pass",
      entityResolved: analysis.output.entityResolution.matchesRecordedIdentity,
      hasEvidence: claimsWritten > 0,
      recommendation,
      hasUnreflectedMaterialEvent: false,
    });
    await applyTierDecision(client, {
      companyId: identity.id,
      decision: tierDecision,
      confidence: claimsWritten > 0 ? "medium" : "low",
      researchRunId: runId,
    });

    const lastOutcome: LastResearchOutcome =
      runStatus === "success" ? "complete" : runStatus === "blocked" ? "blocked" : "partial";
    const refresh = computeNextRefresh({
      tier: tierDecision.tier,
      now,
      hasUnreflectedMaterialEvent: false,
      lastResearchOutcome: lastOutcome,
    });
    await applyRefreshSchedule(client, {
      companyId: identity.id,
      nextRefreshAt: refresh.nextRefreshAt.toISOString(),
      researchState: RUN_STATUS_TO_RESEARCH_STATE[runStatus],
      lastResearchedAt: now.toISOString(),
    });

    return {
      runId,
      reused: false,
      companySlug: identity.slug,
      status: runStatus,
      sourcesPlanned: plan.candidates.length,
      sourcesFetched: fetched.length,
      claimsWritten,
      scored,
      tier: tierDecision.tier,
      nextRefreshAt: refresh.nextRefreshAt.toISOString(),
      warnings,
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "company research failed";
    await finishCompanyResearchRun(client, runId, {
      status: "failed",
      sourcesPlanned: 0,
      sourcesFetched: 0,
      claimsWritten: 0,
      warnings: [...warnings, message],
      errorSummary: message,
    });
    throw cause;
  }
}
