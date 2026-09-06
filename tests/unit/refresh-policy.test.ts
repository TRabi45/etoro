import { describe, expect, it } from "vitest";
import { computeNextRefresh } from "@/src/domain/tiering/refresh-policy";

const NOW = new Date("2026-09-06T12:00:00.000Z");

describe("computeNextRefresh", () => {
  it("makes a company eligible immediately on an unreflected material event", () => {
    const result = computeNextRefresh({
      tier: "monitored",
      now: NOW,
      hasUnreflectedMaterialEvent: true,
      lastResearchOutcome: "complete",
    });
    expect(result.nextRefreshAt).toEqual(NOW);
  });

  it("retries sooner than the tier cadence after a partial run", () => {
    const result = computeNextRefresh({
      tier: "indexed",
      now: NOW,
      hasUnreflectedMaterialEvent: false,
      lastResearchOutcome: "partial",
    });
    const oneDayLater = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    expect(result.nextRefreshAt).toEqual(oneDayLater);
  });

  it("retries sooner than the tier cadence after a failed run", () => {
    const result = computeNextRefresh({
      tier: "deep",
      now: NOW,
      hasUnreflectedMaterialEvent: false,
      lastResearchOutcome: "failed",
    });
    expect(result.nextRefreshAt.getTime() - NOW.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("retries sooner than the tier cadence while blocked, to notice when the gate clears", () => {
    const result = computeNextRefresh({
      tier: "deep",
      now: NOW,
      hasUnreflectedMaterialEvent: false,
      lastResearchOutcome: "blocked",
    });
    expect(result.nextRefreshAt.getTime() - NOW.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("uses a shorter baseline cadence for deep than monitored than indexed", () => {
    const deep = computeNextRefresh({
      tier: "deep",
      now: NOW,
      hasUnreflectedMaterialEvent: false,
      lastResearchOutcome: "complete",
    });
    const monitored = computeNextRefresh({
      tier: "monitored",
      now: NOW,
      hasUnreflectedMaterialEvent: false,
      lastResearchOutcome: "complete",
    });
    const indexed = computeNextRefresh({
      tier: "indexed",
      now: NOW,
      hasUnreflectedMaterialEvent: false,
      lastResearchOutcome: "complete",
    });

    expect(deep.nextRefreshAt.getTime()).toBeLessThan(monitored.nextRefreshAt.getTime());
    expect(monitored.nextRefreshAt.getTime()).toBeLessThan(indexed.nextRefreshAt.getTime());
  });

  it("uses the tier baseline for a company that has never been researched", () => {
    const result = computeNextRefresh({
      tier: "monitored",
      now: NOW,
      hasUnreflectedMaterialEvent: false,
      lastResearchOutcome: null,
    });
    const fourteenDaysLater = new Date(NOW.getTime() + 14 * 24 * 60 * 60 * 1000);
    expect(result.nextRefreshAt).toEqual(fourteenDaysLater);
  });

  it("is stable under repeated identical input", () => {
    const first = computeNextRefresh({
      tier: "monitored",
      now: NOW,
      hasUnreflectedMaterialEvent: false,
      lastResearchOutcome: "complete",
    });
    const second = computeNextRefresh({
      tier: "monitored",
      now: NOW,
      hasUnreflectedMaterialEvent: false,
      lastResearchOutcome: "complete",
    });
    expect(second).toEqual(first);
  });
});
