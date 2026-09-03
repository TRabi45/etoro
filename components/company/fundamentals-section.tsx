import { Citations } from "@/components/company/citation";
import { Value } from "@/components/ui/value";
import type { FundamentalsView, MetricView } from "@/src/db/repositories/company-profile";

/**
 * Fundamental and commercial analysis.
 *
 * Two halves: the observed metrics, and the narrative reading of them. Both
 * carry citations, because a judgement about a company's economics is only worth
 * as much as the evidence under it.
 *
 * Missing measures are listed rather than omitted. A profile that simply left
 * out revenue would read as though revenue were not part of the picture, when in
 * fact it is the single most important thing nobody has published.
 */

function humanize(text: string): string {
  return text.replace(/_/g, " ").replace(/^./, (character) => character.toUpperCase());
}

function NarrativeRow({
  label,
  text,
  citations,
}: {
  label: string;
  text: string | null;
  citations: number[];
}) {
  return (
    <div className="border-b border-slate-100 py-2.5 last:border-0">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      {text ? (
        <p className="mt-1 text-sm leading-relaxed text-slate-700">
          {text}
          <Citations numbers={citations} />
        </p>
      ) : (
        <p className="mt-1 text-sm font-medium text-amber-700">Unknown</p>
      )}
    </div>
  );
}

export function FundamentalsSection({
  fundamentals,
  metrics,
}: {
  fundamentals: FundamentalsView | null;
  metrics: MetricView[];
}) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Fundamental &amp; commercial analysis
      </h2>

      {metrics.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">Measure</th>
                <th className="px-4 py-2 font-medium">Value</th>
                <th className="px-4 py-2 font-medium">As of</th>
                <th className="px-4 py-2 font-medium">Sources</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric) => (
                <tr key={metric.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 text-slate-700">{humanize(metric.metricType)}</td>
                  <td className="px-4 py-2">
                    <Value
                      status={metric.valueStatus}
                      value={metric.valueNumeric}
                      unit={metric.valueUnit}
                      currency={metric.currency}
                    />
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {metric.asOfDate ?? <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-2">
                    {metric.citations.length > 0 ? (
                      <Citations numbers={metric.citations} />
                    ) : (
                      <span className="text-xs text-slate-400">no source</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {fundamentals ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-2">
            <p className="text-xs text-slate-500">
              Archetype: <span className="text-slate-700">{humanize(fundamentals.archetype)}</span>{" "}
              · version {fundamentals.version}
            </p>
            {fundamentals.evidenceCoverage !== null ? (
              <p className="text-xs text-slate-500">
                Evidence coverage:{" "}
                <span className="font-mono text-slate-700">
                  {(fundamentals.evidenceCoverage * 100).toFixed(2)}%
                </span>
              </p>
            ) : null}
          </div>

          <NarrativeRow
            label="Revenue quality"
            text={fundamentals.revenueQuality}
            citations={fundamentals.citationsByField.revenue_quality ?? []}
          />
          <NarrativeRow
            label="Growth"
            text={fundamentals.growthAssessment}
            citations={fundamentals.citationsByField.growth_assessment ?? []}
          />
          <NarrativeRow
            label="Margins"
            text={fundamentals.marginAssessment}
            citations={fundamentals.citationsByField.margin_assessment ?? []}
          />
          <NarrativeRow
            label="Burn &amp; runway"
            text={fundamentals.burnRunway}
            citations={fundamentals.citationsByField.burn_runway ?? []}
          />
          <NarrativeRow
            label="Concentration"
            text={fundamentals.concentration}
            citations={fundamentals.citationsByField.concentration ?? []}
          />

          {/* Gaps are deliberately not listed here. The metrics table above
              already marks each missing measure Unknown, and the profile has a
              single aggregated "Open questions and data gaps" section that
              collects unknowns from every layer - claims, metrics, fundamentals
              and assessment. Repeating the fundamentals subset here printed the
              same three lines twice on one page. */}
          {fundamentals.unknowns.length > 0 ? (
            <p className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-500">
              {fundamentals.unknowns.length} further{" "}
              {fundamentals.unknowns.length === 1 ? "gap is" : "gaps are"} listed under open
              questions below.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          No fundamental analysis has been produced yet.
        </p>
      )}
    </section>
  );
}
