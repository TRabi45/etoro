import { connection } from "next/server";
import { ChatPanel } from "@/components/chat/chat-panel";
import { CompanyList } from "@/components/company/company-list";
import { EventsFeed } from "@/components/dashboard/events-feed";
import { RunStatus } from "@/components/dashboard/run-status";
import { Notice } from "@/components/ui/notice";
import { listCompanies } from "@/src/db/repositories/companies";
import { getRecentEvents } from "@/src/db/repositories/events";
import { getRecentRuns } from "@/src/db/repositories/monitoring-runs";

/** The feed's window. Long enough to have content, short enough to be "recent". */
function sinceDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The dashboard shell.
 *
 * This page exists to prove one thing end to end: the UI renders rows that came
 * out of Supabase through the repository layer. It is intentionally small. There
 * is no score, no profile, no chat and no AI output in this milestone, and no
 * placeholder pretending otherwise.
 *
 * `connection()` moves rendering to request time. Without it Next would try to
 * prerender this page during `next build`, where no database credentials exist -
 * and a build-time snapshot of a monitoring product would be wrong anyway.
 */
export default async function DashboardPage() {
  await connection();
  // Fetched together: three independent reads, and one failing should not delay
  // the other two.
  const [result, runs, events] = await Promise.all([
    listCompanies(),
    getRecentRuns(1),
    getRecentEvents({ sinceDate: sinceDaysAgo(30), limit: 10 }),
  ]);

  const latestRun = runs.ok ? (runs.data[0] ?? null) : null;

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          eToro Corporate Development
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">M&amp;A Intelligence Agent</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Monitored universe, served from the database through the repository layer. The monitoring
          pipeline fetches sources, extracts claims and events, and resolves company identities;
          every record below traces back to a run and a source.
        </p>
      </header>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Last monitoring run
        </h2>
        <div className="mt-4">
          {latestRun ? (
            <RunStatus run={latestRun} />
          ) : (
            <Notice tone="neutral" title="The pipeline has not run yet">
              <p>
                Start one with <code className="font-mono">pnpm monitor</code>, or POST to{" "}
                <code className="font-mono">/api/monitor/run</code>. It runs daily on a schedule
                once deployed.
              </p>
            </Notice>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Recent events
        </h2>
        <div className="mt-4">
          {events.ok && events.data.length > 0 ? (
            <EventsFeed events={events.data} />
          ) : (
            <Notice tone="neutral" title="No events recorded in the last 30 days">
              <p>
                Nothing has been <em>recorded</em>, which is not the same as nothing having
                happened. Events appear here once a monitoring run extracts them from a fetched
                source.
              </p>
            </Notice>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Monitored companies
        </h2>

        <div className="mt-4">
          {!result.ok && result.problem.kind === "configuration" ? (
            <Notice tone="warning" title="Supabase is not configured">
              <p>{result.problem.message}</p>
              <p className="mt-2">
                Run <code className="font-mono">pnpm db:start</code>, copy the printed values into{" "}
                <code className="font-mono">.env.local</code>, then{" "}
                <code className="font-mono">pnpm db:reset &amp;&amp; pnpm db:seed</code>.
              </p>
            </Notice>
          ) : null}

          {!result.ok && result.problem.kind === "database" ? (
            <Notice tone="error" title="The database could not be reached">
              <p>{result.problem.message}</p>
              <p className="mt-2">
                Nothing is shown rather than a partial list, so this page never implies the universe
                is smaller than it is.
              </p>
            </Notice>
          ) : null}

          {result.ok && result.data.length === 0 ? (
            <Notice tone="neutral" title="No companies yet">
              <p>
                The database is reachable and empty. Seed the bootstrap identities with{" "}
                <code className="font-mono">pnpm db:seed</code>.
              </p>
            </Notice>
          ) : null}

          {result.ok && result.data.length > 0 ? <CompanyList companies={result.data} /> : null}
        </div>
      </section>

      {/* No company is selected here, so the agent will ask which company the
          user means rather than guessing at an implicit reference. */}
      <ChatPanel />
    </main>
  );
}
