import type { ScoreView } from "@/src/db/repositories/company-profile";

/**
 * The score breakdown.
 *
 * Shows the arithmetic rather than the conclusion: the normalised positive
 * score, each deduction separately, the weighted coverage behind it, and the
 * dimension-by-dimension contributions. An analyst has to be able to disagree
 * with a number here, and they cannot disagree with something they cannot see.
 *
 * The recommendation is rendered as a separate statement from the score, with
 * the reasons Acquire was ruled out listed explicitly - because a high score is
 * not an instruction to buy, and the blockers are the most decision-relevant
 * thing on the page.
 */

const RECOMMENDATION_TONE: Record<string, string> = {
  acquire: "border-emerald-300 bg-emerald-50 text-emerald-900",
  invest: "border-sky-300 bg-sky-50 text-sky-900",
  partner: "border-sky-300 bg-sky-50 text-sky-900",
  build: "border-slate-300 bg-slate-50 text-slate-800",
  monitor: "border-amber-300 bg-amber-50 text-amber-900",
  pass: "border-red-300 bg-red-50 text-red-900",
  research_only: "border-amber-300 bg-amber-50 text-amber-900",
};

function DeductionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-slate-100 py-1.5 last:border-0">
      <span className="text-slate-600">{label}</span>
      <span className="font-mono text-slate-900">{value}</span>
    </div>
  );
}

export function ScoreBreakdown({ score }: { score: ScoreView }) {
  const isResearchOnly = score.scoreState === "research_only";

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Deterministic score
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Calculated in code from the recorded inputs under model version {score.modelVersion} (
        {score.path.replace(/_/g, "-")} scorecard). No language model produces or adjusts this
        number.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-sm">
            <DeductionRow
              label="Positive score (normalised)"
              value={score.positiveNormalized === null ? "—" : score.positiveNormalized.toFixed(2)}
            />
            <DeductionRow label="Risk deduction" value={`− ${score.riskPenalty.toFixed(2)}`} />
            <DeductionRow
              label="Evidence penalty"
              value={`− ${score.evidencePenalty.toFixed(2)}`}
            />
            <DeductionRow
              label="Weighted evidence coverage"
              value={`${(score.weightedCoverage * 100).toFixed(2)}%`}
            />
          </div>

          <div className="mt-3 flex items-baseline justify-between border-t border-slate-200 pt-3">
            <span className="text-sm font-semibold text-slate-700">Final score</span>
            <span className="font-mono text-2xl font-semibold text-slate-900">
              {isResearchOnly ? "No decision score" : score.finalScore?.toFixed(2)}
            </span>
          </div>
          {isResearchOnly ? (
            <p className="mt-2 text-xs text-amber-700">
              Evidence coverage is below the floor, or a critical gate is unresolved. Research only.
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-700">Recommended action</p>
          <p
            className={`mt-2 inline-block rounded-full border px-3 py-1 text-sm font-semibold capitalize ${
              RECOMMENDATION_TONE[score.recommendation] ?? RECOMMENDATION_TONE.monitor
            }`}
          >
            {score.recommendation.replace(/_/g, " ")}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-slate-600">
            The action is a separate decision from the score. A strong fit score does not by itself
            justify acquiring control.
          </p>

          {score.acquireBlockers.length > 0 ? (
            <div className="mt-3 border-t border-slate-200 pt-3">
              <p className="text-xs font-semibold text-slate-700">Acquire is ruled out because:</p>
              <ul className="mt-1.5 space-y-1">
                {score.acquireBlockers.map((blocker) => (
                  <li key={blocker} className="text-xs leading-relaxed text-slate-600">
                    • {blocker}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {score.breakdown.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">Dimension</th>
                <th className="px-4 py-2 text-right font-medium">Weight</th>
                <th className="px-4 py-2 text-right font-medium">Score</th>
                <th className="px-4 py-2 text-right font-medium">Contribution</th>
              </tr>
            </thead>
            <tbody>
              {score.breakdown.map((row) => (
                <tr key={row.key} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 text-slate-700">{row.label}</td>
                  <td className="px-4 py-2 text-right font-mono text-slate-500">{row.weight}</td>
                  <td className="px-4 py-2 text-right">
                    {/* An unscored dimension is never shown as a zero: unknown
                        stays in the coverage denominator, not-applicable leaves
                        the calculation entirely, and both say so by name. */}
                    {row.status === "scored" ? (
                      <span className="font-mono text-slate-900">{row.score}</span>
                    ) : row.status === "unknown" ? (
                      <span className="text-xs font-medium text-amber-700">Unknown</span>
                    ) : (
                      <span className="text-xs font-medium text-slate-400">Not applicable</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-slate-700">
                    {row.weightedContribution === null ? "—" : row.weightedContribution.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
