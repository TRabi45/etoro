import { connection } from "next/server";
import { getRecentRuns } from "@/src/db/repositories/monitoring-runs";
import { searchTargets } from "@/src/db/repositories/targets";
import { AppShell } from "@/components/shell/app-shell";

/**
 * The shell every screen renders inside.
 *
 * Two reads happen here rather than on each page, because both belong to the
 * chrome rather than to any one screen: the target universe (which backs global
 * search and gives the agent something to resolve names against) and the most
 * recent run (which backs the `Last updated` indicator and the data-health
 * line). A layout is not re-rendered when navigating between its children, so
 * this is one fetch per full page load, not one per navigation.
 *
 * Failures degrade rather than propagate. The repositories return problems as
 * values, so an unreachable database leaves the shell standing with search
 * disabled and the health indicator saying why - which is far more useful than
 * an error page, since the reader can still navigate and read cached screens.
 *
 * `connection()` moves rendering to request time. Without it Next would try to
 * prerender the shell during `next build`, where no database credentials exist,
 * and a build-time snapshot of a monitoring product's freshness indicator would
 * be wrong the moment it was taken.
 */
export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  await connection();

  const [targetsResult, runsResult] = await Promise.all([
    // Bounded: this is an internal watchlist, not a public directory. If it
    // ever outgrows one page, search moves to a server round trip rather than
    // this number growing.
    searchTargets({ limit: 200 }),
    getRecentRuns(1),
  ]);

  const latestRun = runsResult.ok ? (runsResult.data[0] ?? null) : null;

  /**
   * The health line names the specific problem rather than counting warnings.
   * "3 issues" is not something an analyst can act on; "2 sources failed" tells
   * them whether to trust today's coverage.
   */
  let healthWarning: string | null = null;
  if (!targetsResult.ok) {
    healthWarning = "Database unreachable";
  } else if (!runsResult.ok) {
    healthWarning = "Run history unreadable";
  } else if (latestRun?.status === "failed" || latestRun?.status === "blocked") {
    healthWarning = "Last run failed";
  } else if (latestRun?.status === "partial_success") {
    const skipped = latestRun.sourcesSkipped;
    healthWarning = `${skipped} source${skipped === 1 ? "" : "s"} failed`;
  }

  return (
    <AppShell
      targets={targetsResult.ok ? targetsResult.data : []}
      targetsProblem={targetsResult.ok ? null : targetsResult.problem.message}
      lastRunAt={latestRun?.finishedAt ?? latestRun?.startedAt ?? null}
      lastRunStatus={latestRun?.status ?? null}
      healthWarning={healthWarning}
    >
      {children}
    </AppShell>
  );
}
