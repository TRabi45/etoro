import { connection } from "next/server";
import { searchTargets } from "@/src/db/repositories/targets";
import { applyTargetQuery, hasActiveFilters, parseTargetQuery } from "@/src/domain/targets/target-filters";
import { FilterBar } from "@/components/targets/filter-bar";
import { TargetTable } from "@/components/targets/target-table";
import { CompareTray } from "@/components/targets/compare-tray";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

/**
 * The target explorer.
 *
 * The whole universe is read once and refined in memory, rather than pushing
 * every filter into the query. That is a deliberate trade for a bounded
 * internal watchlist: it makes the saved views, coverage bands and freshness
 * bands - none of which map cleanly onto a single SQL predicate - share one
 * tested implementation with the agent's view of the same filters, instead of
 * splitting the definition of "needs research" across a repository and a UI.
 *
 * If the universe ever outgrows a single page this moves into the repository.
 * The seam is `applyTargetQuery`, which takes a list and a query and knows
 * nothing about where either came from.
 */
export default async function TargetsPage(props: PageProps<"/targets">) {
  await connection();

  const searchParams = await props.searchParams;
  const query = parseTargetQuery(searchParams);
  const result = await searchTargets({ limit: 500 });

  if (!result.ok) {
    return (
      <div className="mx-auto w-full max-w-7xl px-6 py-6">
        <h1 className="text-page font-semibold text-primary">Targets</h1>
        <div className="mt-4">
          <ErrorState
            title="The target universe could not be read"
            impact={
              <>
                No part of the list is shown, rather than a partial one, so this page never implies
                the universe is smaller than it is. Filters and comparisons are unavailable until the
                database is reachable.
              </>
            }
            detail={result.problem.message}
          />
        </div>
      </div>
    );
  }

  const all = result.data;
  const matched = applyTargetQuery(all, query);

  // Offered countries are the ones actually present, so the filter never leads
  // to a guaranteed-empty result.
  const countries = [...new Set(all.map((target) => target.hqCountry).filter(Boolean))]
    .sort()
    .map((country) => country as string);

  const selected = query.compare
    .map((slug) => matched.find((target) => target.slug === slug))
    .filter((target): target is NonNullable<typeof target> => target !== undefined);
  const missingSlugs = query.compare.filter(
    (slug) => !selected.some((target) => target.slug === slug),
  );

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 pt-6">
        <div>
          <h1 className="text-page font-semibold text-primary">Targets</h1>
          <p className="mt-1 text-body text-secondary">
            The monitored universe, ranked. Companies with no assessment are kept in the list rather
            than hidden - not having looked is a finding.
          </p>
        </div>

        <FilterBar
          query={query}
          countries={countries}
          matchCount={matched.length}
          totalCount={all.length}
        />
      </div>

      <div className="mx-auto mt-4 w-full max-w-7xl flex-1 px-6 pb-6">
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          {matched.length > 0 ? (
            <TargetTable targets={matched} selected={query.compare} />
          ) : (
            <div className="p-5">
              {all.length === 0 ? (
                <EmptyState
                  icon="targets"
                  title="The universe is empty"
                  nextStep={
                    <>
                      The database is reachable and holds no companies. Seed the bootstrap
                      identities, then run intelligence to begin discovering targets.
                    </>
                  }
                />
              ) : (
                <EmptyState
                  icon="filter"
                  title="No company matches these filters"
                  nextStep={
                    <>
                      {hasActiveFilters(query) ? (
                        <>
                          The universe holds{" "}
                          <span className="tabular font-medium text-primary">{all.length}</span>{" "}
                          {all.length === 1 ? "company" : "companies"}. Clear a filter chip above to
                          widen the search - the list is empty because of the filters, not because
                          the universe is.
                        </>
                      ) : (
                        <>Nothing matched, and no filters are applied.</>
                      )}
                    </>
                  }
                />
              )}
            </div>
          )}
        </div>
      </div>

      <CompareTray selected={selected} missingSlugs={missingSlugs} />
    </div>
  );
}
