/**
 * Deterministic scoring configuration, version 0.2.
 *
 * Version 0.2 deliberately keeps the version 0.1 Platform and Tuck-in weights.
 * Nine historical eToro transactions all scored as strong positives under those
 * weights, and that sample is far too small and too heterogeneous to justify
 * reweighting without overfitting. What 0.2 changes is scoring *operations*:
 * weighted evidence coverage, explicit unknown handling, coverage-banded
 * evidence penalties, dual scoring for genuine Hybrids, itemised risk, and the
 * separation of the fit score from the recommended action.
 *
 * This file is data. It is versioned, and once a score has been written against
 * it the corresponding database row is locked, so historical scores stay
 * reproducible. Changing a weight means publishing a new version, never editing
 * this one in place.
 */

import type { ScoringConfiguration } from "@/src/domain/scoring/types";

export const SCORING_CONFIG_VERSION = "0.2" as const;

/**
 * Platform targets are judged on whether they change eToro's position: a
 * franchise, a customer book, regulated reach, durable economics.
 */
export const PLATFORM_MODEL_V0_2: ScoringConfiguration = {
  version: SCORING_CONFIG_VERSION,
  path: "platform",
  dimensions: [
    { key: "strategic_fit", label: "Strategic fit with validated themes", weight: 20 },
    {
      key: "franchise_geographic_regulatory_advantage",
      label: "Defensible franchise, geographic, or regulatory advantage",
      weight: 18,
    },
    {
      key: "fundamental_quality_durable_scale",
      label: "Fundamental quality and durable commercial scale",
      weight: 15,
    },
    { key: "distribution_kpi_synergy", label: "eToro distribution and KPI synergy", weight: 12 },
    { key: "product_gap_closed", label: "Product gap closed", weight: 10 },
    {
      key: "acquisition_valuation_plausibility",
      label: "Acquisition and valuation plausibility",
      weight: 10,
    },
    { key: "integration_feasibility", label: "Integration feasibility", weight: 8 },
    {
      key: "technology_team_differentiation",
      label: "Technology and team differentiation",
      weight: 4,
    },
    { key: "why_now", label: "Why Now and competitive urgency", weight: 3 },
  ],
  strategicFitDimension: "strategic_fit",
  acquisitionPlausibilityDimension: "acquisition_valuation_plausibility",
};

/**
 * Tuck-in targets are judged on what they hand eToro to integrate: a capability,
 * a team, IP, time saved. Standalone revenue is not required for a strong score.
 */
export const TUCK_IN_MODEL_V0_2: ScoringConfiguration = {
  version: SCORING_CONFIG_VERSION,
  path: "tuck_in",
  dimensions: [
    {
      key: "product_capability_gap_closed",
      label: "Product or capability gap closed",
      weight: 25,
      // The regulated-access subtype reinterprets this anchor as the regulatory
      // or customer-franchise gap closed. The weight does not move.
      regulatedAccessLabel: "Regulatory or customer-franchise gap closed",
    },
    {
      key: "technology_ip_data_team",
      label: "Technology, IP, data, or team quality",
      weight: 20,
      regulatedAccessLabel:
        "Licence usefulness, customer-book quality, and local operating infrastructure",
    },
    {
      key: "speed_to_market_vs_build",
      label: "Speed-to-market versus build",
      weight: 15,
      regulatedAccessLabel: "Time and probability advantage versus organic authorisation",
    },
    {
      key: "distribution_leverage",
      label: "Distribution leverage through eToro",
      weight: 12,
      regulatedAccessLabel: "Cross-sell into acquired customers and into the local market",
    },
    { key: "strategic_theme_fit", label: "Strategic-theme fit", weight: 10 },
    {
      key: "integration_feasibility",
      label: "Integration feasibility",
      weight: 8,
      regulatedAccessLabel: "Licence change of control, client migration, safeguarding and systems",
    },
    {
      key: "acquisition_plausibility",
      label: "Acquisition plausibility",
      weight: 7,
      regulatedAccessLabel: "Regulator approval, capital, perimeter and seller willingness",
    },
    { key: "why_now_competitive_scarcity", label: "Why Now and competitive scarcity", weight: 3 },
  ],
  strategicFitDimension: "strategic_theme_fit",
  acquisitionPlausibilityDimension: "acquisition_plausibility",
};

/**
 * Risk is an itemised deduction, never a single opaque number. Each component
 * has its own ceiling, the components sum to at most 20, and any non-zero
 * component must carry a stated reason.
 */
export const RISK_COMPONENTS_V0_2 = [
  { key: "regulatory_change_of_control", label: "Regulatory and change of control", max: 5 },
  { key: "aml_sanctions_security_custody", label: "AML, sanctions, security, custody", max: 5 },
  {
    key: "integration_technology_data_migration",
    label: "Integration, technology, data migration",
    max: 4,
  },
  {
    key: "valuation_financing_seller_dynamics",
    label: "Valuation, financing, seller dynamics",
    max: 3,
  },
  {
    key: "conduct_reputation_customer_concentration",
    label: "Conduct, reputation, customer concentration",
    max: 3,
  },
] as const;

export const RISK_PENALTY_CAP = 20;

/**
 * Evidence penalty bands, keyed on weighted coverage.
 *
 * The engine does not invent a penalty inside the band - a human or an upstream
 * step supplies it and the engine validates that it belongs to the band the
 * coverage actually earned. That keeps the deduction reviewable instead of
 * silently derived.
 */
export const EVIDENCE_BANDS_V0_2 = [
  { minCoverage: 0.85, maxCoverage: 1.0, minPenalty: 0, maxPenalty: 2 },
  { minCoverage: 0.7, maxCoverage: 0.85, minPenalty: 3, maxPenalty: 5 },
  { minCoverage: 0.55, maxCoverage: 0.7, minPenalty: 6, maxPenalty: 9 },
  { minCoverage: 0.4, maxCoverage: 0.55, minPenalty: 10, maxPenalty: 15 },
] as const;

/**
 * Hard gates run before scoring.
 *
 * `permanent` means a triggered gate rules out Acquire outright. `critical`
 * means an unresolved gate forces Research only, because the question is
 * fundamental enough that a decision score would be false precision.
 */
export const HARD_GATES_V0_2 = [
  {
    key: "legal_regulatory_impossibility",
    label: "Legal or regulatory impossibility",
    permanent: true,
    critical: true,
  },
  {
    key: "sanctions_aml_financial_crime",
    label: "Sanctions, AML, or financial-crime incompatibility",
    permanent: true,
    critical: true,
  },
  {
    key: "entity_mismatch",
    label: "Entity mismatch between product, licence and acquirable entity",
    permanent: false,
    critical: true,
  },
  { key: "non_acquirability", label: "Non-acquirability", permanent: true, critical: true },
  {
    key: "critical_security_custody_failure",
    label: "Critical security or custody failure",
    permanent: true,
    critical: true,
  },
  {
    key: "strategic_contradiction",
    label: "Strategic contradiction",
    permanent: true,
    critical: false,
  },
  { key: "evidence_floor", label: "Evidence floor", permanent: false, critical: true },
] as const;

export const SCORING_THRESHOLDS_V0_2 = {
  /** Below this weighted coverage there is no decision score at all. */
  researchOnlyCoverageFloor: 0.4,
  acquireMinFinalScore: 75,
  acquireMinStrategicFit: 4,
  acquireMinCoverage: 0.7,
  acquireMinAcquisitionPlausibility: 3,
  /** Final scores from here up to the Acquire threshold sit in the Monitor band. */
  monitorMinFinalScore: 60,
} as const;

export const SCORING_MODELS_V0_2 = {
  platform: PLATFORM_MODEL_V0_2,
  tuck_in: TUCK_IN_MODEL_V0_2,
} as const;
