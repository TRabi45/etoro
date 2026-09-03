import { describe, expect, it } from "vitest";
import {
  EVIDENCE_BANDS_V0_2,
  HARD_GATES_V0_2,
  PLATFORM_MODEL_V0_2,
  RISK_COMPONENTS_V0_2,
  RISK_PENALTY_CAP,
  SCORING_CONFIG_VERSION,
  TUCK_IN_MODEL_V0_2,
} from "@/src/config/scoring/v0-2";

/**
 * Version 0.2 kept the version 0.1 weights deliberately. These tests pin the
 * exact numbers so a future edit has to be intentional: changing a weight here
 * fails the suite, which is the prompt to publish a new version rather than
 * silently reinterpreting every score already stored against 0.2.
 */
describe("scoring configuration v0.2", () => {
  it("is version 0.2 for both paths", () => {
    expect(SCORING_CONFIG_VERSION).toBe("0.2");
    expect(PLATFORM_MODEL_V0_2.version).toBe("0.2");
    expect(TUCK_IN_MODEL_V0_2.version).toBe("0.2");
  });

  it("totals 100 for the Platform model", () => {
    const total = PLATFORM_MODEL_V0_2.dimensions.reduce(
      (sum, dimension) => sum + dimension.weight,
      0,
    );
    expect(total).toBe(100);
  });

  it("totals 100 for the Tuck-in model", () => {
    const total = TUCK_IN_MODEL_V0_2.dimensions.reduce(
      (sum, dimension) => sum + dimension.weight,
      0,
    );
    expect(total).toBe(100);
  });

  it("keeps the exact Platform weights", () => {
    const weights = Object.fromEntries(
      PLATFORM_MODEL_V0_2.dimensions.map((dimension) => [dimension.key, dimension.weight]),
    );
    expect(weights).toEqual({
      strategic_fit: 20,
      franchise_geographic_regulatory_advantage: 18,
      fundamental_quality_durable_scale: 15,
      distribution_kpi_synergy: 12,
      product_gap_closed: 10,
      acquisition_valuation_plausibility: 10,
      integration_feasibility: 8,
      technology_team_differentiation: 4,
      why_now: 3,
    });
  });

  it("keeps the exact Tuck-in weights", () => {
    const weights = Object.fromEntries(
      TUCK_IN_MODEL_V0_2.dimensions.map((dimension) => [dimension.key, dimension.weight]),
    );
    expect(weights).toEqual({
      product_capability_gap_closed: 25,
      technology_ip_data_team: 20,
      speed_to_market_vs_build: 15,
      distribution_leverage: 12,
      strategic_theme_fit: 10,
      integration_feasibility: 8,
      acquisition_plausibility: 7,
      why_now_competitive_scarcity: 3,
    });
  });

  it("caps risk at 20 and its components sum to exactly the cap", () => {
    const total = RISK_COMPONENTS_V0_2.reduce((sum, component) => sum + component.max, 0);
    expect(RISK_PENALTY_CAP).toBe(20);
    expect(total).toBe(20);
    expect(RISK_COMPONENTS_V0_2.map((component) => component.max)).toEqual([5, 5, 4, 3, 3]);
  });

  it("keeps the four evidence bands with no gap between them", () => {
    expect(EVIDENCE_BANDS_V0_2).toHaveLength(4);
    expect(
      EVIDENCE_BANDS_V0_2.map((band) => [band.minCoverage, band.minPenalty, band.maxPenalty]),
    ).toEqual([
      [0.85, 0, 2],
      [0.7, 3, 5],
      [0.55, 6, 9],
      [0.4, 10, 15],
    ]);
    // Each band starts where the one above it ends, so no coverage value falls
    // between two bands.
    for (let index = 1; index < EVIDENCE_BANDS_V0_2.length; index += 1) {
      expect(EVIDENCE_BANDS_V0_2[index].maxCoverage).toBe(
        EVIDENCE_BANDS_V0_2[index - 1].minCoverage,
      );
    }
  });

  it("marks which gates are permanent and which are critical", () => {
    const evidenceFloor = HARD_GATES_V0_2.find((gate) => gate.key === "evidence_floor");
    const nonAcquirability = HARD_GATES_V0_2.find((gate) => gate.key === "non_acquirability");
    // An unverifiable identity forces Research only; a confirmed sale to someone
    // else rules out Acquire permanently. The two are not the same thing.
    expect(evidenceFloor).toMatchObject({ critical: true, permanent: false });
    expect(nonAcquirability).toMatchObject({ critical: true, permanent: true });
  });
});
