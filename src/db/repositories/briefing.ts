import { getRecentEvents, type EventSummary } from "@/src/db/repositories/events";
import { getRecentRuns, type MonitoringRunSummary } from "@/src/db/repositories/monitoring-runs";
import { searchTargets, type TargetSummary } from "@/src/db/repositories/targets";
import { SCORING_THRESHOLDS_V0_3 } from "@/src/config/scoring/v0-3";

/**
 * The Monday-morning read model.
 *
 * A composition over three existing repositories rather than a fourth set of
 * queries - the same pattern `getMarketMap` uses. Nothing here talks to the
 * database directly, so the rules those repositories enforce (only the active
 * scoring model counts; screened-out rows are not targets) apply here for free
 * instead of being reimplemented and drifting.
 *
 * The one piece of real judgement is `needsAttention`, and it is deliberately
 * conservative: an item earns a place by an explicit, checkable property - a
 * blocking gate, a high-materiality event, a coverage floor breach - never by a
 * score being merely high. A briefing that cries wolf is one an analyst stops
 * reading, and this list is capped at three for the same reason.
 *
 * Partial failure is a first-class outcome. If events are unreadable but
 * targets are fine, the brief returns the targets and names what is missing,
 * because a blank page is a worse answer than an incomplete one that says so.
 */

/** How far back "what changed" reaches. Long enough to survive a quiet weekend. */
const MATERIAL_CHANGE_WINDOW_DAYS = 14;

/** The briefing shows five opportunities; more is a list, not a brief. */
const TOP_OPPORTUNITY_COUNT = 5;

const NEEDS_ATTENTION_COUNT = 3;

export type AttentionReason =
  "blocked_gate" | "material_event" | "thin_evidence" | "priority_ready";

export interface AttentionItem {
  reason: AttentionReason;
  /** The company this concerns, when it resolves to one in the universe. */
  target: TargetSummary | null;
  /** Short statement of what happened or what is true. */
  headline: string;
  /** Why it matters to eToro specifically, never a summary of the article. */
  whyItMatters: string;
  /** The event behind it, when the item came from the feed. */
  event: EventSummary | null;
  /** The single next step. One, not a list. */
  recommendedAction: string;
}

export interface SystemStatus {
  lastRun: MonitoringRunSummary | null;
  /** Named source failures from the most recent run, in plain language. */
  failures: string[];
  /** Companies whose research has aged past the staleness threshold. */
  staleTargetCount: number;
  /** Set when part of the brief could not be read at all. */
  degraded: string[];
}

export interface MorningBrief {
  /** Distinct sources the most recent run actually fetched. */
  sourcesReviewed: number;
  materialChanges: EventSummary[];
  /** Companies the pipeline discovered but nobody has assessed yet. */
  newTargets: TargetSummary[];
  /** The one thing to read first, or null when genuinely nothing stands out. */
  leadItem: AttentionItem | null;
  needsAttention: AttentionItem[];
  topOpportunities: TargetSummary[];
  systemStatus: SystemStatus;
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Builds the brief.
 *
 * Never returns a failure of its own: the three reads are independent, and one
 * of them failing degrades the brief rather than emptying it. What could not be
 * read is named in `systemStatus.degraded` so the page can say so out loud.
 */
export async function getMorningBrief(): Promise<MorningBrief> {
  const [targetsResult, runsResult, eventsResult] = await Promise.all([
    searchTargets({ limit: 200 }),
    getRecentRuns(1),
    getRecentEvents({ sinceDate: daysAgoIso(MATERIAL_CHANGE_WINDOW_DAYS), limit: 25 }),
  ]);

  const degraded: string[] = [];
  if (!targetsResult.ok) {
    degraded.push("The target universe could not be read, so rankings are missing.");
  }
  if (!runsResult.ok) {
    degraded.push("Run history could not be read, so pipeline status is unknown.");
  }
  if (!eventsResult.ok) {
    degraded.push("The event feed could not be read, so recent changes are missing.");
  }

  const targets = targetsResult.ok ? targetsResult.data : [];
  const events = eventsResult.ok ? eventsResult.data : [];
  const lastRun = runsResult.ok ? (runsResult.data[0] ?? null) : null;

  const bySlug = new Map(targets.map((target) => [target.slug, target]));

  // Highest materiality first, then most recent. An event with no materiality
  // recorded sorts last rather than being dropped: unrated is not unimportant,
  // it is unrated.
  const materialityRank = { high: 0, medium: 1, low: 2 } as const;
  const materialChanges = [...events].sort((left, right) => {
    const leftRank = left.materiality ? materialityRank[left.materiality] : 3;
    const rightRank = right.materiality ? materialityRank[right.materiality] : 3;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return (right.eventDate ?? right.publishedAt ?? "").localeCompare(
      left.eventDate ?? left.publishedAt ?? "",
    );
  });

  const needsAttention = buildAttentionItems(targets, materialChanges, bySlug);

  return {
    sourcesReviewed: lastRun?.sourcesFetched ?? 0,
    materialChanges,
    newTargets: targets.filter((target) => !target.hasResearch),
    leadItem: needsAttention[0] ?? null,
    needsAttention: needsAttention.slice(0, NEEDS_ATTENTION_COUNT),
    topOpportunities: targets
      .filter((target) => target.normalizedScore !== null)
      .slice(0, TOP_OPPORTUNITY_COUNT),
    systemStatus: {
      lastRun,
      failures: lastRun?.warnings ?? [],
      staleTargetCount: 0,
      degraded,
    },
  };
}

/**
 * Ranks what deserves the analyst's attention, most consequential first.
 *
 * The order is the decision order, not the data order. A blocked target is a
 * standing problem that outranks today's news; a high-materiality event
 * outranks a target that is merely ready; and "ready for diligence" outranks
 * "we have not looked hard enough yet".
 */
function buildAttentionItems(
  targets: readonly TargetSummary[],
  events: readonly EventSummary[],
  bySlug: ReadonlyMap<string, TargetSummary>,
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const target of targets) {
    if (target.recommendation === "blocked") {
      items.push({
        reason: "blocked_gate",
        target,
        headline: `${target.canonicalName} is blocked by a hard gate`,
        whyItMatters:
          "A triggered gate overrides the score entirely. Nothing downstream should treat this as an available target until the gate is cleared.",
        event: null,
        recommendedAction: "Open the score tab and read which gate triggered.",
      });
    }
  }

  for (const event of events) {
    if (event.materiality !== "high") {
      continue;
    }
    const target = event.companySlug ? (bySlug.get(event.companySlug) ?? null) : null;
    items.push({
      reason: "material_event",
      target,
      headline: event.summary,
      // The pipeline records why an event matters to eToro separately from the
      // article's own summary. When it has not, say so rather than reusing the
      // summary and passing a description off as an implication.
      whyItMatters:
        event.etoroRelevance ??
        "The pipeline has not recorded why this matters to eToro. Treat the implication as unassessed.",
      event,
      recommendedAction: target
        ? `Open ${target.canonicalName} and check whether the score inputs still hold.`
        : "Resolve which company this concerns before acting on it.",
    });
  }

  for (const target of targets) {
    if (target.recommendation === "priority_diligence") {
      items.push({
        reason: "priority_ready",
        target,
        headline: `${target.canonicalName} is ready for priority diligence`,
        whyItMatters:
          "It clears the score floor, the coverage floor and every gate, which is the bar for opening a diligence workstream.",
        event: null,
        recommendedAction: "Review the decision summary and confirm the route.",
      });
      continue;
    }

    if (
      target.normalizedScore !== null &&
      target.coverage !== null &&
      target.coverage < SCORING_THRESHOLDS_V0_3.coverageGateFloor
    ) {
      items.push({
        reason: "thin_evidence",
        target,
        headline: `${target.canonicalName} is scored on thin evidence`,
        whyItMatters: `Only ${Math.round(
          target.coverage * 100,
        )}% of applicable scoring weight is backed by evidence, below the floor for any shortlist decision.`,
        event: null,
        recommendedAction: "Refresh the company to close the largest evidence gaps.",
      });
    }
  }

  const order: Record<AttentionReason, number> = {
    blocked_gate: 0,
    material_event: 1,
    priority_ready: 2,
    thin_evidence: 3,
  };

  return items.sort((left, right) => order[left.reason] - order[right.reason]);
}

export type { EventSummary, MonitoringRunSummary, TargetSummary };
