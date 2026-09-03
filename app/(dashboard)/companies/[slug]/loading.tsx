/**
 * Loading state for a company profile.
 *
 * Without this, the profile route inherits the dashboard's loading fallback,
 * which is shaped like the company *list* - so opening a profile briefly showed
 * a "Monitored companies" heading above a grid of card placeholders, describing
 * a page the reader was not going to get. The skeleton below matches the profile
 * it stands in for: header, then stacked analysis sections.
 */
export default function CompanyProfileLoading() {
  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10" aria-busy="true" aria-live="polite">
      <p className="sr-only">Loading the company profile.</p>

      <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />

      <header className="mt-4 border-b border-slate-200 pb-6">
        <div className="h-7 w-56 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-4 w-40 animate-pulse rounded bg-slate-100" />
        <div className="mt-3 flex gap-1.5">
          {[0, 1, 2].map((tag) => (
            <div key={tag} className="h-5 w-28 animate-pulse rounded-full bg-slate-100" />
          ))}
        </div>
      </header>

      {[0, 1, 2].map((section) => (
        <section key={section} className="mt-8">
          <div className="h-3 w-48 animate-pulse rounded bg-slate-200" />
          <div className="mt-4 h-40 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
        </section>
      ))}
    </main>
  );
}
