import type { RecommendationState } from "@/src/config/taxonomy";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { IconName } from "@/components/ui/icon";

/**
 * The recommendation, rendered as the decision it is.
 *
 * Two vocabularies reach this component, because `scores` holds rows from two
 * models and a stored score has to keep meaning what it meant when written:
 *
 *   - v0.3 (section 34): the actions an analyst takes - priority diligence,
 *     shortlist, watch, research only, do not advance, blocked, partner.
 *   - v0.2: routes describing a form of ownership - acquire, invest, build,
 *     monitor, pass. Historical only; no current score carries these.
 *
 * Both are handled rather than one being coerced into the other, so an archived
 * v0.2 row still reads honestly instead of being relabelled into a decision the
 * old model never made.
 *
 * Every label carries a plain-language definition on hover, because an
 * executive reading over an analyst's shoulder should not have to learn the
 * scoring vocabulary to understand the conclusion. Tone is a second channel
 * only - the words alone are sufficient.
 */

interface Presentation {
  label: string;
  tone: BadgeTone;
  icon: IconName;
  definition: string;
}

const PRESENTATION: Record<RecommendationState, Presentation> = {
  // --- v0.3, section 34 -----------------------------------------------------
  priority_diligence: {
    label: "Priority diligence",
    tone: "brand",
    icon: "check-circle",
    definition:
      "Strong fit, evidence coverage above the priority floor and no unresolved gate. Ready for a diligence workstream.",
  },
  shortlist: {
    label: "Shortlist",
    tone: "info",
    icon: "targets",
    definition:
      "A credible acquisition candidate that is not yet cleared for priority diligence - usually thin coverage or an open gate.",
  },
  partner: {
    label: "Partner",
    tone: "info",
    icon: "compare",
    definition:
      "The capability is better obtained by partnership than by purchase, whatever the score. Buying is not the recommended route.",
  },
  watch: {
    label: "Watch",
    tone: "neutral",
    icon: "clock",
    definition:
      "On the conditional watchlist. Not a shortlist: either the score sits in the middle band, or building or investing beats buying today.",
  },
  research_only: {
    label: "Research only",
    tone: "warning",
    icon: "alert-circle",
    definition:
      "Evidence is too thin to support a shortlist decision. More research is the next step, not a recommendation.",
  },
  do_not_advance: {
    label: "Do not advance",
    tone: "muted",
    icon: "minus",
    definition:
      "Scores below the conditional-watchlist floor. Not a fit for eToro on current evidence.",
  },
  blocked: {
    label: "Blocked",
    tone: "danger",
    icon: "alert-triangle",
    definition:
      "A hard gate is triggered. This overrides the score entirely - a high score with a triggered gate remains blocked.",
  },
  // --- v0.2, historical rows only -------------------------------------------
  acquire: {
    label: "Acquire",
    tone: "brand",
    icon: "check-circle",
    definition: "Historical v0.2 route. Superseded by the section 34 labels.",
  },
  invest: {
    label: "Invest",
    tone: "info",
    icon: "spark",
    definition: "Historical v0.2 route. Superseded by the section 34 labels.",
  },
  build: {
    label: "Build",
    tone: "neutral",
    icon: "plus",
    definition: "Historical v0.2 route. Superseded by the section 34 labels.",
  },
  monitor: {
    label: "Monitor",
    tone: "neutral",
    icon: "clock",
    definition: "Historical v0.2 route. Superseded by the section 34 labels.",
  },
  pass: {
    label: "Pass",
    tone: "muted",
    icon: "minus",
    definition: "Historical v0.2 route. Superseded by the section 34 labels.",
  },
};

export interface RecommendationBadgeProps {
  /**
   * Null when no score from the active model exists. That is a real state -
   * "nobody has assessed this yet" - and is rendered as such rather than being
   * hidden or defaulted to the mildest recommendation.
   */
  recommendation: RecommendationState | null;
}

export function RecommendationBadge({ recommendation }: RecommendationBadgeProps) {
  if (recommendation === null) {
    return (
      <Badge
        tone="muted"
        icon="minus"
        title="No score exists under the active model. The company has not been assessed, which is different from having been assessed and rejected."
      >
        Not yet scored
      </Badge>
    );
  }

  const { label, tone, icon, definition } = PRESENTATION[recommendation];
  return (
    <Badge tone={tone} icon={icon} title={definition}>
      {label}
    </Badge>
  );
}
