/**
 * Loading state for the dashboard.
 *
 * The company list is rendered at request time from the database, so there is a
 * real interval where nothing is available yet. Showing the page frame with
 * placeholder rows keeps the layout stable instead of flashing an empty screen
 * that looks like "no companies found".
 */
export default function DashboardLoading() {
  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          eToro Corporate Development
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">M&amp;A Intelligence Agent</h1>
      </header>
      <section className="mt-8" aria-busy="true" aria-live="polite">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Monitored companies
        </h2>
        <p className="sr-only">Loading the monitored universe.</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((row) => (
            <li
              key={row}
              className="h-28 animate-pulse rounded-lg border border-slate-200 bg-slate-100"
            />
          ))}
        </ul>
      </section>
    </main>
  );
}
