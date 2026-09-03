import { Citations, ClaimKindBadge } from "@/components/company/citation";
import type { AssessmentView } from "@/src/db/repositories/company-profile";
import type { EvidencePacket } from "@/src/validation/evidence-packet";

/**
 * The strategic assessment, and the disagreements underneath it.
 *
 * Every conclusion cites the claims it rests on. The counter-thesis is given the
 * same weight as the rationale rather than being buried, because a memo that
 * only argues one way is not decision support.
 *
 * Contradictions get their own block. Where two sources disagree, both figures
 * are shown side by side with their citations: the system's job is to surface
 * the disagreement, not to quietly pick the more convenient number.
 */

function Conclusion({
  label,
  text,
  citations,
}: {
  label: string;
  text: string | null;
  citations: number[];
}) {
  if (!text) {
    return null;
  }
  return (
    <div className="border-b border-slate-100 py-2.5 last:border-0">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm leading-relaxed text-slate-700">
        {text}
        <Citations numbers={citations} />
      </p>
    </div>
  );
}

export function AssessmentSection({
  assessment,
  evidence,
}: {
  assessment: AssessmentView | null;
  evidence: EvidencePacket;
}) {
  if (!assessment) {
    return (
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Strategic assessment
        </h2>
        <p className="mt-3 text-sm text-slate-500">No assessment has been produced yet.</p>
      </section>
    );
  }

  const citationsFor = (role: string): number[] => assessment.citationsByRole[role] ?? [];

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Strategic assessment
      </h2>
      <p className="mt-1 text-xs text-slate-500">Thesis version {assessment.thesisVersion}</p>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <Conclusion
          label="Strategic fit"
          text={assessment.strategicFitSummary}
          citations={citationsFor("strategic_fit_summary")}
        />
        <Conclusion
          label="Gap closed"
          text={assessment.gapClosed}
          citations={citationsFor("gap_closed")}
        />
        <Conclusion label="Why now" text={assessment.whyNow} citations={citationsFor("why_now")} />
        <Conclusion
          label="Synergies"
          text={assessment.synergies}
          citations={citationsFor("synergies")}
        />
        <Conclusion label="Risks" text={assessment.risks} citations={citationsFor("risks")} />

        {assessment.counterThesis ? (
          <div className="mt-3 rounded border border-slate-300 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Counter-thesis
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-700">
              {assessment.counterThesis}
              <Citations numbers={citationsFor("counter_thesis")} />
            </p>
          </div>
        ) : null}
      </div>

      {evidence.contradictions.length > 0 ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-800">
            Sources disagree
          </p>
          <p className="mt-1 text-xs text-red-900">
            Both records are kept. Neither figure has replaced the other, and confidence is reduced
            accordingly.
          </p>
          {evidence.contradictions.map((contradiction) => (
            <div key={contradiction.topic} className="mt-3">
              <p className="text-xs font-semibold text-red-900">
                {contradiction.topic.replace(/_/g, " ")}
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {contradiction.claims.map((claim) => (
                  <li key={claim.claimId} className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="text-slate-800">{claim.statement}</span>
                    <ClaimKindBadge kind={claim.kind} />
                    <Citations numbers={claim.citations.map((citation) => citation.index)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      {evidence.unknowns.length > 0 ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            Open questions and data gaps
          </p>
          <ul className="mt-1.5 space-y-1">
            {evidence.unknowns.map((unknown) => (
              <li key={unknown} className="text-xs leading-relaxed text-amber-900">
                • {unknown}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
