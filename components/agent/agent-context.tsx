"use client";

import type { ReadonlyURLSearchParams } from "next/navigation";
import type { TargetSummary } from "@/src/db/repositories/targets";
import { activeDestination } from "@/components/shell/navigation";
import { humanizeToken } from "@/components/ui/format";

/**
 * What the analyst is looking at, derived from the URL.
 *
 * The agent is supposed to understand the current screen, the selected company,
 * the active filters and the comparison set without being told. Deriving all of
 * that from the URL rather than from a context provider means it cannot fall
 * out of step with what is rendered: the filters that produced the table are
 * the same search params read here, so there is no second copy to drift.
 *
 * The filter labels are also the ones the UI prints in its own filter chips, so
 * what the agent is told matches what the analyst can see, word for word.
 */

/** Search params that narrow a list, and the label each carries in the UI. */
const FILTER_PARAM_LABELS: Record<string, string> = {
  q: "Search",
  view: "Saved view",
  recommendation: "Recommendation",
  category: "Category",
  country: "Country",
  path: "Target path",
  minScore: "Minimum score",
  coverage: "Evidence coverage",
  freshness: "Freshness",
};

export interface AgentContext {
  /** One of the fixed screen names the chat route accepts, or null. */
  screen: string | null;
  companySlug: string | null;
  companyName: string | null;
  filters: { label: string; value: string }[];
  comparisonSlugs: string[];
}

export function readAgentContext({
  pathname,
  searchParams,
  targets,
}: {
  pathname: string;
  searchParams: ReadonlyURLSearchParams;
  targets: readonly TargetSummary[];
}): AgentContext {
  const onProfile = pathname.startsWith("/companies/");
  const companySlug = onProfile ? (pathname.split("/")[2] ?? null) : null;
  const companyName =
    targets.find((target) => target.slug === companySlug)?.canonicalName ?? null;

  const filters = Object.entries(FILTER_PARAM_LABELS)
    .map(([param, label]) => {
      const value = searchParams.get(param);
      return value && value.trim() !== "" ? { label, value: humanizeToken(value) ?? value } : null;
    })
    .filter((filter): filter is { label: string; value: string } => filter !== null);

  const comparisonSlugs = (searchParams.get("compare") ?? "")
    .split(",")
    .map((slug) => slug.trim())
    // Only slugs that exist in the loaded universe are forwarded. The server
    // checks them again; this just avoids sending obvious noise.
    .filter((slug) => slug !== "" && targets.some((target) => target.slug === slug))
    .slice(0, 4);

  return {
    screen: onProfile ? "Company profile" : (activeDestination(pathname)?.label ?? null),
    companySlug,
    companyName,
    filters,
    comparisonSlugs,
  };
}

/**
 * The header's context line.
 *
 * Shown so the reader can confirm what the agent thinks it is looking at before
 * trusting an answer that depends on it. An agent that is quietly wrong about
 * the filter set gives confidently wrong answers, and this is the cheapest
 * possible check against that.
 */
export function AgentContextLine({ context }: { context: AgentContext }) {
  const parts: string[] = [];

  if (context.companyName) {
    parts.push(context.companyName);
  } else if (context.screen) {
    parts.push(context.screen);
  }

  if (context.comparisonSlugs.length >= 2) {
    parts.push(`comparing ${context.comparisonSlugs.length}`);
  }

  if (context.filters.length > 0) {
    parts.push(
      context.filters.length === 1
        ? `${context.filters[0].label.toLowerCase()} filter`
        : `${context.filters.length} filters`,
    );
  }

  if (parts.length === 0) {
    return null;
  }

  return (
    <p className="mt-0.5 truncate text-caption text-secondary" title={parts.join(" · ")}>
      Context: {parts.join(" · ")}
    </p>
  );
}
