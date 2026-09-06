import { createPublicClient } from "@/src/db/client";
import { getActiveScoringModelId } from "@/src/db/repositories/scoring-models";
import type { RepositoryResult } from "@/src/db/repositories/result";
import type {
  MaState,
  RecommendationState,
  StrategicTheme,
  TargetPath,
} from "@/src/config/taxonomy";

/**
 * Ranked target search.
 *
 * Backs the discovery question - "which companies should we look at" - by
 * joining identity to the latest score. Companies with no score are still
 * returned when no score filter is applied, because "we have not assessed this
 * one yet" is a real and useful answer; silently dropping them would make the
 * universe look smaller than it is.
 */

export interface TargetSummary {
  slug: string;
  canonicalName: string;
  legalEntityName: string | null;
  primaryDomain: string | null;
  themeTags: StrategicTheme[];
  hqCountry: string | null;
  maState: MaState | null;
  path: TargetPath | null;
  /**
   * Section 26 keeps these together: a score without its coverage and range is
   * "not '82/100'". A caller that ranks on the score alone still gets the other
   * two, so it can say what the ranking is resting on.
   */
  normalizedScore: number | null;
  coverage: number | null;
  lowerBound: number | null;
  upperBound: number | null;
  recommendation: RecommendationState | null;
  /** False when the company is still an identity with no assessment. */
  hasResearch: boolean;
}

export interface SearchTargetsFilters {
  geography?: string;
  category?: StrategicTheme;
  stage?: MaState;
  path?: TargetPath;
  minimumScore?: number;
  limit: number;
}

interface ScoreRow {
  final_score: number | null;
  recommendation: RecommendationState;
  weighted_coverage: number;
  lower_bound: number | null;
  upper_bound: number | null;
  calculated_at: string;
  scoring_model_id: string;
}

interface AssessmentRow {
  id: string;
  path: TargetPath;
  created_at: string;
}

export async function searchTargets(
  filters: SearchTargetsFilters,
): Promise<RepositoryResult<TargetSummary[]>> {
  const connection = createPublicClient();
  if (!connection.ok) {
    return { ok: false, problem: connection.problem };
  }

  const activeModel = await getActiveScoringModelId(connection.client);
  if (!activeModel.ok) {
    return { ok: false, problem: activeModel.problem };
  }
  const activeModelId = activeModel.data;

  let query = connection.client
    .from("companies")
    .select(
      "slug, canonical_name, legal_entity_name, primary_domain, theme_tags, hq_country, ma_state, scores(final_score, recommendation, weighted_coverage, lower_bound, upper_bound, calculated_at, scoring_model_id), assessments(id, path, created_at)",
    )
    // Screened-out rows were never targets; precedents are real but unavailable.
    // Neither belongs in a ranked target search.
    .not("lifecycle_status", "in", "(screened_out,precedent)");

  if (filters.geography) {
    // Matched case-insensitively against the recorded headquarters country.
    query = query.ilike("hq_country", `%${filters.geography}%`);
  }
  if (filters.category) {
    query = query.contains("theme_tags", [filters.category]);
  }
  if (filters.stage) {
    query = query.eq("ma_state", filters.stage);
  }

  const { data, error } = await query.order("canonical_name", { ascending: true });

  if (error) {
    return { ok: false, problem: { kind: "database", message: error.message } };
  }

  const summaries: TargetSummary[] = (data ?? []).map((row) => {
    // Only a score from the active model is a candidate. A row scored under a
    // superseded model is still the newest by timestamp for as long as nothing
    // has re-scored it since, which is exactly how a stale v0.2 score could
    // otherwise win this ranking.
    const currentScores = ((row.scores ?? []) as ScoreRow[])
      .filter((score) => score.scoring_model_id === activeModelId)
      .sort((left, right) => right.calculated_at.localeCompare(left.calculated_at));
    const latestScore = currentScores[0] ?? null;

    // Platform/Tuck-in/Hybrid is the assessment's classification (section 26
    // note in the ADR: a classification, never a second score), so it comes
    // from the assessment row, not from `scores` - which no longer carries a
    // path at all under the one global v0.3 model.
    const assessments = ((row.assessments ?? []) as AssessmentRow[])
      .slice()
      .sort((left, right) => right.created_at.localeCompare(left.created_at));
    const latestAssessment = assessments[0] ?? null;

    return {
      slug: row.slug,
      canonicalName: row.canonical_name,
      legalEntityName: row.legal_entity_name,
      primaryDomain: row.primary_domain,
      themeTags: row.theme_tags ?? [],
      hqCountry: row.hq_country,
      maState: row.ma_state,
      path: latestAssessment?.path ?? null,
      normalizedScore: latestScore?.final_score ?? null,
      coverage: latestScore?.weighted_coverage ?? null,
      lowerBound: latestScore?.lower_bound ?? null,
      upperBound: latestScore?.upper_bound ?? null,
      recommendation: latestScore?.recommendation ?? null,
      hasResearch: assessments.length > 0,
    };
  });

  const filtered =
    filters.minimumScore === undefined
      ? summaries
      : summaries.filter(
          (summary) =>
            summary.normalizedScore !== null && summary.normalizedScore >= filters.minimumScore!,
        );

  if (filters.path) {
    // Path lives on the assessment, so it can only filter companies that have
    // actually been assessed.
    return {
      ok: true,
      data: filtered.filter((summary) => summary.path === filters.path).slice(0, filters.limit),
    };
  }

  // Highest score first, then unscored companies, so the ranking is meaningful
  // without hiding what has not been looked at yet.
  const ranked = filtered.sort((left, right) => {
    if (left.normalizedScore === null && right.normalizedScore === null) {
      return left.canonicalName.localeCompare(right.canonicalName);
    }
    if (left.normalizedScore === null) return 1;
    if (right.normalizedScore === null) return -1;
    return right.normalizedScore - left.normalizedScore;
  });

  return { ok: true, data: ranked.slice(0, filters.limit) };
}

export interface MarketMapEntry {
  category: StrategicTheme;
  companyCount: number;
  researchedCount: number;
  scoredCount: number;
  averageFinalScore: number | null;
}

export interface MarketMap {
  totalCompanies: number;
  entries: MarketMapEntry[];
  geographies: { country: string; companyCount: number }[];
  /** Companies with no recorded headquarters, stated rather than hidden. */
  companiesWithoutGeography: number;
}

/** Aggregate counts by theme and geography for the market-map question. */
export async function getMarketMap(filters: {
  geography?: string;
  category?: StrategicTheme;
}): Promise<RepositoryResult<MarketMap>> {
  const search = await searchTargets({
    geography: filters.geography,
    category: filters.category,
    limit: 500,
  });
  if (!search.ok) {
    return search;
  }

  const companies = search.data;
  const byTheme = new Map<StrategicTheme, TargetSummary[]>();
  for (const company of companies) {
    for (const theme of company.themeTags) {
      byTheme.set(theme, [...(byTheme.get(theme) ?? []), company]);
    }
  }

  const entries: MarketMapEntry[] = [...byTheme.entries()]
    .map(([category, members]) => {
      const scored = members.filter((member) => member.normalizedScore !== null);
      return {
        category,
        companyCount: members.length,
        researchedCount: members.filter((member) => member.hasResearch).length,
        scoredCount: scored.length,
        averageFinalScore:
          scored.length === 0
            ? null
            : Math.round(
                (scored.reduce((sum, member) => sum + (member.normalizedScore ?? 0), 0) /
                  scored.length) *
                  100,
              ) / 100,
      };
    })
    .sort((left, right) => right.companyCount - left.companyCount);

  const byCountry = new Map<string, number>();
  let withoutGeography = 0;
  for (const company of companies) {
    if (company.hqCountry) {
      byCountry.set(company.hqCountry, (byCountry.get(company.hqCountry) ?? 0) + 1);
    } else {
      withoutGeography += 1;
    }
  }

  return {
    ok: true,
    data: {
      totalCompanies: companies.length,
      entries,
      geographies: [...byCountry.entries()]
        .map(([country, companyCount]) => ({ country, companyCount }))
        .sort((left, right) => right.companyCount - left.companyCount),
      companiesWithoutGeography: withoutGeography,
    },
  };
}
