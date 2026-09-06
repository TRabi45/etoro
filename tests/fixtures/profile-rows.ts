import type {
  RawAssessmentRow,
  RawClaimRow,
  RawCompanyRow,
  RawFundamentalRow,
  RawMetricRow,
  RawProfileRows,
  RawScoreRow,
  RawSourceRow,
} from "@/src/db/repositories/company-profile";

/**
 * Hand-built relational rows for testing the profile mapper.
 *
 * These mirror exactly what the composite query returns, which lets the shaping
 * logic - citation numbering, contradiction pairing, unknown collection - be
 * tested without a database in the loop.
 */

export const SOURCE_REGISTER: RawSourceRow = {
  id: "11111111-1111-4111-8111-111111111111",
  url: "https://example.com/register",
  title: "Register extract",
  publisher: "Example Register",
  source_type: "regulator_registry",
  trust_tier: "primary",
  published_at: null,
  accessed_at: "2026-09-03T10:00:00.000Z",
};

export const SOURCE_PRESS: RawSourceRow = {
  id: "22222222-2222-4222-8222-222222222222",
  url: "https://example.com/press",
  title: "Press article",
  publisher: "Example Press",
  source_type: "trade_press",
  trust_tier: "secondary",
  published_at: "2026-05-19",
  accessed_at: "2026-09-03T10:00:00.000Z",
};

function claim(
  overrides: Partial<RawClaimRow> & Pick<RawClaimRow, "id" | "predicate">,
): RawClaimRow {
  return {
    subject: "Example Co",
    value_text: null,
    value_numeric: null,
    value_unit: null,
    value_currency: null,
    value_status: "disclosed",
    as_of_date: "2026-05-19",
    claim_kind: "company_reported",
    ai_confidence: "medium",
    conflict_group: null,
    unknown_reason: null,
    updated_at: "2026-09-03T10:00:00.000Z",
    claim_sources: [],
    ...overrides,
  };
}

export const CLAIM_ENTITY = claim({
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  predicate: "registered_legal_entity",
  value_text: "Example Co Ltd is the registered entity.",
  claim_kind: "verified_fact",
  claim_sources: [{ relation: "supports", excerpt: "register entry", sources: SOURCE_REGISTER }],
});

/** Two claims that disagree, sharing a conflict group. */
export const CLAIM_USERS_HIGH = claim({
  id: "aaaaaaaa-0000-4000-8000-000000000002",
  predicate: "registered_users",
  value_numeric: 1_200_000,
  value_unit: "users",
  claim_kind: "estimate",
  conflict_group: "cccccccc-0000-4000-8000-000000000001",
  claim_sources: [{ relation: "supports", excerpt: "press figure", sources: SOURCE_PRESS }],
});

export const CLAIM_USERS_LOW = claim({
  id: "aaaaaaaa-0000-4000-8000-000000000003",
  predicate: "registered_users",
  value_numeric: 900_000,
  value_unit: "users",
  conflict_group: "cccccccc-0000-4000-8000-000000000001",
  claim_sources: [{ relation: "supports", excerpt: "company page", sources: SOURCE_REGISTER }],
});

export const CLAIM_REVENUE_UNKNOWN = claim({
  id: "aaaaaaaa-0000-4000-8000-000000000004",
  predicate: "annual_revenue",
  value_status: "unknown",
  claim_kind: "unknown",
  as_of_date: null,
  unknown_reason: "Annual revenue is not disclosed.",
  claim_sources: [{ relation: "supports", excerpt: "no figures published", sources: SOURCE_PRESS }],
});

/** An old claim, used to exercise the staleness calculation. */
export const CLAIM_STALE = claim({
  id: "aaaaaaaa-0000-4000-8000-000000000005",
  predicate: "headcount",
  value_numeric: 40,
  value_unit: "employees",
  claim_kind: "estimate",
  as_of_date: "2024-01-01",
  claim_sources: [{ relation: "supports", excerpt: "old article", sources: SOURCE_PRESS }],
});

export const METRIC_USERS: RawMetricRow = {
  id: "bbbbbbbb-0000-4000-8000-000000000001",
  metric_type: "registered_users",
  value_numeric: 900_000,
  value_unit: "users",
  currency: null,
  value_status: "disclosed",
  period_start: null,
  period_end: null,
  as_of_date: "2026-06-01",
  claim_id: CLAIM_USERS_LOW.id,
  confidence: "medium",
};

export const METRIC_REVENUE_UNKNOWN: RawMetricRow = {
  id: "bbbbbbbb-0000-4000-8000-000000000002",
  metric_type: "annual_revenue",
  value_numeric: null,
  value_unit: null,
  currency: null,
  value_status: "unknown",
  period_start: null,
  period_end: null,
  as_of_date: null,
  claim_id: CLAIM_REVENUE_UNKNOWN.id,
  confidence: null,
};

export const METRIC_AUA_NOT_APPLICABLE: RawMetricRow = {
  id: "bbbbbbbb-0000-4000-8000-000000000003",
  metric_type: "assets_under_administration",
  value_numeric: null,
  value_unit: null,
  currency: null,
  value_status: "not_applicable",
  period_start: null,
  period_end: null,
  as_of_date: null,
  claim_id: null,
  confidence: null,
};

export const COMPANY_ROW: RawCompanyRow = {
  id: "dddddddd-0000-4000-8000-000000000001",
  canonical_name: "Example Co",
  slug: "example-co",
  legal_entity_name: "Example Co Ltd",
  primary_domain: "example.com",
  theme_tags: ["wealth_management"],
  enabling_layers: ["ai"],
  updated_at: "2026-09-03T10:00:00.000Z",
};

export const FUNDAMENTALS_ROW: RawFundamentalRow = {
  id: "eeeeeeee-0000-4000-8000-000000000001",
  archetype: "wealth_savings",
  version: 1,
  revenue_quality: "Subscription-led, but the mix is not evidenced.",
  growth_assessment: "User growth is the only observable signal.",
  margin_assessment: null,
  burn_runway: null,
  concentration: null,
  unknowns: ["Gross margin is not disclosed"],
  evidence_coverage: 0.93,
  created_at: "2026-09-03T10:00:00.000Z",
  fundamental_analysis_claims: [
    { claim_id: CLAIM_REVENUE_UNKNOWN.id, field: "revenue_quality" },
    { claim_id: CLAIM_USERS_LOW.id, field: "growth_assessment" },
    { claim_id: CLAIM_USERS_HIGH.id, field: "growth_assessment" },
  ],
};

export const ASSESSMENT_ROW: RawAssessmentRow = {
  id: "ffffffff-0000-4000-8000-000000000001",
  thesis_version: "v0.2-test",
  path: "tuck_in",
  strategic_fit_summary: "Fits the wealth theme.",
  gap_closed: "Portfolio aggregation.",
  why_now: "A round has just closed.",
  synergies: "Overlapping retail base.",
  risks: "Perimeter only partly established.",
  counter_thesis: "Reproducible in-house.",
  unknowns: ["Licensed scope is only partly established"],
  created_at: "2026-09-03T10:00:00.000Z",
  assessment_claims: [
    { claim_id: CLAIM_ENTITY.id, role: "strategic_fit_summary" },
    { claim_id: CLAIM_USERS_LOW.id, role: "synergies" },
  ],
};

export const SCORE_ROW: RawScoreRow = {
  id: "99999999-0000-4000-8000-000000000001",
  model_version: "0.3",
  positive_normalized: 81.18,
  weighted_coverage: 0.85,
  lower_bound: 69,
  upper_bound: 84,
  recommendation: "partner",
  best_route: "partner",
  second_best_route: "buy",
  buy_beats_alternatives: false,
  gates: [
    {
      key: "regulatory",
      label: "Regulatory gate",
      state: "unresolved",
      action: "Blocked - Legal and Regulatory review.",
    },
  ],
  blocking_gates: [],
  calculated_at: "2026-09-03T10:00:00.000Z",
  input_snapshot: {
    breakdown: [
      {
        key: "strategic_theme_fit",
        label: "Strategic-theme fit",
        weight: 10,
        status: "scored",
        score: 5,
        contribution: 10,
      },
      {
        key: "acquisition_plausibility",
        label: "Acquisition plausibility",
        weight: 7,
        status: "unknown",
        score: null,
        contribution: null,
      },
    ],
    acquireBlockers: ["acquisition plausibility is unknown"],
  },
};

/** A fully populated profile: evidence, contradiction, unknowns and a score. */
export function fullProfileRows(): RawProfileRows {
  return {
    company: COMPANY_ROW,
    claims: [CLAIM_ENTITY, CLAIM_USERS_HIGH, CLAIM_USERS_LOW, CLAIM_REVENUE_UNKNOWN, CLAIM_STALE],
    metrics: [METRIC_USERS, METRIC_REVENUE_UNKNOWN, METRIC_AUA_NOT_APPLICABLE],
    fundamentals: FUNDAMENTALS_ROW,
    assessment: ASSESSMENT_ROW,
    score: SCORE_ROW,
  };
}

/** A bootstrap identity with nothing researched behind it yet. */
export function identityOnlyRows(): RawProfileRows {
  return {
    company: COMPANY_ROW,
    claims: [],
    metrics: [],
    fundamentals: null,
    assessment: null,
    score: null,
  };
}
