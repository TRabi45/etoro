import { mergeCitations } from "@/src/ai/tools/citations";
import {
  repositoryProblemToError,
  toolEmpty,
  toolFailure,
  toolSuccess,
  type Citation,
  type ToolResult,
} from "@/src/ai/tools/envelope";
import type {
  CompareCompaniesInput,
  ExplainScoreInput,
  GetCompanyFundamentalsInput,
  GetCompanyProfileInput,
  GetMarketMapInput,
  GetRecentEventsInput,
  RefreshCompanyInput,
  RunMonitoringQuickInput,
  SearchTargetsInput,
} from "@/src/ai/tools/schemas";
import { getRecentEvents } from "@/src/db/repositories/events";
import {
  getCompanyProfileWithEvidence,
  type CompanyProfileView,
} from "@/src/db/repositories/company-profile";
import { getMarketMap, searchTargets, type MarketMap } from "@/src/db/repositories/targets";
import { runMonitoringPass } from "@/src/research/pipeline/runner";

/**
 * Tool executors.
 *
 * Each one reads through a Milestone 2 repository and returns an envelope. They
 * hold no business logic of their own: a tool that computed anything would be a
 * second, unversioned source of truth competing with the deterministic engine.
 *
 * Two habits run through all of them:
 *
 *   - a lookup that finds nothing returns `toolEmpty` with a reason, never an
 *     error and never a fabricated placeholder;
 *   - confidence is derived from the evidence actually present - coverage,
 *     whether anything is contradicted - rather than asserted.
 */

/** Confidence follows the evidence, so the model cannot inflate it. */
function confidenceFromProfile(profile: CompanyProfileView): "low" | "medium" | "high" {
  const coverage = profile.score?.weightedCoverage ?? null;
  if (coverage === null) {
    return "low";
  }
  if (coverage >= 0.85 && profile.evidence.contradictions.length === 0) {
    return "high";
  }
  if (coverage >= 0.7) {
    return "medium";
  }
  return "low";
}

function citationsFromProfile(profile: CompanyProfileView): Citation[] {
  return profile.sources;
}

function freshnessOf(profile: CompanyProfileView): string | null {
  return profile.evidence.freshness.lastUpdatedAt;
}

/** Warnings the model must surface: stale data, disagreement, missing facts. */
function warningsFromProfile(profile: CompanyProfileView): string[] {
  const warnings: string[] = [];
  if (profile.evidence.contradictions.length > 0) {
    warnings.push(
      `${profile.evidence.contradictions.length} contradiction(s) recorded; sources disagree and neither figure has been preferred.`,
    );
  }
  if (profile.evidence.freshness.staleFields.length > 0) {
    warnings.push(`Stale fields: ${profile.evidence.freshness.staleFields.join(", ")}.`);
  }
  if (profile.evidence.unknowns.length > 0) {
    warnings.push(`${profile.evidence.unknowns.length} recorded unknown(s); do not fill these in.`);
  }
  return warnings;
}

export async function executeSearchTargets(
  input: SearchTargetsInput,
): Promise<ToolResult<unknown>> {
  const result = await searchTargets({
    geography: input.geography,
    category: input.category,
    stage: input.stage,
    path: input.path,
    minimumScore: input.minimum_score,
    limit: input.limit,
  });

  if (!result.ok) {
    return toolFailure(repositoryProblemToError(result.problem));
  }
  if (result.data.length === 0) {
    // Explain *why* it is empty. "No results" and "we have never recorded that
    // attribute" are different answers, and the second one is the honest one
    // while geography is unpopulated.
    const filters = [
      input.geography ? `geography="${input.geography}"` : null,
      input.category ? `category="${input.category}"` : null,
      input.stage ? `stage="${input.stage}"` : null,
      input.path ? `path="${input.path}"` : null,
      input.minimum_score !== undefined ? `minimum_score=${input.minimum_score}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    return toolEmpty(
      `No companies in the database match ${filters || "these filters"}. Note that headquarters geography is not yet recorded for any company, so any geography filter will return nothing until the monitoring pipeline populates it. Tell the user this rather than naming companies from memory.`,
    );
  }

  return toolSuccess(
    {
      matches: result.data,
      note: "Companies with finalScore null have not been assessed yet; that is a gap in coverage, not a low score.",
    },
    { confidence: "high", warnings: [] },
  );
}

export async function executeGetCompanyProfile(
  input: GetCompanyProfileInput,
): Promise<ToolResult<unknown>> {
  const result = await getCompanyProfileWithEvidence(input.slug);
  if (!result.ok) {
    return toolFailure(repositoryProblemToError(result.problem));
  }
  if (!result.data) {
    return toolEmpty(
      `No company with slug "${input.slug}" exists in the database. Do not describe this company from prior knowledge; say it is not in the monitored universe.`,
    );
  }

  const profile = result.data;
  if (!profile.hasResearch) {
    return toolSuccess(
      {
        company: profile.company,
        hasResearch: false,
        evidence: profile.evidence,
      },
      {
        confidence: "low",
        warnings: [
          `"${profile.company.canonicalName}" is a bootstrap identity only: no claims, fundamentals, assessment or score have been produced for it. Say so explicitly.`,
        ],
      },
    );
  }

  return toolSuccess(
    {
      company: profile.company,
      path: profile.path,
      hasResearch: true,
      // The full packet, so every sentence the model writes can be tied to a
      // claim id and a citation index.
      evidence: profile.evidence,
      fundamentals: profile.fundamentals,
      assessment: profile.assessment,
      score: profile.score,
      sources: profile.sources,
    },
    {
      citations: citationsFromProfile(profile),
      asOf: freshnessOf(profile),
      confidence: confidenceFromProfile(profile),
      warnings: warningsFromProfile(profile),
    },
  );
}

export async function executeGetCompanyFundamentals(
  input: GetCompanyFundamentalsInput,
): Promise<ToolResult<unknown>> {
  const result = await getCompanyProfileWithEvidence(input.slug);
  if (!result.ok) {
    return toolFailure(repositoryProblemToError(result.problem));
  }
  if (!result.data) {
    return toolEmpty(`No company with slug "${input.slug}" exists in the database.`);
  }

  const profile = result.data;
  const metrics = input.metrics
    ? profile.metrics.filter((metric) => input.metrics!.includes(metric.metricType))
    : profile.metrics;
  const periodFiltered = input.periods
    ? metrics.filter((metric) => metric.periodLabel && input.periods!.includes(metric.periodLabel))
    : metrics;

  if (periodFiltered.length === 0 && !profile.fundamentals) {
    return toolEmpty(
      `No fundamentals or metric observations are recorded for "${input.slug}". State that the financial picture is unknown rather than estimating it.`,
    );
  }

  return toolSuccess(
    {
      company: profile.company,
      fundamentals: profile.fundamentals,
      // Every observation keeps its own status, so `unknown` and
      // `not_applicable` stay distinguishable all the way to the answer.
      observations: periodFiltered,
      unknowns: profile.evidence.unknowns,
      note: "A metric with valueStatus 'unknown' or 'not_applicable' has no number. Never report it as zero.",
    },
    {
      citations: citationsFromProfile(profile),
      asOf: freshnessOf(profile),
      confidence: confidenceFromProfile(profile),
      warnings: warningsFromProfile(profile),
    },
  );
}

export async function executeCompareCompanies(
  input: CompareCompaniesInput,
): Promise<ToolResult<unknown>> {
  const results = await Promise.all(
    input.slugs.map(async (slug) => ({ slug, result: await getCompanyProfileWithEvidence(slug) })),
  );

  const failed = results.find((entry) => !entry.result.ok);
  if (failed && !failed.result.ok) {
    return toolFailure(repositoryProblemToError(failed.result.problem));
  }

  const missing = results.filter((entry) => entry.result.ok && entry.result.data === null);
  const found = results.flatMap((entry) =>
    entry.result.ok && entry.result.data ? [{ slug: entry.slug, profile: entry.result.data }] : [],
  );

  if (found.length < 2) {
    return toolEmpty(
      `Fewer than two of the requested companies exist in the database (missing: ${missing
        .map((entry) => entry.slug)
        .join(", ")}). A comparison needs at least two.`,
    );
  }

  // Aligned rows: every company reports the same fields, and an absent value is
  // explicitly null rather than omitted, so the model cannot read a gap in one
  // column as a low value.
  const rows = found.map(({ slug, profile }) => ({
    slug,
    canonicalName: profile.company.canonicalName,
    legalEntityName: profile.company.legalEntityName,
    themeTags: profile.company.themeTags,
    path: profile.path,
    hasResearch: profile.hasResearch,
    finalScore: profile.score?.finalScore ?? null,
    positiveNormalized: profile.score?.positiveNormalized ?? null,
    riskPenalty: profile.score?.riskPenalty ?? null,
    evidencePenalty: profile.score?.evidencePenalty ?? null,
    weightedCoverage: profile.score?.weightedCoverage ?? null,
    recommendation: profile.score?.recommendation ?? null,
    metrics: Object.fromEntries(
      profile.metrics.map((metric) => [
        metric.metricType,
        { value: metric.valueNumeric, status: metric.valueStatus, unit: metric.valueUnit },
      ]),
    ),
    unknowns: profile.evidence.unknowns,
  }));

  const warnings: string[] = [];
  if (missing.length > 0) {
    warnings.push(`Not found in the database: ${missing.map((entry) => entry.slug).join(", ")}.`);
  }
  const unassessed = rows.filter((row) => !row.hasResearch).map((row) => row.slug);
  if (unassessed.length > 0) {
    warnings.push(
      `No assessment exists for: ${unassessed.join(", ")}. Their blank columns mean "not researched", not "scored poorly".`,
    );
  }

  return toolSuccess(
    {
      companies: rows,
      dimensions: input.dimensions ?? null,
      note: "A null value means the measure is unknown or the company is unassessed. Never compare a null as if it were zero.",
    },
    {
      // Renumbered, not concatenated: each profile numbers its own sources from
      // [1], so concatenation would produce two different sources both called
      // [1] and let a sentence about one company cite the other's evidence.
      citations: mergeCitations(found.map(({ profile }) => citationsFromProfile(profile))),
      confidence: rows.every((row) => row.hasResearch) ? "medium" : "low",
      warnings,
    },
  );
}

export async function executeGetRecentEvents(
  input: GetRecentEventsInput,
): Promise<ToolResult<unknown>> {
  const result = await getRecentEvents({
    sinceDate: input.since_date,
    companySlug: input.company,
    competitor: input.competitor,
    eventTypes: input.event_types,
    limit: input.limit,
  });

  if (!result.ok) {
    return toolFailure(repositoryProblemToError(result.problem));
  }
  if (result.data.length === 0) {
    return toolEmpty(
      `No events are recorded on or after ${input.since_date}. The monitoring pipeline that writes events is not implemented yet (it is scheduled for a later milestone), so the events table is empty. Say that nothing has been recorded rather than describing events from prior knowledge.`,
    );
  }

  // Numbered through the same merge helper as every other multi-record tool, so
  // an event without a source cannot leave a gap in the sequence and two events
  // citing one article cannot give it two numbers.
  const citations: Citation[] = mergeCitations(
    result.data.map((event) =>
      event.source
        ? [
            {
              sourceId: event.source.id,
              index: 0,
              url: event.source.url,
              title: event.source.title,
              publisher: event.source.publisher,
              sourceType: "other" as const,
              trustTier: "secondary" as const,
              publishedAt: event.source.publishedAt,
              accessedAt: event.source.accessedAt,
              excerpt: null,
              relation: "supports" as const,
            },
          ]
        : [],
    ),
  );

  return toolSuccess(
    { events: result.data },
    {
      citations,
      confidence: "medium",
      warnings: result.data.some((event) => event.source === null)
        ? ["Some events have no source attached; treat those as unverified."]
        : [],
    },
  );
}

export async function executeExplainScore(input: ExplainScoreInput): Promise<ToolResult<unknown>> {
  const result = await getCompanyProfileWithEvidence(input.slug);
  if (!result.ok) {
    return toolFailure(repositoryProblemToError(result.problem));
  }
  if (!result.data) {
    return toolEmpty(`No company with slug "${input.slug}" exists in the database.`);
  }

  const profile = result.data;
  if (!profile.score) {
    return toolEmpty(
      `No score has been calculated for "${profile.company.canonicalName}". Say that it has not been scored; do not estimate a score.`,
    );
  }
  if (input.model_version && profile.score.modelVersion !== input.model_version) {
    return toolEmpty(
      `The stored score for "${input.slug}" uses model version ${profile.score.modelVersion}, not ${input.model_version}.`,
    );
  }

  const score = profile.score;
  return toolSuccess(
    {
      company: profile.company,
      modelVersion: score.modelVersion,
      path: score.path,
      // The arithmetic, exactly as the deterministic engine produced it.
      calculation: {
        positiveNormalized: score.positiveNormalized,
        riskPenalty: score.riskPenalty,
        evidencePenalty: score.evidencePenalty,
        weightedCoverage: score.weightedCoverage,
        finalScore: score.finalScore,
        formula: "final_score = max(0, positive_normalized - risk_penalty - evidence_penalty)",
      },
      scoreState: score.scoreState,
      recommendation: score.recommendation,
      acquireBlockers: score.acquireBlockers,
      breakdown: score.breakdown,
      calculatedAt: score.calculatedAt,
      note: "These numbers were computed in code, not by a language model. Explain them; never recompute, adjust or round them differently.",
    },
    {
      citations: citationsFromProfile(profile),
      asOf: score.calculatedAt,
      confidence: confidenceFromProfile(profile),
      warnings: warningsFromProfile(profile),
    },
  );
}

export async function executeGetMarketMap(
  input: GetMarketMapInput,
): Promise<ToolResult<MarketMap>> {
  const result = await getMarketMap({ geography: input.geography, category: input.category });
  if (!result.ok) {
    return toolFailure(repositoryProblemToError(result.problem));
  }
  if (result.data.totalCompanies === 0) {
    return toolEmpty("No companies match those filters, so there is no market map to report.");
  }

  const warnings: string[] = [];
  if (result.data.companiesWithoutGeography > 0) {
    warnings.push(
      `${result.data.companiesWithoutGeography} of ${result.data.totalCompanies} companies have no recorded headquarters country, so the geography breakdown is incomplete.`,
    );
  }
  return toolSuccess(result.data, { confidence: "high", warnings });
}

/**
 * Refresh stub.
 *
 * Deliberately does not fetch anything. The source-retrieval pipeline is a later
 * milestone, and the honest response is an accepted job that has not run - not a
 * fabricated set of freshly-discovered facts.
 */
export async function executeRefreshCompany(
  input: RefreshCompanyInput,
): Promise<ToolResult<unknown>> {
  const profile = await getCompanyProfileWithEvidence(input.slug);
  if (!profile.ok) {
    return toolFailure(repositoryProblemToError(profile.problem));
  }
  if (!profile.data) {
    return toolEmpty(`No company with slug "${input.slug}" exists, so no refresh was queued.`);
  }

  return toolSuccess(
    {
      accepted: true,
      status: "not_implemented",
      companySlug: input.slug,
      sourceLimit: input.source_limit,
      requestedAt: new Date().toISOString(),
    },
    {
      confidence: "high",
      warnings: [
        "This is a stub. No sources were fetched and no data changed, because live retrieval is not implemented yet. Tell the user the refresh cannot run yet instead of implying new information has arrived.",
      ],
    },
  );
}

/**
 * Runs a real monitoring pass from the chat.
 *
 * This was a stub through Milestone 3, when there was no pipeline behind it. The
 * pipeline arrived in Milestone 4 and the stub did not: the endpoint and the CLI
 * were wired to the real runner while this tool went on reporting
 * `not_implemented` with zero counts. An analyst asking the agent to check for
 * news was told the capability did not exist, at the same time as the scheduled
 * job was writing claims and events into the database behind them. Of every way
 * a tool can be wrong, telling the user a working feature is missing is among
 * the worst, because it is unfalsifiable from the chat.
 *
 * The run is bounded far more tightly than the HTTP endpoint's, because this one
 * happens inside a conversation turn: each source costs a fetch plus a model
 * call, and an analyst waiting on a chat reply will not wait for five of them.
 */
export interface RunMonitoringQuickOptions {
  /**
   * Injected by tests so the wiring can be exercised without a network or a
   * paid model call. Production never passes it.
   */
  fetchImpl?: typeof fetch;
}

export async function executeRunMonitoringQuick(
  input: RunMonitoringQuickInput,
  options: RunMonitoringQuickOptions = {},
): Promise<ToolResult<unknown>> {
  // One source under strict limits, two without. Both are small enough to
  // finish inside a chat turn; neither is a substitute for the scheduled run.
  const maxSources = input.strict_limits ? 1 : 2;

  const report = await runMonitoringPass({
    trigger: "manual",
    maxSources,
    // A fresh key every time: the caller asked for a run now, and silently
    // returning this morning's scheduled run instead would answer a question
    // they did not ask.
    idempotencyKey: `chat-${crypto.randomUUID()}`,
    fetchImpl: options.fetchImpl,
  });

  const warnings = [...report.warnings];
  if (input.topic) {
    // Discovery reads configured feeds; it cannot be pointed at a subject. Say
    // so rather than accepting the argument and quietly ignoring it, which would
    // let the agent report a topic-specific result it never ran.
    warnings.push(
      `Discovery reads the configured news feeds and cannot be narrowed to "${input.topic}". The run covered whatever those feeds published; it was not a search for that topic.`,
    );
  }
  if (report.sourcesFetched === 0) {
    warnings.push(
      "No new documents were read. Either the feeds published nothing new since the last run, or every candidate failed to fetch - the warnings above say which.",
    );
  }

  return toolSuccess(
    {
      runId: report.runId,
      status: report.status,
      counts: {
        sourcesDiscovered: report.sourcesDiscovered,
        sourcesSkippedAlreadyStored: report.sourcesSkipped,
        sourcesFetched: report.sourcesFetched,
        claimsWritten: report.claimsWritten,
        eventsWritten: report.eventsWritten,
        companiesDiscovered: report.companiesDiscovered,
      },
      note: "These counts are what this run actually wrote. A status of partial_success means some sources could not be read and the warnings say which; it does not mean the run failed.",
    },
    {
      confidence: "high",
      warnings,
    },
  );
}
