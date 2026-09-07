import type { CompanyProfileView } from "@/src/db/repositories/company-profile";
import { CitationChip } from "@/components/company/citation-chip";
import { RecommendationBadge } from "@/components/ui/recommendation-badge";
import { Icon, type IconName } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { humanizeToken } from "@/components/ui/format";

/**
 * The decision, before the biography.
 *
 * The first thing on a profile is what an analyst should do about this company
 * and why - not when it was founded. Six fields, in the order the argument is
 * actually made: what we would be buying, what gap it closes, why now, which
 * route wins, the strongest case against, and the one question worth answering
 * next.
 *
 * Two of those are load-bearing and are never omitted to make the page read
 * better:
 *
 *   - **The counter-thesis.** A recommendation with no argument against it is
 *     not a recommendation, it is advocacy. When none has been recorded, the
 *     section says so rather than disappearing - a target nobody has argued
 *     against is in a weaker position, not a stronger one.
 *   - **The route.** Section 23 makes buying one option among five. The route
 *     is shown beside the recommendation because a company can score well and
 *     still be a partnership, and the score alone would hide that.
 */

interface DecisionField {
  key: string;
  label: string;
  icon: IconName;
  value: string | null;
  /** Citation numbers for this conclusion, from the assessment's claim links. */
  citations: number[];
  /** What it means that this is missing - never just "no data". */
  absence: string;
}

export function DecisionSummary({ profile }: { profile: CompanyProfileView }) {
  const { assessment, score, evidence } = profile;

  if (!assessment && !score) {
    return (
      <EmptyState
        icon="spark"
        title="No decision has been reached yet"
        nextStep={
          <>
            This company is an identity in the universe with no assessment and no score. There is
            nothing to agree or disagree with yet - a research pass has to gather evidence before a
            recommendation can exist.
          </>
        }
      />
    );
  }

  const citationsFor = (role: string): number[] => assessment?.citationsByRole[role] ?? [];

  /**
   * The next diligence question.
   *
   * Taken from the recorded unknowns rather than generated, because the useful
   * version of this field is "the specific thing nobody has established", and
   * inventing a plausible-sounding question would be exactly the kind of
   * confident filler the product exists to avoid.
   */
  const nextQuestion = evidence.unknowns[0] ?? null;

  const fields: DecisionField[] = [
    {
      key: "thesis",
      label: "Acquisition thesis",
      icon: "targets",
      value: assessment?.strategicFitSummary ?? null,
      citations: citationsFor("strategic_fit_summary"),
      absence: "No thesis has been written. Nobody has yet stated what eToro would be buying.",
    },
    {
      key: "gap",
      label: "Gap closed for eToro",
      icon: "plus",
      value: assessment?.gapClosed ?? null,
      citations: citationsFor("gap_closed"),
      absence:
        "No capability gap has been named. Without one, this is a company eToro finds interesting rather than one it needs.",
    },
    {
      key: "why_now",
      label: "Why now",
      icon: "clock",
      value: assessment?.whyNow ?? null,
      citations: citationsFor("why_now"),
      absence:
        "No timing argument has been recorded. Absent one, there is no reason this cannot wait.",
    },
    {
      key: "counter",
      label: "Strongest counter-thesis",
      icon: "alert-triangle",
      value: assessment?.counterThesis ?? null,
      citations: citationsFor("counter_thesis"),
      absence:
        "Nobody has argued against this target yet. That is a gap in the analysis, not a point in the target's favour.",
    },
    {
      key: "next_question",
      label: "Highest-value next diligence question",
      icon: "help",
      value: nextQuestion,
      citations: [],
      absence:
        "No unknowns are recorded, which usually means the evidence has not been examined closely enough to find any.",
    },
  ];

  return (
    <section
      aria-labelledby="decision-summary-heading"
      className="rounded-card border border-border bg-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 id="decision-summary-heading" className="text-section font-semibold text-primary">
          Decision summary
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <RecommendationBadge recommendation={score?.recommendation ?? null} />
          {score?.bestRoute ? (
            <span
              className="text-caption text-secondary"
              title="Section 23: buying is one route among build, partner, invest and watch. This is the route the model ranked first."
            >
              Best route:{" "}
              <span className="font-medium text-primary">{humanizeToken(score.bestRoute)}</span>
              {score.secondBestRoute ? (
                <span className="text-tertiary">
                  {" "}
                  (then {humanizeToken(score.secondBestRoute)})
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>

      {/*
       * When buying loses to another route, that is the single most important
       * sentence on the page and it goes above every field.
       */}
      {score?.buyBeatsAlternatives === false ? (
        <p className="border-b border-border bg-warning-soft px-5 py-3 text-body leading-relaxed text-primary">
          <Icon name="alert-circle" size={16} className="mr-1.5 inline text-warning" />
          Buying does not beat the alternatives for this company. However it scores, the recommended
          route is not an acquisition.
        </p>
      ) : null}

      <dl className="divide-y divide-border">
        {fields.map((field) => (
          <div key={field.key} className="px-5 py-4">
            <dt className="flex items-center gap-1.5 text-caption font-semibold tracking-wide text-secondary uppercase">
              <Icon name={field.icon} size={14} />
              {field.label}
            </dt>
            <dd className="mt-1.5 text-body leading-relaxed">
              {field.value ? (
                <span className="text-primary">
                  {field.value}
                  <CitationChip numbers={field.citations} />
                </span>
              ) : (
                <span className="text-secondary">{field.absence}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
