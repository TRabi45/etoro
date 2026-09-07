import type { CompanyProfileView } from "@/src/db/repositories/company-profile";
import { CitationChip } from "@/components/company/citation-chip";
import { Value } from "@/components/ui/value";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { formatDate, humanizeToken } from "@/components/ui/format";

/**
 * Strategic fit, fundamentals and the reported figures.
 *
 * Reached after the decision summary, so this tab answers "on what basis" -
 * the analysis behind the conclusion rather than the conclusion itself.
 *
 * Every figure goes through `Value`, which is what makes "a missing number is
 * never a zero" structurally true here: this file has no way to render a gap as
 * anything other than Unknown, Not applicable or a data defect, because it
 * never touches the number directly.
 */

export function OverviewTab({ profile }: { profile: CompanyProfileView }) {
  const { assessment, fundamentals, metrics, company } = profile;

  if (!assessment && !fundamentals && metrics.length === 0) {
    return (
      <EmptyState
        icon="briefing"
        title="No analysis has been written"
        nextStep={
          <>
            This company has identity but no assessment, no fundamentals and no reported figures.
            Refresh it to run a bounded research pass, which will populate this tab if the sources
            support it.
          </>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {assessment?.isStub ? (
        <Notice tone="warning" title="This assessment came from a synthetic payload">
          <p>
            It was written by a deliberately labelled stub run for the vertical slice, not by real
            research. Treat every conclusion on this profile as an illustration of the pipeline
            rather than a finding about this company.
          </p>
        </Notice>
      ) : null}

      {assessment ? (
        <section aria-labelledby="fit-heading">
          <h3 id="fit-heading" className="text-section font-semibold text-primary">
            Strategic fit
          </h3>
          <dl className="mt-3 flex flex-col gap-3">
            {[
              { key: "synergies", label: "Synergies", value: assessment.synergies },
              { key: "risks", label: "Risks", value: assessment.risks },
            ]
              .filter((field) => field.value !== null)
              .map((field) => (
                <div
                  key={field.key}
                  className="rounded-card border border-border bg-surface px-4 py-3"
                >
                  <dt className="text-caption font-semibold tracking-wide text-secondary uppercase">
                    {field.label}
                  </dt>
                  <dd className="mt-1 text-body leading-relaxed text-primary">
                    {field.value}
                    <CitationChip numbers={assessment.citationsByRole[field.key] ?? []} />
                  </dd>
                </div>
              ))}
          </dl>

          <p className="mt-3 text-caption text-secondary">
            Assessed against thesis version{" "}
            <span className="font-medium text-primary">{assessment.thesisVersion}</span>.
          </p>
        </section>
      ) : null}

      <section aria-labelledby="identity-heading">
        <h3 id="identity-heading" className="text-section font-semibold text-primary">
          Classification and research allocation
        </h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Research tier">
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge
                tone="neutral"
                title="How much research budget this company is allocated. Set by policy, not inferred from whether a score exists."
              >
                {humanizeToken(company.researchTier)}
              </Badge>
              {company.researchTierConfidence ? (
                <Badge tone="muted">
                  {humanizeToken(company.researchTierConfidence)} confidence
                </Badge>
              ) : null}
            </span>
            {company.researchTierReason ? (
              <p className="mt-1.5 text-caption leading-relaxed text-secondary">
                {company.researchTierReason}
              </p>
            ) : null}
          </Field>

          <Field label="Research state">
            <Badge tone="neutral">{humanizeToken(company.researchState)}</Badge>
          </Field>

          <Field label="Record origin">
            <Badge tone="muted" title="Whether this row is seed identity or something the pipeline produced.">
              {humanizeToken(company.recordOrigin)}
            </Badge>
          </Field>

          <Field label="Next scheduled refresh">
            <span className="tabular text-body text-primary">
              {formatDate(company.nextRefreshAt) ?? (
                <span className="text-tertiary">Not scheduled</span>
              )}
            </span>
          </Field>
        </dl>
      </section>

      {fundamentals ? (
        <section aria-labelledby="fundamentals-heading">
          <h3 id="fundamentals-heading" className="text-section font-semibold text-primary">
            Fundamentals
          </h3>
          <p className="mt-1 text-body text-secondary">
            Read against the{" "}
            <span className="font-medium text-primary">
              {humanizeToken(fundamentals.archetype)}
            </span>{" "}
            archetype, version {fundamentals.version}. Different business shapes are judged on
            different measures, so the archetype decides which questions apply at all.
          </p>

          <dl className="mt-3 flex flex-col gap-3">
            {[
              { key: "revenue_quality", label: "Revenue quality", value: fundamentals.revenueQuality },
              { key: "growth_assessment", label: "Growth", value: fundamentals.growthAssessment },
              { key: "margin_assessment", label: "Margin", value: fundamentals.marginAssessment },
              { key: "burn_runway", label: "Burn and runway", value: fundamentals.burnRunway },
              { key: "concentration", label: "Concentration", value: fundamentals.concentration },
            ].map((field) => (
              <div key={field.key} className="rounded-card border border-border bg-surface px-4 py-3">
                <dt className="text-caption font-semibold tracking-wide text-secondary uppercase">
                  {field.label}
                </dt>
                <dd className="mt-1 text-body leading-relaxed">
                  {field.value ? (
                    <span className="text-primary">
                      {field.value}
                      <CitationChip numbers={fundamentals.citationsByField[field.key] ?? []} />
                    </span>
                  ) : (
                    <span className="text-tertiary">
                      Not assessed. No source supported a judgement on this measure.
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>

          {fundamentals.unknowns.length > 0 ? (
            <p className="mt-3 text-caption leading-relaxed text-secondary">
              {fundamentals.unknowns.length} unknown
              {fundamentals.unknowns.length === 1 ? "" : "s"} were named while assessing
              fundamentals. They are listed on the Evidence tab.
            </p>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="metrics-heading">
        <h3 id="metrics-heading" className="text-section font-semibold text-primary">
          Reported figures
        </h3>

        {metrics.length === 0 ? (
          <p className="mt-3 rounded-card border border-border bg-surface px-4 py-3 text-body text-secondary">
            No figures have been recorded for this company. Nothing here has been rounded to zero -
            there is genuinely nothing on file.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-card border border-border bg-surface">
            <table className="w-full min-w-[34rem] border-collapse text-table">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="px-4 py-2.5 font-medium text-secondary">
                    Measure
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium text-secondary">
                    Value
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium text-secondary">
                    Period
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-secondary">
                    Confidence
                  </th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((metric) => (
                  <tr key={metric.id} className="border-b border-border last:border-b-0">
                    <th scope="row" className="px-4 py-2.5 text-left font-medium text-primary capitalize">
                      {metric.metricType.replace(/_/g, " ")}
                    </th>
                    <td className="px-3 py-2.5">
                      <Value
                        status={metric.valueStatus}
                        value={metric.valueNumeric}
                        unit={metric.valueUnit}
                        currency={metric.currency}
                      />
                      <CitationChip numbers={metric.citations} />
                    </td>
                    <td className="tabular px-3 py-2.5 text-secondary">
                      {metric.periodLabel ?? formatDate(metric.asOfDate) ?? (
                        <span
                          className="text-tertiary"
                          title="No measurement period was recorded, so this figure cannot be confirmed as covering any particular window."
                        >
                          No period
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {metric.confidence ? (
                        <Badge tone={metric.confidence === "low" ? "warning" : "neutral"}>
                          {humanizeToken(metric.confidence)}
                        </Badge>
                      ) : (
                        <span className="text-caption text-tertiary">Unrecorded</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3">
      <dt className="text-caption font-semibold tracking-wide text-secondary uppercase">{label}</dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  );
}
