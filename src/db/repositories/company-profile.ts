import { createPublicClient } from "@/src/db/client";
import type { RepositoryResult } from "@/src/db/repositories/result";
import type {
  EvidencePacket,
  PacketCitation,
  PacketContradiction,
  PacketFact,
} from "@/src/validation/evidence-packet";
import type {
  ClaimKind,
  ConfidenceLevel,
  EnablingLayer,
  RecommendationState,
  SourceTrustTier,
  SourceType,
  StrategicTheme,
  TargetPath,
  ValueStatus,
} from "@/src/config/taxonomy";

/**
 * The company profile read model.
 *
 * Fetching and shaping are deliberately separate. `getCompanyProfileWithEvidence`
 * talks to the database; `mapCompanyProfile` is pure and does all the work that
 * is actually easy to get wrong - assigning citation numbers, pairing
 * contradictory claims, collecting unknowns, deciding what counts as stale. That
 * split means the interesting logic is unit-tested against hand-built rows with
 * no database in the loop.
 */

const STALE_AFTER_DAYS = 180;

// --- Raw row shapes, mirroring what the query selects ----------------------

export interface RawSourceRow {
  id: string;
  url: string;
  title: string | null;
  publisher: string | null;
  source_type: SourceType;
  trust_tier: SourceTrustTier;
  published_at: string | null;
  accessed_at: string;
}

export interface RawClaimSourceRow {
  relation: "supports" | "contradicts";
  excerpt: string | null;
  sources: RawSourceRow | null;
}

export interface RawClaimRow {
  id: string;
  subject: string;
  predicate: string;
  value_text: string | null;
  value_numeric: number | null;
  value_unit: string | null;
  value_currency: string | null;
  value_status: ValueStatus;
  as_of_date: string | null;
  claim_kind: ClaimKind;
  ai_confidence: ConfidenceLevel | null;
  conflict_group: string | null;
  unknown_reason: string | null;
  updated_at: string;
  claim_sources: RawClaimSourceRow[];
}

export interface RawMetricRow {
  id: string;
  metric_type: string;
  value_numeric: number | null;
  value_unit: string | null;
  currency: string | null;
  value_status: ValueStatus;
  period_start: string | null;
  period_end: string | null;
  as_of_date: string | null;
  claim_id: string | null;
  confidence: ConfidenceLevel | null;
}

export interface RawFundamentalRow {
  id: string;
  archetype: string;
  version: number;
  revenue_quality: string | null;
  growth_assessment: string | null;
  margin_assessment: string | null;
  burn_runway: string | null;
  concentration: string | null;
  unknowns: string[];
  evidence_coverage: number | null;
  created_at: string;
  fundamental_analysis_claims: { claim_id: string; field: string }[];
}

export interface RawAssessmentRow {
  id: string;
  thesis_version: string;
  path: TargetPath;
  strategic_fit_summary: string | null;
  gap_closed: string | null;
  why_now: string | null;
  synergies: string | null;
  risks: string | null;
  counter_thesis: string | null;
  unknowns: string[];
  created_at: string;
  assessment_claims: { claim_id: string; role: string }[];
}

export interface RawScoreRow {
  id: string;
  model_version: string;
  positive_normalized: number | null;
  weighted_coverage: number;
  lower_bound: number | null;
  upper_bound: number | null;
  recommendation: RecommendationState;
  best_route: string | null;
  second_best_route: string | null;
  buy_beats_alternatives: boolean | null;
  gates: unknown;
  blocking_gates: string[] | null;
  calculated_at: string;
  input_snapshot: unknown;
}

export interface RawCompanyRow {
  id: string;
  canonical_name: string;
  slug: string;
  legal_entity_name: string | null;
  primary_domain: string | null;
  theme_tags: StrategicTheme[];
  enabling_layers: EnablingLayer[];
  updated_at: string;
}

export interface RawProfileRows {
  company: RawCompanyRow;
  claims: RawClaimRow[];
  metrics: RawMetricRow[];
  fundamentals: RawFundamentalRow | null;
  assessment: RawAssessmentRow | null;
  score: RawScoreRow | null;
}

// --- View shapes, which is what the UI renders -----------------------------

/** A citation as it appears in the sources footer; the index is its number. */
export type SourceListEntry = PacketCitation;

export interface MetricView {
  id: string;
  metricType: string;
  valueNumeric: number | null;
  valueUnit: string | null;
  currency: string | null;
  /** Drives whether the UI shows a number, "Unknown", or "Not applicable". */
  valueStatus: ValueStatus;
  periodLabel: string | null;
  asOfDate: string | null;
  confidence: ConfidenceLevel | null;
  citations: number[];
}

export interface FundamentalsView {
  archetype: string;
  version: number;
  revenueQuality: string | null;
  growthAssessment: string | null;
  marginAssessment: string | null;
  burnRunway: string | null;
  concentration: string | null;
  unknowns: string[];
  evidenceCoverage: number | null;
  /** Citation numbers per fundamentals field, e.g. revenue_quality -> [1, 2]. */
  citationsByField: Record<string, number[]>;
}

export interface AssessmentView {
  thesisVersion: string;
  path: TargetPath;
  strategicFitSummary: string | null;
  gapClosed: string | null;
  whyNow: string | null;
  synergies: string | null;
  risks: string | null;
  counterThesis: string | null;
  unknowns: string[];
  /** Citation numbers per conclusion, e.g. why_now -> [2]. */
  citationsByRole: Record<string, number[]>;
}

export interface ScoreView {
  modelVersion: string;
  /**
   * The three numbers section 26 requires to travel together: "A normalized 82
   * at 55% coverage with a 45-90 range is not '82/100.'"
   */
  normalizedScore: number | null;
  coverage: number;
  lowerBound: number | null;
  upperBound: number | null;
  recommendation: RecommendationState;
  /** Section 23. Null on rows written before routes were recorded. */
  bestRoute: string | null;
  secondBestRoute: string | null;
  buyBeatsAlternatives: boolean | null;
  gates: GateView[];
  blockingGates: string[];
  calculatedAt: string;
  breakdown: ScoreBreakdownRow[];
}

export interface GateView {
  key: string;
  label: string;
  state: "clear" | "triggered" | "unresolved";
  action: string;
}

export interface ScoreBreakdownRow {
  key: string;
  label: string;
  weight: number;
  status: "scored" | "partially_scored" | "unknown" | "not_applicable";
  score: number | null;
  contribution: number | null;
}

export interface CompanyProfileView {
  company: {
    id: string;
    canonicalName: string;
    slug: string;
    legalEntityName: string | null;
    primaryDomain: string | null;
    themeTags: StrategicTheme[];
    enablingLayers: EnablingLayer[];
  };
  /** The assessed path. It lives on the assessment, not on the identity row. */
  path: TargetPath | null;
  metrics: MetricView[];
  fundamentals: FundamentalsView | null;
  assessment: AssessmentView | null;
  score: ScoreView | null;
  evidence: EvidencePacket;
  /** Ordered source list; position in this array is the citation number. */
  sources: SourceListEntry[];
  /** False while a company is still an identity with no runtime knowledge. */
  hasResearch: boolean;
}

// --- Pure shaping ----------------------------------------------------------

/** Builds a readable sentence from a structured claim. */
export function describeClaim(claim: RawClaimRow): string {
  if (claim.value_text && claim.value_text.trim() !== "") {
    return claim.value_text;
  }
  if (claim.value_numeric !== null) {
    const amount = claim.value_currency
      ? `${claim.value_currency} ${claim.value_numeric.toLocaleString("en-US")}`
      : claim.value_numeric.toLocaleString("en-US");
    const unit = claim.value_unit ? ` ${claim.value_unit}` : "";
    return `${claim.subject} - ${claim.predicate}: ${amount}${unit}`;
  }
  // No value at all is itself the statement: this is a recorded gap.
  return `${claim.subject} - ${claim.predicate}: ${
    claim.value_status === "not_applicable" ? "not applicable" : "unknown"
  }`;
}

function isStale(asOf: string | null, now: Date): boolean {
  if (!asOf) {
    return false;
  }
  const ageDays = (now.getTime() - new Date(asOf).getTime()) / 86_400_000;
  return ageDays > STALE_AFTER_DAYS;
}

/**
 * Shapes raw relational rows into the profile the UI renders.
 *
 * Citation numbers are assigned by first appearance while walking the claims in
 * the order given, so the same rows always produce the same numbering.
 */
export function mapCompanyProfile(
  rows: RawProfileRows,
  now: Date = new Date(),
): CompanyProfileView {
  const sources: SourceListEntry[] = [];
  const indexBySourceId = new Map<string, number>();

  /** Resolves a source to its citation number, registering it on first sight. */
  function citationFor(link: RawClaimSourceRow): PacketCitation | null {
    if (!link.sources) {
      return null;
    }
    const source = link.sources;
    let index = indexBySourceId.get(source.id);
    if (index === undefined) {
      index = sources.length + 1;
      indexBySourceId.set(source.id, index);
      sources.push({
        sourceId: source.id,
        index,
        url: source.url,
        title: source.title,
        publisher: source.publisher,
        sourceType: source.source_type,
        trustTier: source.trust_tier,
        publishedAt: source.published_at,
        accessedAt: source.accessed_at,
        excerpt: link.excerpt,
        relation: link.relation,
      });
    }
    return {
      sourceId: source.id,
      index,
      url: source.url,
      title: source.title,
      publisher: source.publisher,
      sourceType: source.source_type,
      trustTier: source.trust_tier,
      publishedAt: source.published_at,
      accessedAt: source.accessed_at,
      excerpt: link.excerpt,
      relation: link.relation,
    };
  }

  const citationsByClaimId = new Map<string, PacketCitation[]>();
  for (const claim of rows.claims) {
    const citations = claim.claim_sources
      .map((link) => citationFor(link))
      .filter((citation): citation is PacketCitation => citation !== null);
    citationsByClaimId.set(claim.id, citations);
  }

  const claimNumbers = (claimId: string): number[] =>
    (citationsByClaimId.get(claimId) ?? []).map((citation) => citation.index);

  // Facts are sourced statements only. Analysis is the assessment's job, and an
  // unknown is a gap rather than a fact, so neither belongs in this list.
  const facts: PacketFact[] = rows.claims
    .filter(
      (claim) =>
        claim.claim_kind === "verified_fact" ||
        claim.claim_kind === "company_reported" ||
        claim.claim_kind === "estimate",
    )
    .map((claim) => ({
      claimId: claim.id,
      statement: describeClaim(claim),
      kind: claim.claim_kind as "verified_fact" | "company_reported" | "estimate",
      asOf: claim.as_of_date,
      confidence: claim.ai_confidence,
      citations: citationsByClaimId.get(claim.id) ?? [],
    }))
    .filter((fact) => fact.citations.length > 0);

  // Claims sharing a conflict group disagree with each other. Both sides are
  // kept and surfaced; the reader decides.
  const byConflictGroup = new Map<string, RawClaimRow[]>();
  for (const claim of rows.claims) {
    if (!claim.conflict_group) {
      continue;
    }
    const group = byConflictGroup.get(claim.conflict_group) ?? [];
    group.push(claim);
    byConflictGroup.set(claim.conflict_group, group);
  }

  const contradictions: PacketContradiction[] = [...byConflictGroup.values()]
    .filter((group) => group.length >= 2)
    .map((group) => ({
      topic: group[0].predicate,
      claimIds: group.map((claim) => claim.id),
      explanation: `Sources disagree on ${group[0].predicate}: ${group
        .map((claim) => describeClaim(claim))
        .join(" | ")}`,
      claims: group.map((claim) => ({
        claimId: claim.id,
        statement: describeClaim(claim),
        kind: claim.claim_kind,
        asOf: claim.as_of_date,
        citations: citationsByClaimId.get(claim.id) ?? [],
      })),
    }));

  // Unknowns are named, from every layer that can record one.
  const unknowns = new Set<string>();
  const claimsAlreadyReported = new Set<string>();

  for (const claim of rows.claims) {
    if (claim.value_status === "unknown") {
      unknowns.add(claim.unknown_reason ?? `${claim.predicate} is not established`);
      claimsAlreadyReported.add(claim.id);
    }
  }

  for (const metric of rows.metrics) {
    // A metric derived from a claim that already recorded the gap would restate
    // it in weaker words. The claim's own reason is the more specific one, so
    // the metric only speaks when nothing else has.
    if (
      metric.value_status === "unknown" &&
      !(metric.claim_id !== null && claimsAlreadyReported.has(metric.claim_id))
    ) {
      unknowns.add(`${metric.metric_type} is not disclosed`);
    }
  }
  for (const unknown of rows.fundamentals?.unknowns ?? []) {
    unknowns.add(unknown);
  }
  for (const unknown of rows.assessment?.unknowns ?? []) {
    unknowns.add(unknown);
  }

  const timestamps = [
    ...rows.claims.map((claim) => claim.updated_at),
    rows.score?.calculated_at,
    rows.assessment?.created_at,
    rows.fundamentals?.created_at,
  ].filter((value): value is string => typeof value === "string");

  const evidence: EvidencePacket = {
    facts,
    contradictions,
    unknowns: [...unknowns],
    freshness: {
      lastUpdatedAt:
        timestamps.length > 0
          ? timestamps.reduce((latest, value) => (value > latest ? value : latest))
          : null,
      staleFields: rows.claims
        .filter((claim) => isStale(claim.as_of_date, now))
        .map((claim) => claim.predicate),
    },
  };

  const metrics: MetricView[] = rows.metrics.map((metric) => ({
    id: metric.id,
    metricType: metric.metric_type,
    valueNumeric: metric.value_numeric,
    valueUnit: metric.value_unit,
    currency: metric.currency,
    valueStatus: metric.value_status,
    periodLabel:
      metric.period_start && metric.period_end
        ? `${metric.period_start} to ${metric.period_end}`
        : (metric.period_end ?? metric.period_start),
    asOfDate: metric.as_of_date,
    confidence: metric.confidence,
    citations: metric.claim_id ? claimNumbers(metric.claim_id) : [],
  }));

  const fundamentals: FundamentalsView | null = rows.fundamentals
    ? {
        archetype: rows.fundamentals.archetype,
        version: rows.fundamentals.version,
        revenueQuality: rows.fundamentals.revenue_quality,
        growthAssessment: rows.fundamentals.growth_assessment,
        marginAssessment: rows.fundamentals.margin_assessment,
        burnRunway: rows.fundamentals.burn_runway,
        concentration: rows.fundamentals.concentration,
        unknowns: rows.fundamentals.unknowns,
        evidenceCoverage: rows.fundamentals.evidence_coverage,
        citationsByField: groupCitations(
          rows.fundamentals.fundamental_analysis_claims.map((link) => ({
            key: link.field,
            claimId: link.claim_id,
          })),
          claimNumbers,
        ),
      }
    : null;

  const assessment: AssessmentView | null = rows.assessment
    ? {
        thesisVersion: rows.assessment.thesis_version,
        path: rows.assessment.path,
        strategicFitSummary: rows.assessment.strategic_fit_summary,
        gapClosed: rows.assessment.gap_closed,
        whyNow: rows.assessment.why_now,
        synergies: rows.assessment.synergies,
        risks: rows.assessment.risks,
        counterThesis: rows.assessment.counter_thesis,
        unknowns: rows.assessment.unknowns,
        citationsByRole: groupCitations(
          rows.assessment.assessment_claims.map((link) => ({
            key: link.role,
            claimId: link.claim_id,
          })),
          claimNumbers,
        ),
      }
    : null;

  const snapshot = (rows.score?.input_snapshot ?? {}) as {
    breakdown?: ScoreBreakdownRow[];
  };

  const score: ScoreView | null = rows.score
    ? {
        modelVersion: rows.score.model_version,
        normalizedScore: rows.score.positive_normalized,
        coverage: rows.score.weighted_coverage,
        lowerBound: rows.score.lower_bound,
        upperBound: rows.score.upper_bound,
        recommendation: rows.score.recommendation,
        bestRoute: rows.score.best_route,
        secondBestRoute: rows.score.second_best_route,
        buyBeatsAlternatives: rows.score.buy_beats_alternatives,
        gates: (rows.score.gates ?? []) as GateView[],
        blockingGates: rows.score.blocking_gates ?? [],
        calculatedAt: rows.score.calculated_at,
        breakdown: snapshot.breakdown ?? [],
      }
    : null;

  return {
    company: {
      id: rows.company.id,
      canonicalName: rows.company.canonical_name,
      slug: rows.company.slug,
      legalEntityName: rows.company.legal_entity_name,
      primaryDomain: rows.company.primary_domain,
      themeTags: rows.company.theme_tags ?? [],
      enablingLayers: rows.company.enabling_layers ?? [],
    },
    path: assessment?.path ?? null,
    metrics,
    fundamentals,
    assessment,
    score,
    evidence,
    sources,
    hasResearch: rows.claims.length > 0 || assessment !== null || score !== null,
  };
}

function groupCitations(
  links: { key: string; claimId: string }[],
  claimNumbers: (claimId: string) => number[],
): Record<string, number[]> {
  const grouped: Record<string, number[]> = {};
  for (const link of links) {
    const numbers = claimNumbers(link.claimId);
    const existing = grouped[link.key] ?? [];
    grouped[link.key] = [...new Set([...existing, ...numbers])].sort((a, b) => a - b);
  }
  return grouped;
}

// --- Fetching --------------------------------------------------------------

/**
 * Loads a company and the full evidence tree behind it.
 *
 * Returns `{ ok: true, data: null }` when the slug does not exist, which the
 * page turns into a 404 - distinct from a database failure, which the reader
 * needs to be told about rather than shown as "no such company".
 */
export async function getCompanyProfileWithEvidence(
  slug: string,
): Promise<RepositoryResult<CompanyProfileView | null>> {
  const connection = createPublicClient();
  if (!connection.ok) {
    return { ok: false, problem: connection.problem };
  }
  const client = connection.client;

  const companyResult = await client
    .from("companies")
    .select(
      "id, canonical_name, slug, legal_entity_name, primary_domain, theme_tags, enabling_layers, updated_at",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (companyResult.error) {
    return { ok: false, problem: { kind: "database", message: companyResult.error.message } };
  }
  if (!companyResult.data) {
    return { ok: true, data: null };
  }

  const companyId = companyResult.data.id;

  const [claimsResult, metricsResult, fundamentalsResult, assessmentResult, scoreResult] =
    await Promise.all([
      client
        .from("claims")
        .select(
          "id, subject, predicate, value_text, value_numeric, value_unit, value_currency, value_status, as_of_date, claim_kind, ai_confidence, conflict_group, unknown_reason, updated_at, claim_sources(relation, excerpt, sources(id, url, title, publisher, source_type, trust_tier, published_at, accessed_at))",
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: true }),
      client
        .from("company_metrics")
        .select(
          "id, metric_type, value_numeric, value_unit, currency, value_status, period_start, period_end, as_of_date, claim_id, confidence",
        )
        .eq("company_id", companyId)
        .order("metric_type", { ascending: true }),
      client
        .from("fundamental_analyses")
        .select(
          "id, archetype, version, revenue_quality, growth_assessment, margin_assessment, burn_runway, concentration, unknowns, evidence_coverage, created_at, fundamental_analysis_claims(claim_id, field)",
        )
        .eq("company_id", companyId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from("assessments")
        .select(
          "id, thesis_version, path, strategic_fit_summary, gap_closed, why_now, synergies, risks, counter_thesis, unknowns, created_at, assessment_claims(claim_id, role)",
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from("scores")
        .select(
          "id, model_version, positive_normalized, weighted_coverage, lower_bound, upper_bound, recommendation, best_route, second_best_route, buy_beats_alternatives, gates, blocking_gates, calculated_at, input_snapshot",
        )
        .eq("company_id", companyId)
        .order("calculated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  for (const result of [
    claimsResult,
    metricsResult,
    fundamentalsResult,
    assessmentResult,
    scoreResult,
  ]) {
    if (result.error) {
      return { ok: false, problem: { kind: "database", message: result.error.message } };
    }
  }

  return {
    ok: true,
    data: mapCompanyProfile({
      company: companyResult.data as RawCompanyRow,
      claims: (claimsResult.data ?? []) as unknown as RawClaimRow[],
      metrics: (metricsResult.data ?? []) as RawMetricRow[],
      fundamentals: (fundamentalsResult.data ?? null) as unknown as RawFundamentalRow | null,
      assessment: (assessmentResult.data ?? null) as unknown as RawAssessmentRow | null,
      score: (scoreResult.data ?? null) as RawScoreRow | null,
    }),
  };
}
