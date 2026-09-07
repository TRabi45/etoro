import Link from "next/link";
import { connection } from "next/server";
import { searchTargets } from "@/src/db/repositories/targets";
import {
  MARKET_MAP_GROUPINGS,
  UNRECORDED,
  buildMarketMap,
  parseGrouping,
  themeLabel,
} from "@/src/domain/targets/market-map";
import { CoverageBadge } from "@/components/ui/coverage-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Notice } from "@/components/ui/notice";
import { Icon } from "@/components/ui/icon";

/**
 * Coverage by theme, and where the gaps are.
 *
 * An analytical matrix rather than a decorative world map: the question is
 * "which approved categories are we tracking, and how well", and a map answers
 * a question nobody asked while making the answer harder to read.
 *
 * Every cell links into Targets with the filters that reproduce it, so the map
 * is a way into the list rather than a separate destination that has to be
 * re-derived by hand.
 */
export default async function MarketMapPage(props: PageProps<"/market-map">) {
  await connection();

  const searchParams = await props.searchParams;
  const grouping = parseGrouping(searchParams.grouping);
  const result = await searchTargets({ limit: 500 });

  if (!result.ok) {
    return (
      <PageShell grouping={grouping}>
        <ErrorState
          title="The market map could not be built"
          impact={
            <>
              The map is derived from the target universe, which could not be read. Nothing is shown
              rather than an empty grid, because an empty grid reads as &ldquo;no coverage
              anywhere&rdquo;.
            </>
          }
          detail={result.problem.message}
        />
      </PageShell>
    );
  }

  const targets = result.data;
  const matrix = buildMarketMap(targets, grouping);

  if (targets.length === 0) {
    return (
      <PageShell grouping={grouping}>
        <EmptyState
          icon="market-map"
          title="The universe is empty"
          nextStep={
            <>
              There are no companies to map. Seed the bootstrap identities and run intelligence to
              begin discovering targets.
            </>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell grouping={grouping}>
      <div className="flex flex-col gap-4">
        <Notice tone="info" title="Geography is a vector, not a merit">
          <p>
            A country column is a fact about where a company is, not evidence that entering that
            market is worth anything. Local access counts only when a company brings incremental
            customers, product, permissions or operations - which is a judgement recorded on the
            profile, never inferred from this grid.
          </p>
        </Notice>

        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full border-collapse text-table">
            <caption className="sr-only">
              Monitored companies by strategic theme and {grouping}. Each cell links to the matching
              target list.
            </caption>
            <thead>
              <tr className="border-b border-border text-left">
                <th
                  scope="col"
                  className="sticky left-0 bg-surface px-4 py-2.5 font-medium text-secondary"
                >
                  Theme
                </th>
                {matrix.columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className="px-3 py-2.5 font-medium text-secondary capitalize"
                    title={
                      column.key === UNRECORDED
                        ? "Companies whose value for this grouping has never been established."
                        : undefined
                    }
                  >
                    {column.label}
                  </th>
                ))}
                <th scope="col" className="px-4 py-2.5 font-medium text-secondary">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row) => (
                <tr key={row.theme} className="border-b border-border last:border-b-0">
                  <th
                    scope="row"
                    className="sticky left-0 bg-surface px-4 py-3 text-left font-medium text-primary"
                  >
                    {themeLabel(row.theme)}
                  </th>

                  {row.cells.map((cell) => (
                    <td key={cell.columnKey} className="px-3 py-3 align-top">
                      {cell.count === 0 ? (
                        // An approved theme with nobody in it is the most useful
                        // cell on the grid, so it is drawn as a stated zero
                        // rather than left blank.
                        <span className="text-tertiary" title="No company tracked in this cell.">
                          &mdash;
                        </span>
                      ) : (
                        <Link
                          href={`/targets?${cell.filterQuery}`}
                          className="block rounded-control border border-border bg-surface-subtle px-2.5 py-2 motion-standard transition-colors hover:border-border-strong hover:bg-surface"
                        >
                          <span className="tabular block text-body font-semibold text-primary">
                            {cell.count}
                          </span>
                          {cell.highestScore === null ? (
                            <span className="block text-caption text-tertiary">None scored</span>
                          ) : (
                            <span className="mt-0.5 flex flex-wrap items-center gap-1">
                              <span className="tabular text-caption text-secondary">
                                top {Math.round(cell.highestScore)}
                              </span>
                              <CoverageBadge coverage={cell.coverageOfHighest} compact />
                            </span>
                          )}
                          {cell.unassessedCount > 0 ? (
                            <span
                              className="mt-0.5 block text-caption text-warning"
                              title="Companies here that no research pass has assessed."
                            >
                              {cell.unassessedCount} unassessed
                            </span>
                          ) : null}
                        </Link>
                      )}
                    </td>
                  ))}

                  <td className="tabular px-4 py-3 align-top font-medium text-primary">
                    {row.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {matrix.unclassifiedCount > 0 ? (
          <Notice tone="warning" title="Some companies do not appear on this grid">
            <p>
              <span className="tabular font-medium text-primary">{matrix.unclassifiedCount}</span>{" "}
              {matrix.unclassifiedCount === 1 ? "company carries" : "companies carry"} no strategic
              theme, so {matrix.unclassifiedCount === 1 ? "it has" : "they have"} no row here. The
              matrix is keyed by theme, and a company nobody has classified is invisible on it - it
              is counted here rather than silently dropped.
            </p>
            <p className="mt-1.5">
              <Link href="/targets?view=new" className="text-info hover:underline">
                Open the unassessed companies
              </Link>
            </p>
          </Notice>
        ) : null}
      </div>
    </PageShell>
  );
}

function PageShell({
  grouping,
  children,
}: {
  grouping: ReturnType<typeof parseGrouping>;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-6">
      <div>
        <h1 className="text-page font-semibold text-primary">Market Map</h1>
        <p className="mt-1 max-w-prose text-body text-secondary">
          The four approved strategic themes against a switchable grouping. Every cell reports how
          many companies sit there, the best score among them and the evidence behind it - a count
          alone would let a cell full of unassessed identities look like depth.
        </p>
      </div>

      <nav aria-label="Column grouping" className="flex flex-wrap items-center gap-1.5">
        <span className="text-caption text-secondary">Group columns by</span>
        {MARKET_MAP_GROUPINGS.map((option) => {
          const active = option.value === grouping;
          return (
            <Link
              key={option.value}
              href={`/market-map?grouping=${option.value}`}
              aria-current={active ? "page" : undefined}
              title={option.hint}
              className={`flex h-8 items-center gap-1.5 rounded-control border px-3 text-caption font-medium motion-standard transition-colors ${
                active
                  ? "border-brand/40 bg-brand-soft text-primary"
                  : "border-border bg-surface text-secondary hover:border-border-strong hover:text-primary"
              }`}
            >
              {active ? <Icon name="check-circle" size={13} /> : null}
              {option.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
