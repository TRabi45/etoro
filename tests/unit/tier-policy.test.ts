import { describe, expect, it } from "vitest";
import { decideResearchTier, type TierDecisionInput } from "@/src/domain/tiering/tier-policy";

/**
 * The tier policy decides how much research attention a company gets. It has
 * to be deterministic and total - every case below is a real state a company
 * can be in, and the policy must have an answer for all of them, not just the
 * scored ones.
 */

const baseline: TierDecisionInput = {
  screenVerdict: "pass",
  entityResolved: true,
  hasEvidence: false,
  recommendation: null,
  hasUnreflectedMaterialEvent: false,
};

describe("decideResearchTier", () => {
  it("keeps a screened-out row at the cheapest tier", () => {
    const result = decideResearchTier({ ...baseline, screenVerdict: "screened_out" });
    expect(result.tier).toBe("indexed");
  });

  it("keeps a precedent at the cheapest tier even with evidence", () => {
    // A precedent's events still matter (section 20), but that is a monitoring
    // question, not a research-effort question - this policy governs the
    // latter.
    const result = decideResearchTier({
      ...baseline,
      screenVerdict: "precedent",
      hasEvidence: true,
      recommendation: "priority_diligence",
    });
    expect(result.tier).toBe("indexed");
  });

  it("caps an unresolved entity at indexed regardless of anything else", () => {
    // Section 28 orders entity resolution before scoring; a recommendation
    // cannot exist yet if the entity itself is not resolved, but this proves
    // the cap holds even if something upstream is inconsistent about that.
    const result = decideResearchTier({
      ...baseline,
      entityResolved: false,
      hasEvidence: true,
      recommendation: "priority_diligence",
      hasUnreflectedMaterialEvent: true,
    });
    expect(result.tier).toBe("indexed");
    expect(result.reason).toContain("entity");
  });

  it("promotes to deep on the strongest recommendation", () => {
    const result = decideResearchTier({ ...baseline, recommendation: "priority_diligence" });
    expect(result.tier).toBe("deep");
  });

  it("promotes to deep when a hard gate blocks an otherwise-live target", () => {
    // DeltaCustody (section 35): 74 points, blocked by an unresolved security
    // gate. The block is exactly the reason it needs focused attention, not a
    // reason to deprioritise it.
    const result = decideResearchTier({ ...baseline, recommendation: "blocked" });
    expect(result.tier).toBe("deep");
  });

  it("promotes to deep on an unreflected material event even before scoring", () => {
    const result = decideResearchTier({ ...baseline, hasUnreflectedMaterialEvent: true });
    expect(result.tier).toBe("deep");
  });

  it("assigns monitored for shortlist, partner and watch recommendations", () => {
    for (const recommendation of ["shortlist", "partner", "watch"] as const) {
      const result = decideResearchTier({ ...baseline, recommendation });
      expect(result.tier).toBe("monitored");
    }
  });

  it("keeps do-not-advance at indexed rather than monitored", () => {
    const result = decideResearchTier({ ...baseline, recommendation: "do_not_advance" });
    expect(result.tier).toBe("indexed");
  });

  it("assigns monitored to an unscored company that already has evidence", () => {
    const result = decideResearchTier({ ...baseline, hasEvidence: true });
    expect(result.tier).toBe("monitored");
  });

  it("assigns indexed to a bare discovered identity", () => {
    const result = decideResearchTier(baseline);
    expect(result.tier).toBe("indexed");
  });

  it("is stable under repeated identical input, so re-running never fabricates a transition", () => {
    const first = decideResearchTier({ ...baseline, recommendation: "watch" });
    const second = decideResearchTier({ ...baseline, recommendation: "watch" });
    expect(second).toEqual(first);
  });
});
