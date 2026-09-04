import { createPublicClient } from "@/src/db/client";
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
  finalScore: number | null;
  recommendation: RecommendationState | null;
  scoreState: "scored" | "research_only" | null;
  weightedCoverage: number | null;
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
  score_state: "scored" | "research_only";
  weighted_coverage: number;
  path: TargetPath;
  calculated_at: string;
}

export async function searchTargets(
  filters: SearchTargetsFilters,
): Promise<RepositoryResult<TargetSummary[]>> {
  const connection = createPublicClient();
  if (!connection.ok) {
    return { ok: false, problem: connection.problem };
  }

  let query = connection.client
    .from("companies")
    .select(
      "slug, canonical_name, legal_entity_name, primary_domain, theme_tags, hq_country, ma_state, scores(final_score, recommendation, score_state, weighted_coverage, path, calculated_at), assessments(id)",
    );

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
    // The newest score wins; earlier ones are history, not competing answers.
    const scores = ((row.scores ?? []) as ScoreRow[])
      .slice()
      .sort((left, right) => right.calculated_at.localeCompare(left.calculated_at));
    const latest = scores[0] ?? null;

    return {
      slug: row.slug,
      canonicalName: row.canonical_name,
      legalEntityName: row.legal_entity_name,
      primaryDomain: row.primary_domain,
      themeTags: row.theme_tags ?? [],
      hqCountry: row.hq_country,
      maState: row.ma_state,
      path: latest?.path ?? null,
      finalScore: latest?.final_score ?? null,
      recommendation: latest?.recommendation ?? null,
      scoreState: latest?.score_state ?? null,
      weightedCoverage: latest?.weighted_coverage ?? null,
      hasResearch: ((row.assessments ?? []) as { id: string }[]).length > 0,
    };
  });

  const filtered =
    filters.minimumScore === undefined
      ? summaries
      : summaries.filter(
          (summary) => summary.finalScore !== null && summary.finalScore >= filters.minimumScore!,
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
    if (left.finalScore === null && right.finalScore === null) {
      return left.canonicalName.localeCompare(right.canonicalName);
    }
    if (left.finalScore === null) return 1;
    if (right.finalScore === null) return -1;
    return right.finalScore - left.finalScore;
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
      const scored = members.filter((member) => member.finalScore !== null);
      return {
        category,
        companyCount: members.length,
        researchedCount: members.filter((member) => member.hasResearch).length,
        scoredCount: scored.length,
        averageFinalScore:
          scored.length === 0
            ? null
            : Math.round(
                (scored.reduce((sum, member) => sum + (member.finalScore ?? 0), 0) /
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
