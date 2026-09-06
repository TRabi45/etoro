import type { ScoreView } from "@/src/db/repositories/company-profile";

/**
 * The score breakdown.
 *
 * Shows the arithmetic rather than the conclusion. Three numbers are rendered as
 * one statement and never separated, because the acquisition thesis is explicit
 * that separating them is a lie: "A normalized 82 at 55% coverage with a 45-90
 * range is not '82/100.' Display 82 - 55% coverage - 45-90 range."
 *
 * The range is the width of what is still unknown. A target scoring 81 on 85% of
 * the scorecard sits somewhere between 69 and 84 once the unanswered questions
 * are settled, and an analyst deciding what to research next needs that spread
 * more than they need the point estimate.
 *
 * The recommendation is a separate statement from the score, with gate status
 * beside it - a high score with an open gate is still blocked, and the gate is
 * the more decision-relevant fact.
 */

const RECOMMENDATION_TONE: Record<string, string> = {
  // Section 34's labels.
  priority_diligence: "border-emerald-300 bg-emerald-50 text-emerald-900",
  shortlist: "border-sky-300 bg-sky-50 text-sky-900",
  partner: "border-sky-300 bg-sky-50 text-sky-900",
  watch: "border-amber-300 bg-amber-50 text-amber-900",
  do_not_advance: "border-slate-300 bg-slate-50 text-slate-700",
  blocked: "border-red-300 bg-red-50 text-red-900",
  // Retained so a score written under v0.2 still renders.
  acquire: "border-emerald-300 bg-emerald-50 text-emerald-900",
  invest: "border-sky-300 bg-sky-50 text-sky-900",
  build: "border-slate-300 bg-slate-50 text-slate-800",
  monitor: "border-amber-300 bg-amber-50 text-amber-900",
  pass: "border-red-300 bg-red-50 text-red-900",
  research_only: "border-amber-300 bg-amber-50 text-amber-900",
};

const GATE_TONE: Record<string, string> = {
  clear: "text-slate-500",
  unresolved: "text-amber-700",
  triggered: "text-red-700",
};

export function ScoreBreakdown({ score }: { score: ScoreView }) {
  const unscored = score.normalizedScore === null;
  const openGates = score.gates.filter((gate) => gate.state !== "clear");
  const spread =
    score.lowerBound !== null && score.upperBound !== null
      ? score.upperBound - score.lowerBound
      : null;

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Deterministic score
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Calculated in code from the recorded inputs under model version {score.modelVersion}. No
        language model produces or adjusts this number.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-slate-700">Normalised score</span>
            <span className="font-mono text-3xl font-semibold text-slate-900">
              {unscored ? "—" : score.normalizedScore?.toFixed(2)}
            </span>
          </div>

          <dl className="mt-3 border-t border-slate-200 pt-3 text-sm">
            <div className="flex items-baseline justify-between py-1.5">
              <dt className="text-slate-600">Evidence coverage</dt>
              <dd className="font-mono text-slate-900">{(score.coverage * 100).toFixed(2)}%</dd>
            </div>
            <div className="flex items-baseline justify-between py-1.5">
              <dt className="text-slate-600">Uncertainty range</dt>
              <dd className="font-mono text-slate-900">
                {score.lowerBound === null || score.upperBound === null
                  ? "—"
                  : `${score.lowerBound.toFixed(2)} – ${score.upperBound.toFixed(2)}`}
              </dd>
            </div>
          </dl>

          {spread !== null && spread > 0 ? (
            <p className="mt-2 text-xs leading-relaxed text-amber-700">
              {spread.toFixed(0)} points of the scorecard are still unestablished. The lower bound
              assumes every unknown scores zero, the upper bound assumes every unknown scores five.
              Neither is a prediction.
            </p>
          ) : null}

          {unscored ? (
            <p className="mt-2 text-xs text-amber-700">
              Nothing on the scorecard could be scored from the recorded evidence.
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-700">Recommended action</p>
          <p
            className={`mt-2 inline-block rounded-full border px-3 py-1 text-sm font-semibold capitalize ${
              RECOMMENDATION_TONE[score.recommendation] ?? RECOMMENDATION_TONE.watch
            }`}
          >
            {score.recommendation.replace(/_/g, " ")}
          </p>

          {score.bestRoute ? (
            <p className="mt-3 text-xs leading-relaxed text-slate-600">
              The evidence supports <strong className="text-slate-800">{score.bestRoute}</strong>
              {score.secondBestRoute ? (
                <>
                  , with <strong className="text-slate-800">{score.secondBestRoute}</strong> as the
                  next-best route
                </>
              ) : null}
              .{" "}
              {score.buyBeatsAlternatives === false
                ? "Acquiring control does not beat the alternatives on the recorded assessment."
                : "Acquiring control outscores every alternative on the recorded assessment."}
            </p>
          ) : (
            <p className="mt-3 text-xs leading-relaxed text-slate-600">
              The action is a separate decision from the score. A strong fit score does not by
              itself justify acquiring control.
            </p>
          )}

          {openGates.length > 0 ? (
            <div className="mt-3 border-t border-slate-200 pt-3">
              <p className="text-xs font-semibold text-slate-700">Gates needing attention</p>
              <ul className="mt-1.5 space-y-1">
                {openGates.map((gate) => (
                  <li key={gate.key} className="text-xs leading-relaxed">
                    <span className={`font-medium ${GATE_TONE[gate.state]}`}>
                      {gate.label} — {gate.state}
                    </span>
                    <span className="text-slate-600"> · {gate.action}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : score.gates.length > 0 ? (
            <p className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500">
              All {score.gates.length} decision gates are clear.
            </p>
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
                    {row.status === "scored" || row.status === "partially_scored" ? (
                      <span className="font-mono text-slate-900">{row.score}</span>
                    ) : row.status === "unknown" ? (
                      <span className="text-xs font-medium text-amber-700">Unknown</span>
                    ) : (
                      <span className="text-xs font-medium text-slate-400">Not applicable</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-slate-700">
                    {row.contribution === null ? "—" : row.contribution.toFixed(2)}
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
