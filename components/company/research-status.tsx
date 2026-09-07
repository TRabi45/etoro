import type { ResearchState } from "@/src/db/repositories/company-tiers";
import type { ResearchTier } from "@/src/domain/tiering/tier-policy";

/**
 * Read-only labels for persisted research allocation and execution state.
 *
 * The pipeline owns the policy and persistence; the UI only exposes the stored
 * result without inferring a state from the presence of a score or assessment.
 */

const TIER_LABELS: Record<ResearchTier, string> = {
  indexed: "Indexed",
  monitored: "Monitored",
  deep: "Deep research",
};

const TIER_TONES: Record<ResearchTier, string> = {
  indexed: "border-slate-200 bg-slate-50 text-slate-700",
  monitored: "border-sky-200 bg-sky-50 text-sky-800",
  deep: "border-violet-200 bg-violet-50 text-violet-800",
};

const STATE_LABELS: Record<ResearchState, string> = {
  pending: "Research pending",
  running: "Research running",
  complete: "Research complete",
  partial: "Research partial",
  blocked: "Research blocked",
  failed: "Research failed",
};

const STATE_TONES: Record<ResearchState, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  running: "border-sky-200 bg-sky-50 text-sky-800",
  complete: "border-emerald-200 bg-emerald-50 text-emerald-800",
  partial: "border-amber-200 bg-amber-50 text-amber-800",
  blocked: "border-orange-200 bg-orange-50 text-orange-800",
  failed: "border-red-200 bg-red-50 text-red-800",
};

function Pill({ children, tone }: { children: React.ReactNode; tone: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>
      {children}
    </span>
  );
}

export function ResearchTierBadge({ tier }: { tier: ResearchTier }) {
  return <Pill tone={TIER_TONES[tier]}>Tier: {TIER_LABELS[tier]}</Pill>;
}

export function ResearchStateBadge({ state }: { state: ResearchState }) {
  return <Pill tone={STATE_TONES[state]}>{STATE_LABELS[state]}</Pill>;
}
