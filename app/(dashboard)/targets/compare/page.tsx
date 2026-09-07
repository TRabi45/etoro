import Link from "next/link";
import { connection } from "next/server";
import { getCompanyProfileWithEvidence } from "@/src/db/repositories/company-profile";
import {
  buildComparison,
  collectComparisonWarnings,
  type ComparisonSubject,
} from "@/src/domain/targets/comparison";
import { MAX_COMPARISON, MIN_COMPARISON } from "@/src/domain/targets/target-filters";
import { RecommendationBadge } from "@/components/ui/recommendation-badge";
import { ScoreDisplay } from "@/components/ui/score-display";
import { FreshnessLabel } from "@/components/ui/freshness-label";
import { UnknownValue } from "@/components/ui/unknown-value";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Notice } from "@/components/ui/notice";
import { Icon } from "@/components/ui/icon";

/**
 * Side-by-side comparison of two to four targets.
 *
 * A dedicated route rather than a modal, so a comparison is a URL an analyst
 * can send to a colleague or reopen tomorrow.
 *
 * The alignment - and every judgement about what may honestly sit in adjacent
 * cells - happens in `buildComparison`, which is pure and tested. This file
 * renders the result and makes sure the warnings it produced are impossible to
 * scroll past: they appear once at the top as a summary and again on the row
 * they belong to.
 */
export default async function ComparePage(props: PageProps<"/targets/compare">) {
  await connection();

  const searchParams = await props.searchParams;
  const raw = searchParams.slugs;
  const slugs = (Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? ""))
    .split(",")
    .map((slug) => slug.trim())
    .filter((slug) => slug !== "")
    .slice(0, MAX_COMPARISON);

  if (slugs.length < MIN_COMPARISON) {
    return (
      <ComparisonShell>
        <EmptyState
          icon="compare"
          title="Select at least two companies"
          nextStep={
            <>
              A comparison needs {MIN_COMPARISON} to {MAX_COMPARISON} companies. Choose them with the
              checkboxes on the target list.
            </>
          }
          action={
            <Link
              href="/targets"
              className="inline-flex h-10 items-center gap-1.5 rounded-control border border-border-strong bg-surface px-3.5 text-body font-medium text-primary motion-standard transition-colors hover:bg-surface-subtle"
            >
              Back to targets
              <Icon name="chevron-right" size={16} />
            </Link>
          }
        />
      </ComparisonShell>
    );
  }

  const results = await Promise.all(slugs.map((slug) => getCompanyProfileWithEvidence(slug)));

  // A failed read and a slug that does not exist are different problems and get
  // different words. Neither empties the page: whatever loaded is still worth
  // comparing, as long as the reader is told what is missing.
  const failures: string[] = [];
  const notFound: string[] = [];
  const subjects: ComparisonSubject[] = [];

  results.forEach((result, index) => {
    const slug = slugs[index];
    if (!result.ok) {
      failures.push(`${slug}: ${result.problem.message}`);
      return;
    }
    if (result.data === null) {
      notFound.push(slug);
      return;
    }
    subjects.push({ slug, name: result.data.company.canonicalName, profile: result.data });
  });

  if (subjects.length < MIN_COMPARISON) {
    return (
      <ComparisonShell>
        <ErrorState
          title="Not enough companies could be loaded to compare"
          impact={
            <>
              {subjects.length === 0
                ? "None of the selected companies could be read."
                : "Only one of the selected companies could be read, and one company is not a comparison."}{" "}
              Nothing partial is shown here, because a two-column table with one real column would
              read as a comparison.
            </>
          }
          detail={[...failures, ...notFound.map((slug) => `${slug}: no such company`)].join(" | ")}
        />
      </ComparisonShell>
    );
  }

  const sections = buildComparison(subjects);
  const warnings = collectComparisonWarnings(sections);

  return (
    <ComparisonShell>
      <div className="flex flex-col gap-4">
        {failures.length > 0 || notFound.length > 0 ? (
          <ErrorState
            tone="partial"
            title="Some selections are missing from this comparison"
            impact={
              <>
                {notFound.length > 0 ? (
                  <>
                    No company exists for {notFound.join(", ")}.{" "}
                  </>
                ) : null}
                {failures.length > 0 ? <>Some profiles could not be read. </> : null}
                The columns below are complete for the companies that did load.
              </>
            }
            detail={failures.join(" | ") || null}
          />
        ) : null}

        {warnings.length > 0 ? (
          <Notice tone="warning" title={`${warnings.length} field${warnings.length === 1 ? "" : "s"} cannot be read straight across`}>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </Notice>
        ) : null}

        {/* The decision row sits above the table: recommendation, score,
            coverage and freshness are what the reader came to compare, and
            burying them in row seven of a field list would be perverse. */}
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${subjects.length}, minmax(0, 1fr))` }}
        >
          {subjects.map((subject) => (
            <div key={subject.slug} className="rounded-card border border-border bg-surface p-4">
              <Link
                href={`/companies/${subject.slug}`}
                className="text-section font-semibold text-primary hover:underline"
              >
                {subject.name}
              </Link>
              <p className="mt-0.5 text-caption text-tertiary">
                {subject.profile.company.legalEntityName ?? "Legal entity unknown"}
              </p>

              <div className="mt-3">
                <RecommendationBadge recommendation={subject.profile.score?.recommendation ?? null} />
              </div>

              <div className="mt-3">
                <ScoreDisplay
                  score={subject.profile.score?.normalizedScore ?? null}
                  coverage={subject.profile.score?.coverage ?? null}
                  lowerBound={subject.profile.score?.lowerBound ?? null}
                  upperBound={subject.profile.score?.upperBound ?? null}
                  variant="full"
                />
              </div>

              <div className="mt-3">
                <FreshnessLabel lastResearchedAt={subject.profile.company.lastResearchedAt} />
              </div>
            </div>
          ))}
        </div>

        {sections
          .filter((section) => section.rows.length > 0)
          .map((section) => (
            <section key={section.title} aria-labelledby={`section-${section.title}`}>
              <h2
                id={`section-${section.title}`}
                className="text-section font-semibold text-primary"
              >
                {section.title}
              </h2>

              <div className="mt-2 overflow-x-auto rounded-card border border-border bg-surface">
                <table className="w-full border-collapse text-table">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th scope="col" className="w-52 px-4 py-2.5 font-medium text-secondary">
                        Field
                      </th>
                      {subjects.map((subject) => (
                        <th
                          key={subject.slug}
                          scope="col"
                          className="px-4 py-2.5 font-medium text-secondary"
                        >
                          {subject.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row) => (
                      <tr key={row.key} className="border-b border-border last:border-b-0 align-top">
                        <th
                          scope="row"
                          className="px-4 py-3 text-left font-medium text-primary capitalize"
                        >
                          {row.label}
                          {row.warning ? (
                            <span
                              className="mt-1 flex items-start gap-1 text-caption font-normal text-warning"
                              title={row.warning}
                            >
                              <Icon name="alert-circle" size={13} className="mt-0.5" />
                              Not directly comparable
                            </span>
                          ) : null}
                        </th>
                        {row.cells.map((cell, index) => (
                          <td key={`${row.key}-${subjects[index].slug}`} className="px-4 py-3">
                            {cell.kind === "value" ? (
                              <>
                                <span className="text-primary">{cell.text}</span>
                                {cell.note ? (
                                  <span className="mt-0.5 block text-caption text-tertiary">
                                    {cell.note}
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              <UnknownValue
                                kind={cell.kind === "not_applicable" ? "not_applicable" : "unknown"}
                                reason={cell.note}
                              />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {section.rows.some((row) => row.warning) ? (
                  <p className="border-t border-border bg-warning-soft px-4 py-2 text-caption text-primary">
                    Rows marked “Not directly comparable” rest on different measurement periods or
                    definitions. Read the note under each figure before drawing a conclusion.
                  </p>
                ) : null}
              </div>
            </section>
          ))}
      </div>
    </ComparisonShell>
  );
}

function ComparisonShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6">
      <div>
        <Link
          href="/targets"
          className="inline-flex items-center gap-1 text-body text-secondary motion-standard transition-colors hover:text-primary"
        >
          <Icon name="chevron-left" size={16} />
          Targets
        </Link>
        <h1 className="mt-1 text-page font-semibold text-primary">Compare targets</h1>
        <p className="mt-1 text-body text-secondary">
          Fields are aligned across companies. A gap is shown as a gap, and figures that rest on
          different periods or definitions are marked rather than placed side by side in silence.
        </p>
      </div>
      {children}
    </div>
  );
}
