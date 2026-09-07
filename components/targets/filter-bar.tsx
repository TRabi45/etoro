"use client";

import { useEffect, useState } from "react";
import {
  describeActiveFilters,
  hasActiveFilters,
  type TargetQuery,
} from "@/src/domain/targets/target-filters";
import { STRATEGIC_THEMES, TARGET_PATHS } from "@/src/config/taxonomy";
import { useTargetQuery } from "@/components/targets/use-target-query";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { humanizeToken } from "@/components/ui/format";

/**
 * Search, saved views, filters, sort and the active-filter chips.
 *
 * Saved views come first because they are how an analyst actually starts -
 * "what is blocked", "what have we not looked at" - and each one is a single
 * click rather than a combination the reader has to assemble from four
 * dropdowns.
 *
 * The chips below the controls exist because a filtered table and an empty
 * universe look identical. Anything narrowing the list is named, and every chip
 * clears its own filter, so a reader who cannot find a company they know exists
 * can see why in one glance.
 *
 * The search box is the one control that is not applied on every keystroke: it
 * writes to the URL after a short pause, so a five-letter company name is one
 * history entry and one re-render rather than five.
 */

const SAVED_VIEWS = [
  { value: "all", label: "All", hint: "Every company in the monitored universe." },
  {
    value: "priority",
    label: "Priority",
    hint: "Clears the score floor, the coverage floor and every gate.",
  },
  { value: "new", label: "New", hint: "In the universe, never assessed." },
  {
    value: "needs_research",
    label: "Needs research",
    hint: "Assessed, but on evidence below the floor for any shortlist decision.",
  },
  { value: "watch", label: "Watch", hint: "On the conditional watchlist, not a shortlist." },
  { value: "blocked", label: "Blocked", hint: "A hard gate is triggered, whatever the score." },
] as const;

const SORT_OPTIONS = [
  { value: "score_desc", label: "Score, highest first" },
  { value: "score_asc", label: "Score, lowest first" },
  { value: "coverage_desc", label: "Evidence coverage" },
  { value: "updated_desc", label: "Recently researched" },
  { value: "name_asc", label: "Name, A to Z" },
] as const;

const COVERAGE_OPTIONS = [
  { value: "any", label: "Any coverage" },
  { value: "high", label: "High (75% and up)" },
  { value: "medium", label: "Medium (60-75%)" },
  { value: "low", label: "Low (below 60%)" },
  { value: "none", label: "Not scored" },
] as const;

const FRESHNESS_OPTIONS = [
  { value: "any", label: "Any freshness" },
  { value: "fresh", label: "Verified within 180 days" },
  { value: "stale", label: "Stale" },
  { value: "never", label: "Never researched" },
] as const;

export interface FilterBarProps {
  query: TargetQuery;
  /** Countries actually present in the universe, so the list offers no dead ends. */
  countries: readonly string[];
  /** How many rows the current query matched, shown beside the controls. */
  matchCount: number;
  totalCount: number;
}

export function FilterBar({ query, countries, matchCount, totalCount }: FilterBarProps) {
  const { setParam, clearFilters } = useTargetQuery();
  const [searchDraft, setSearchDraft] = useState(query.q);

  // The draft is local so typing stays responsive; the URL catches up 300ms
  // after the reader stops. Without the pause every keystroke would be a
  // navigation and a server render.
  useEffect(() => {
    if (searchDraft === query.q) {
      return;
    }
    const timer = setTimeout(() => setParam("q", searchDraft), 300);
    return () => clearTimeout(timer);
  }, [searchDraft, query.q, setParam]);

  const chips = describeActiveFilters(query);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Icon
            name="search"
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tertiary"
          />
          <input
            type="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search name, entity, domain, country or thesis"
            aria-label="Search targets"
            className="h-10 w-full rounded-control border border-border-control bg-surface pl-9 pr-3 text-body text-primary outline-none placeholder:text-tertiary focus:border-secondary"
          />
        </div>

        <Select
          label="Sort by"
          value={query.sort}
          onChange={(value) => setParam("sort", value)}
          options={SORT_OPTIONS}
          icon="sort"
        />
      </div>

      <div
        role="group"
        aria-label="Saved views"
        className="flex flex-wrap gap-1.5 border-b border-border pb-3"
      >
        {SAVED_VIEWS.map((view) => {
          const active = query.view === view.value;
          return (
            <button
              key={view.value}
              type="button"
              title={view.hint}
              aria-pressed={active}
              onClick={() => setParam("view", view.value === "all" ? null : view.value)}
              className={`h-8 rounded-control border px-3 text-caption font-medium motion-standard transition-colors ${
                active
                  ? "border-brand/40 bg-brand-soft text-primary"
                  : "border-border bg-surface text-secondary hover:border-border-strong hover:text-primary"
              }`}
            >
              {view.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          label="Category"
          value={query.category ?? ""}
          onChange={(value) => setParam("category", value || null)}
          options={[
            { value: "", label: "Any category" },
            ...STRATEGIC_THEMES.map((theme) => ({
              value: theme,
              label: humanizeToken(theme) ?? theme,
            })),
          ]}
        />

        <Select
          label="Target path"
          value={query.path ?? ""}
          onChange={(value) => setParam("path", value || null)}
          options={[
            { value: "", label: "Any path" },
            ...TARGET_PATHS.map((path) => ({ value: path, label: humanizeToken(path) ?? path })),
          ]}
        />

        <Select
          label="Country"
          value={query.country ?? ""}
          onChange={(value) => setParam("country", value || null)}
          options={[
            { value: "", label: "Any country" },
            ...countries.map((country) => ({ value: country, label: country })),
          ]}
        />

        <Select
          label="Coverage"
          value={query.coverage}
          onChange={(value) => setParam("coverage", value === "any" ? null : value)}
          options={COVERAGE_OPTIONS}
        />

        <Select
          label="Freshness"
          value={query.freshness}
          onChange={(value) => setParam("freshness", value === "any" ? null : value)}
          options={FRESHNESS_OPTIONS}
        />

        <label className="flex items-center gap-1.5 text-caption text-secondary">
          <span>Min score</span>
          <input
            type="number"
            min={0}
            max={100}
            value={query.minScore ?? ""}
            onChange={(event) => setParam("minScore", event.target.value || null)}
            aria-label="Minimum score"
            className="tabular h-8 w-16 rounded-control border border-border-control bg-surface px-2 text-caption text-primary outline-none focus:border-secondary"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-caption text-secondary" aria-live="polite">
          <span className="tabular font-medium text-primary">{matchCount}</span> of{" "}
          <span className="tabular">{totalCount}</span>{" "}
          {totalCount === 1 ? "company" : "companies"}
          {hasActiveFilters(query) ? " match the active filters" : " in the universe"}
        </p>

        {chips.map((chip) => (
          <button
            key={`${chip.param}-${chip.value}`}
            type="button"
            onClick={() => setParam(chip.param, null)}
            className="inline-flex items-center gap-1.5 rounded-pill border border-border-strong bg-surface-subtle px-2.5 py-1 text-caption text-primary motion-standard transition-colors hover:border-secondary"
            aria-label={`Clear the ${chip.label} filter`}
          >
            <span className="text-tertiary">{chip.label}:</span>
            <span className="font-medium">{chip.value}</span>
            <Icon name="close" size={12} />
          </button>
        ))}

        {hasActiveFilters(query) ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear all
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A labelled native select.
 *
 * Native on purpose: it is keyboard accessible, screen-reader correct and
 * touch-friendly for free, and a custom listbox would have to re-earn all three
 * to gain nothing an analyst cares about.
 */
function Select<T extends string>({
  label,
  value,
  onChange,
  options,
  icon,
}: {
  label: string;
  value: string;
  onChange: (value: T) => void;
  options: readonly { value: string; label: string }[];
  icon?: "sort";
}) {
  return (
    <label className="flex items-center gap-1.5 text-caption text-secondary">
      {icon ? <Icon name={icon} size={15} className="text-tertiary" /> : null}
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        aria-label={label}
        className="h-8 rounded-control border border-border-control bg-surface px-2 text-caption text-primary outline-none focus:border-secondary"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
