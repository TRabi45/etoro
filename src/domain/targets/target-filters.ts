import {
  RECOMMENDATION_STATES,
  STRATEGIC_THEMES,
  TARGET_PATHS,
  type RecommendationState,
  type StrategicTheme,
  type TargetPath,
} from "@/src/config/taxonomy";
import { SCORING_THRESHOLDS_V0_3 } from "@/src/config/scoring/v0-3";
import type { TargetSummary } from "@/src/db/repositories/targets";

/**
 * The target explorer's query model.
 *
 * Pure functions over an already-loaded list, deliberately separate from both
 * the repository and the React tree. Two reasons:
 *
 *   - the same query has to be parsed identically on the server (which renders
 *     the table) and in the browser (where the agent reads the active filters
 *     to describe them). One parser means the two cannot disagree about what
 *     `?view=priority&coverage=low` selects.
 *   - the interesting cases here are about honesty rather than mechanics - an
 *     unscored company must not be silently dropped by a score sort, and a
 *     coverage band must not treat "no score at all" as "low coverage" - and
 *     those are worth testing directly rather than through a rendered table.
 *
 * Every value is validated against the controlled vocabulary. An unrecognised
 * search param falls back to the neutral default instead of producing an empty
 * table, because a typo in a shared URL should not look like "no results".
 */

export type SavedView = "all" | "priority" | "new" | "needs_research" | "watch" | "blocked";

export type CoverageBand = "any" | "high" | "medium" | "low" | "none";

export type FreshnessBand = "any" | "fresh" | "stale" | "never";

export type SortKey = "score_desc" | "score_asc" | "coverage_desc" | "name_asc" | "updated_desc";

/** Mirrors the profile mapper's threshold; re-exported here to stay in step. */
export const STALE_AFTER_DAYS = 180;

const SAVED_VIEWS: readonly SavedView[] = [
  "all",
  "priority",
  "new",
  "needs_research",
  "watch",
  "blocked",
];

const COVERAGE_BANDS: readonly CoverageBand[] = ["any", "high", "medium", "low", "none"];
const FRESHNESS_BANDS: readonly FreshnessBand[] = ["any", "fresh", "stale", "never"];
const SORT_KEYS: readonly SortKey[] = [
  "score_desc",
  "score_asc",
  "coverage_desc",
  "name_asc",
  "updated_desc",
];

export interface TargetQuery {
  q: string;
  view: SavedView;
  recommendation: RecommendationState | null;
  category: StrategicTheme | null;
  country: string | null;
  path: TargetPath | null;
  minScore: number | null;
  coverage: CoverageBand;
  freshness: FreshnessBand;
  sort: SortKey;
  /** Slugs selected for comparison. Bounded at four; more stops being a comparison. */
  compare: string[];
}

export const MAX_COMPARISON = 4;
export const MIN_COMPARISON = 2;

/** Next hands search params as string or string[]; only the first value counts. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

function readOne(params: RawSearchParams, key: string): string | null {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === undefined || value.trim() === "" ? null : value.trim();
}

function readEnum<T extends string>(
  params: RawSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  return readOptionalEnum(params, key, allowed) ?? fallback;
}

/** Same, for filters whose neutral state is "not applied" rather than a value. */
function readOptionalEnum<T extends string>(
  params: RawSearchParams,
  key: string,
  allowed: readonly T[],
): T | null {
  const value = readOne(params, key);
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export function parseTargetQuery(params: RawSearchParams): TargetQuery {
  const minScoreRaw = readOne(params, "minScore");
  const minScore = minScoreRaw === null ? null : Number(minScoreRaw);

  return {
    q: readOne(params, "q") ?? "",
    view: readEnum(params, "view", SAVED_VIEWS, "all"),
    recommendation: readOptionalEnum(params, "recommendation", RECOMMENDATION_STATES),
    category: readOptionalEnum(params, "category", STRATEGIC_THEMES),
    country: readOne(params, "country"),
    path: readOptionalEnum(params, "path", TARGET_PATHS),
    // A non-numeric or out-of-range value is dropped rather than clamped: a
    // silently clamped filter shows a different list from the one the URL says.
    minScore:
      minScore === null || Number.isNaN(minScore) || minScore < 0 || minScore > 100
        ? null
        : minScore,
    coverage: readEnum(params, "coverage", COVERAGE_BANDS, "any"),
    freshness: readEnum(params, "freshness", FRESHNESS_BANDS, "any"),
    sort: readEnum(params, "sort", SORT_KEYS, "score_desc"),
    compare: (readOne(params, "compare") ?? "")
      .split(",")
      .map((slug) => slug.trim())
      .filter((slug) => slug !== "")
      .slice(0, MAX_COMPARISON),
  };
}

/** True when anything beyond the default sort is narrowing the list. */
export function hasActiveFilters(query: TargetQuery): boolean {
  return (
    query.q !== "" ||
    query.view !== "all" ||
    query.recommendation !== null ||
    query.category !== null ||
    query.country !== null ||
    query.path !== null ||
    query.minScore !== null ||
    query.coverage !== "any" ||
    query.freshness !== "any"
  );
}

function matchesSavedView(target: TargetSummary, view: SavedView): boolean {
  switch (view) {
    case "priority":
      return target.recommendation === "priority_diligence";
    case "new":
      // Never assessed. An identity in the universe that nobody has looked at.
      return !target.hasResearch;
    case "needs_research":
      // Assessed, but the evidence is too thin to support a shortlist decision.
      return (
        target.hasResearch &&
        (target.coverage === null || target.coverage < SCORING_THRESHOLDS_V0_3.coverageGateFloor)
      );
    case "watch":
      return target.recommendation === "watch";
    case "blocked":
      return target.recommendation === "blocked";
    case "all":
    default:
      return true;
  }
}

function matchesCoverageBand(coverage: number | null, band: CoverageBand): boolean {
  if (band === "any") {
    return true;
  }
  // "No score at all" is its own band. Treating it as low coverage would imply
  // somebody measured the evidence and found it thin, which nobody has.
  if (coverage === null) {
    return band === "none";
  }
  const { coverageGateFloor, priorityMinCoverage } = SCORING_THRESHOLDS_V0_3;
  if (band === "high") return coverage >= priorityMinCoverage;
  if (band === "medium") return coverage >= coverageGateFloor && coverage < priorityMinCoverage;
  if (band === "low") return coverage < coverageGateFloor;
  return false;
}

function matchesFreshnessBand(
  lastResearchedAt: string | null,
  band: FreshnessBand,
  now: Date,
): boolean {
  if (band === "any") {
    return true;
  }
  if (lastResearchedAt === null) {
    // Never researched is not stale. Nothing has gone off; nothing was done.
    return band === "never";
  }
  const ageDays = (now.getTime() - new Date(lastResearchedAt).getTime()) / 86_400_000;
  if (band === "fresh") return ageDays <= STALE_AFTER_DAYS;
  if (band === "stale") return ageDays > STALE_AFTER_DAYS;
  return false;
}

function matchesText(target: TargetSummary, needle: string): boolean {
  if (needle === "") {
    return true;
  }
  const lower = needle.toLowerCase();
  return (
    target.canonicalName.toLowerCase().includes(lower) ||
    (target.legalEntityName?.toLowerCase().includes(lower) ?? false) ||
    (target.primaryDomain?.toLowerCase().includes(lower) ?? false) ||
    (target.hqCountry?.toLowerCase().includes(lower) ?? false) ||
    (target.thesis?.toLowerCase().includes(lower) ?? false)
  );
}

/**
 * Sorts, keeping unscored companies visible.
 *
 * Every score-based order pushes unscored rows to the end rather than dropping
 * them or treating them as zero. An unassessed company is a real and useful
 * answer to "what should we look at" - it is the work that has not been done -
 * and a ranking that hides it makes the universe look smaller than it is.
 */
function compareTargets(left: TargetSummary, right: TargetSummary, sort: SortKey): number {
  switch (sort) {
    case "score_asc":
    case "score_desc": {
      if (left.normalizedScore === null && right.normalizedScore === null) {
        return left.canonicalName.localeCompare(right.canonicalName);
      }
      if (left.normalizedScore === null) return 1;
      if (right.normalizedScore === null) return -1;
      return sort === "score_desc"
        ? right.normalizedScore - left.normalizedScore
        : left.normalizedScore - right.normalizedScore;
    }
    case "coverage_desc": {
      if (left.coverage === null && right.coverage === null) {
        return left.canonicalName.localeCompare(right.canonicalName);
      }
      if (left.coverage === null) return 1;
      if (right.coverage === null) return -1;
      return right.coverage - left.coverage;
    }
    case "updated_desc": {
      if (left.lastResearchedAt === null && right.lastResearchedAt === null) {
        return left.canonicalName.localeCompare(right.canonicalName);
      }
      if (left.lastResearchedAt === null) return 1;
      if (right.lastResearchedAt === null) return -1;
      return right.lastResearchedAt.localeCompare(left.lastResearchedAt);
    }
    case "name_asc":
    default:
      return left.canonicalName.localeCompare(right.canonicalName);
  }
}

export function applyTargetQuery(
  targets: readonly TargetSummary[],
  query: TargetQuery,
  now: Date = new Date(),
): TargetSummary[] {
  const matched = targets.filter(
    (target) =>
      matchesText(target, query.q) &&
      matchesSavedView(target, query.view) &&
      (query.recommendation === null || target.recommendation === query.recommendation) &&
      (query.category === null || target.themeTags.includes(query.category)) &&
      (query.country === null ||
        (target.hqCountry?.toLowerCase() ?? "") === query.country.toLowerCase()) &&
      (query.path === null || target.path === query.path) &&
      (query.minScore === null ||
        (target.normalizedScore !== null && target.normalizedScore >= query.minScore)) &&
      matchesCoverageBand(target.coverage, query.coverage) &&
      matchesFreshnessBand(target.lastResearchedAt, query.freshness, now),
  );

  return [...matched].sort((left, right) => compareTargets(left, right, query.sort));
}

export interface ActiveFilterChip {
  /** The search param this chip clears when dismissed. */
  param: keyof TargetQuery & string;
  label: string;
  value: string;
}

/**
 * The active filters, as the chips shown above the table.
 *
 * The agent panel reads the same query and prints the same labels, so what the
 * analyst can see and what the agent is told are the same words.
 */
export function describeActiveFilters(query: TargetQuery): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  const push = (param: ActiveFilterChip["param"], label: string, value: string | null) => {
    if (value !== null && value !== "") {
      chips.push({ param, label, value });
    }
  };

  push("q", "Search", query.q);
  push("view", "View", query.view === "all" ? null : query.view.replace(/_/g, " "));
  push("recommendation", "Recommendation", query.recommendation?.replace(/_/g, " ") ?? null);
  push("category", "Category", query.category?.replace(/_/g, " ") ?? null);
  push("country", "Country", query.country);
  push("path", "Path", query.path?.replace(/_/g, " ") ?? null);
  push("minScore", "Min score", query.minScore === null ? null : String(query.minScore));
  push("coverage", "Coverage", query.coverage === "any" ? null : query.coverage);
  push("freshness", "Freshness", query.freshness === "any" ? null : query.freshness);

  return chips;
}
