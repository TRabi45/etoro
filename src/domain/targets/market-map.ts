import { STRATEGIC_THEMES, type StrategicTheme } from "@/src/config/taxonomy";
import type { TargetSummary } from "@/src/db/repositories/targets";

/**
 * The market map as an analytical matrix.
 *
 * Rows are always the four approved strategic themes - the taxonomy, not
 * whatever happens to be in the data - so a theme with nothing in it shows as
 * an empty row. That is the most useful cell on the grid: an approved category
 * where eToro is tracking nobody is a coverage gap, and a matrix built only
 * from rows that exist would hide it.
 *
 * Columns are switchable, because "where are the candidates" is three different
 * questions: by geography, by the operating shape a deal would take, or by
 * where things stand in the pipeline.
 *
 * Every cell reports a count, the highest score in it and the best evidence
 * coverage behind that score. A count on its own would let a cell full of
 * unassessed identities look like depth.
 */

export type MarketMapGrouping = "geography" | "path" | "status";

export const MARKET_MAP_GROUPINGS: readonly {
  value: MarketMapGrouping;
  label: string;
  hint: string;
}[] = [
  {
    value: "geography",
    label: "Geography",
    hint: "Headquarters country. Geography is a vector, not a theme - and never automatically positive.",
  },
  {
    value: "path",
    label: "Target path",
    hint: "Platform, tuck-in or hybrid: the operating shape a deal would take.",
  },
  {
    value: "status",
    label: "Pipeline status",
    hint: "The current recommendation, which is where a target stands rather than what it is.",
  },
];

export interface MarketMapCell {
  /** The column this cell belongs to; null is the explicit "not recorded" column. */
  columnKey: string;
  count: number;
  /** Highest score among scored companies in the cell, or null when none is scored. */
  highestScore: number | null;
  /** Coverage behind that highest score, so the number is never read alone. */
  coverageOfHighest: number | null;
  /** How many companies in the cell have never been assessed. */
  unassessedCount: number;
  /** The search params that open Targets filtered to exactly this cell. */
  filterQuery: string;
}

export interface MarketMapRow {
  theme: StrategicTheme;
  cells: MarketMapCell[];
  total: number;
}

export interface MarketMapMatrix {
  grouping: MarketMapGrouping;
  columns: { key: string; label: string }[];
  rows: MarketMapRow[];
  /**
   * Companies that carry no theme tag at all. Reported rather than dropped: an
   * unclassified company is invisible on a matrix keyed by theme, and a market
   * map that silently loses rows is worse than one that admits the gap.
   */
  unclassifiedCount: number;
}

const THEME_LABELS: Record<StrategicTheme, string> = {
  trading: "Trading",
  investing: "Investing",
  wealth_management: "Wealth management",
  neo_banking: "Neo-banking",
};

export function themeLabel(theme: StrategicTheme): string {
  return THEME_LABELS[theme];
}

/** The column a company falls into, or null when the value is not recorded. */
function columnFor(target: TargetSummary, grouping: MarketMapGrouping): string | null {
  if (grouping === "geography") {
    return target.hqCountry;
  }
  if (grouping === "path") {
    return target.path;
  }
  return target.recommendation;
}

/** The Targets search params that reproduce a cell exactly. */
function filterQueryFor(
  theme: StrategicTheme,
  grouping: MarketMapGrouping,
  columnKey: string,
): string {
  const params = new URLSearchParams({ category: theme });
  if (columnKey !== UNRECORDED) {
    if (grouping === "geography") params.set("country", columnKey);
    if (grouping === "path") params.set("path", columnKey);
    if (grouping === "status") params.set("recommendation", columnKey);
  }
  return params.toString();
}

/** The column key for companies whose grouping value was never established. */
export const UNRECORDED = "__unrecorded__";

export function buildMarketMap(
  targets: readonly TargetSummary[],
  grouping: MarketMapGrouping,
): MarketMapMatrix {
  const columnKeys = new Set<string>();
  for (const target of targets) {
    columnKeys.add(columnFor(target, grouping) ?? UNRECORDED);
  }

  // Named columns sort alphabetically; the unrecorded column is pinned last so
  // it reads as a residue rather than as a peer category.
  const orderedKeys = [...columnKeys]
    .filter((key) => key !== UNRECORDED)
    .sort((left, right) => left.localeCompare(right));
  if (columnKeys.has(UNRECORDED)) {
    orderedKeys.push(UNRECORDED);
  }

  const columns = orderedKeys.map((key) => ({
    key,
    label: key === UNRECORDED ? "Not recorded" : key.replace(/_/g, " "),
  }));

  const rows: MarketMapRow[] = STRATEGIC_THEMES.map((theme) => {
    const inTheme = targets.filter((target) => target.themeTags.includes(theme));

    const cells: MarketMapCell[] = orderedKeys.map((columnKey) => {
      const members = inTheme.filter(
        (target) => (columnFor(target, grouping) ?? UNRECORDED) === columnKey,
      );

      const scored = members.filter(
        (member): member is TargetSummary & { normalizedScore: number } =>
          member.normalizedScore !== null,
      );
      const best = scored.reduce<(TargetSummary & { normalizedScore: number }) | null>(
        (winner, member) =>
          winner === null || member.normalizedScore > winner.normalizedScore ? member : winner,
        null,
      );

      return {
        columnKey,
        count: members.length,
        highestScore: best?.normalizedScore ?? null,
        coverageOfHighest: best?.coverage ?? null,
        unassessedCount: members.filter((member) => !member.hasResearch).length,
        filterQuery: filterQueryFor(theme, grouping, columnKey),
      };
    });

    return { theme, cells, total: inTheme.length };
  });

  return {
    grouping,
    columns,
    rows,
    unclassifiedCount: targets.filter((target) => target.themeTags.length === 0).length,
  };
}

export function parseGrouping(value: string | string[] | undefined): MarketMapGrouping {
  const raw = Array.isArray(value) ? value[0] : value;
  return MARKET_MAP_GROUPINGS.some((option) => option.value === raw)
    ? (raw as MarketMapGrouping)
    : "geography";
}
