import type {
  EvidenceLevel,
  HardGateDefinition,
  RecommendationLabel,
  RouteName,
  ScoringConfiguration,
  ScoringPolicy,
  ScoringThresholds,
} from "@/src/domain/scoring/types";

/**
 * Scoring configuration v0.3 - the acquisition thesis, as executable data.
 *
 * Every number here comes from `docs/ACQUISITION_THESIS.md`, and the section it
 * comes from is named beside it. The document is explicit that these are
 * "proposed calibration settings rather than known eToro policy" (section 42),
 * which is why they are configuration with an owner and a rationale rather than
 * constants: Corporate Development owns the weights (section 37), and a
 * published model can never be edited in place once it has produced a score.
 *
 * ## What changed from v0.2, and why
 *
 * v0.2 had two scorecards, subtracted a risk penalty and an evidence penalty
 * from the score, and reported no uncertainty. All three contradict the thesis:
 *
 * - Section 26 specifies one global weight set. Section 27 puts family variation
 *   in *sub-metrics*, never in a second weight vector.
 * - Section 27: a severe regulatory issue "is handled by a gate, not
 *   double-counted without policy". Risk lives in the anchors and the gates.
 * - Mandatory principle 5: "never hide missing information inside a score".
 *   Coverage is reported beside the score, never subtracted from it.
 *
 * v0.2 is not deleted from the database. `scoring_models.locked_at` freezes any
 * configuration that has produced a score, so the getquin score written under
 * v0.2 stays exactly as it was calculated, and the difference between the two
 * models is itself the thing section 36 asks the agent to be able to explain.
 */

export const SCORING_CONFIG_VERSION = "0.3";

/**
 * Section 27's weight governance, stored with the model rather than in a commit
 * message: "Weights are versioned with date, owner and rationale."
 */
export const SCORING_MODEL_GOVERNANCE = {
  owner: "Corporate Development",
  thesisVersion: "thesis/v1.0",
  rationale:
    "Transcribed from the eToro Acquisition Thesis v1.0 (2026-09-06), section 26. Proposed calibration, not approved eToro policy; requires validation with Corporate Development before any weight is treated as settled.",
} as const;

/**
 * The eight dimensions of section 26.
 *
 * ## Sub-metrics
 *
 * Each dimension carries at least one sub-metric, and the sub-metric is what is
 * actually scored. Two things follow.
 *
 * First, it resolves an inconsistency in the source document. Section 35's
 * calibration examples need coverage figures of 88%, 81%, 72% and 76%, but every
 * dimension weight is a multiple of five, so dimension-level coverage can only
 * land on a multiple of 5%. Measuring coverage across sub-metrics produces the
 * fine-grained percentages the examples use, and it matches section 27's
 * instruction to "keep global weights, but vary sub-metrics by family".
 *
 * Second, it is where the per-archetype evidence requirements of sections 11-19
 * will live. Wallet security belongs inside product and technology; net flows
 * belong inside customers and financials. Section 27 says so directly.
 *
 * Today every dimension has exactly one sub-metric, whose key is the dimension's
 * own key and whose share is the whole weight. That is deliberately the
 * degenerate case: it behaves identically to dimension-level scoring, so this
 * milestone changes the model without also changing how much evidence a score
 * demands. Family sub-metrics are a data change on top of it, not a rewrite.
 */
export const THESIS_MODEL_V0_3: ScoringConfiguration = {
  version: SCORING_CONFIG_VERSION,
  dimensions: [
    {
      key: "strategic_fit",
      label: "Strategic fit",
      weight: 25,
      anchors: {
        low: "No link to a pillar, or conflicts with the stated direction.",
        mid: "Reasonable link to a secondary gap.",
        high: "Solves an explicit, current and material gap.",
      },
      subMetrics: [{ key: "strategic_fit", label: "Strategic fit", share: 1 }],
    },
    {
      key: "incremental_capability",
      label: "Incremental capability",
      weight: 15,
      anchors: {
        low: "Overlapping with what eToro already has, or easy to replicate.",
        mid: "Partial addition or moderate acceleration.",
        high: "Scarce asset with a material advantage over building or partnering.",
      },
      subMetrics: [{ key: "incremental_capability", label: "Incremental capability", share: 1 }],
    },
    {
      key: "market_customers_distribution",
      label: "Market, customers and distribution",
      weight: 15,
      anchors: {
        low: "No reliable usage evidence, or complete overlap with eToro's base.",
        mid: "Relevant audience with partial evidence.",
        high: "Strong usage and retention, and proven two-way distribution.",
      },
      subMetrics: [
        {
          key: "market_customers_distribution",
          label: "Market, customers and distribution",
          share: 1,
        },
      ],
    },
    {
      key: "product_technology",
      label: "Product and technology",
      weight: 10,
      anchors: {
        low: "Unstable, weak IP rights, or unsafe.",
        mid: "Good product with manageable technical debt and dependencies.",
        high: "High quality, clear ownership, and demonstrated integration.",
      },
      subMetrics: [{ key: "product_technology", label: "Product and technology", share: 1 }],
    },
    {
      key: "financial_quality",
      label: "Financial quality",
      weight: 10,
      anchors: {
        low: "Negative unit economics with no plausible path.",
        mid: "Reasonable economics, or controlled investment.",
        high: "Strong, resilient contribution and cash quality.",
      },
      subMetrics: [{ key: "financial_quality", label: "Financial quality", share: 1 }],
    },
    {
      key: "regulatory_feasibility",
      label: "Regulatory feasibility",
      weight: 10,
      anchors: {
        low: "The intended use is prohibited, or the permission gap cannot be solved.",
        mid: "Plausible approval path with conditions.",
        high: "Verified permissions suitable for the intended use, and relatively low risk.",
      },
      subMetrics: [{ key: "regulatory_feasibility", label: "Regulatory feasibility", share: 1 }],
    },
    {
      key: "integration_team",
      label: "Integration and team",
      weight: 10,
      anchors: {
        low: "Severe technical or organisational break.",
        mid: "Feasible plan with defined dependencies.",
        high: "Complementary systems and team, with clear owners.",
      },
      subMetrics: [{ key: "integration_team", label: "Integration and team", share: 1 }],
    },
    {
      key: "deal_feasibility",
      label: "Deal feasibility",
      weight: 5,
      anchors: {
        low: "Unavailable or unfinanceable.",
        mid: "Possible, but expensive or competitive.",
        high: "Executable structure and value, with willing parties.",
      },
      subMetrics: [{ key: "deal_feasibility", label: "Deal feasibility", share: 1 }],
    },
  ],
};

/**
 * The seven gates of section 28.
 *
 * A gate overrides the score. The document is unambiguous about the direction of
 * that override: "A high score with a hard gate remains blocked" (section 27),
 * and DeltaCustody in section 35 exists precisely to prove it - 74 points, good
 * wallet fit, blocked by an unresolved security incident.
 *
 * `resolveBeforeScoring` marks the entity gate alone. The document orders it
 * ahead of the score rather than beside it: "Stop; resolve entity before
 * scoring." Section 32 repeats it from the discovery side. Scoring a company
 * whose identity is unresolved produces a number about nobody in particular,
 * which is worse than no number at all - it is the Bit2C/B2C2 failure with a
 * decimal point attached.
 */
export const HARD_GATES_V0_3: readonly HardGateDefinition[] = [
  {
    key: "entity",
    label: "Entity gate",
    trigger: "Target identity, parent or ownership is uncertain.",
    action: "Stop; resolve the entity before scoring.",
    resolveBeforeScoring: true,
  },
  {
    key: "regulatory",
    label: "Regulatory gate",
    trigger: "No permission for the intended use, or control-change continuity unassessed.",
    action: "Blocked - Legal and Regulatory review.",
    resolveBeforeScoring: false,
  },
  {
    key: "client_assets",
    label: "Client-assets gate",
    trigger: "Reconciliation, segregation or ownership gap in customer assets.",
    action: "Immediate stop and escalation.",
    resolveBeforeScoring: false,
  },
  {
    key: "security",
    label: "Security gate",
    trigger: "Open breach, unclear key control, or unauditable security.",
    action: "Stop pending independent review.",
    resolveBeforeScoring: false,
  },
  {
    key: "integrity",
    label: "Integrity gate",
    trigger: "Activity, revenue or customer origin is suspicious or unreproducible.",
    action: "Do not advance; forensic review.",
    resolveBeforeScoring: false,
  },
  {
    key: "deal",
    label: "Deal gate",
    trigger: "Already acquired, not for sale, or structurally impossible.",
    action: "Record as a precedent or a watch item, never as a target recommendation.",
    resolveBeforeScoring: false,
  },
  {
    key: "coverage",
    label: "Coverage gate",
    trigger: "Scoring coverage below 60%.",
    action: "Research only; never a shortlist.",
    resolveBeforeScoring: false,
  },
];

/**
 * Section 26's decision bands, and section 42's restatement of them.
 *
 * "A Priority label requires at least 80 normalized points, 75% coverage and no
 * unresolved gate, but these are proposed calibration settings rather than known
 * eToro policy."
 *
 * The coverage gate at 0.6 is section 28's, and it is a different thing from the
 * 0.75 Priority floor: below 0.6 the target cannot be shortlisted at all, while
 * between 0.6 and 0.75 it can be shortlisted, partnered or watched but never
 * promoted to Priority.
 */
export const SCORING_THRESHOLDS_V0_3: ScoringThresholds = {
  priorityMinScore: 80,
  priorityMinCoverage: 0.75,
  shortlistMinScore: 65,
  conditionalWatchlistMinScore: 50,
  coverageGateFloor: 0.6,
};

/** Section 23. Ownership is one route among five, and has to beat the others. */
export const ROUTES: readonly RouteName[] = ["build", "partner", "buy", "invest", "watch"];

/** Section 34's recommendation labels, which are actions rather than routes. */
export const RECOMMENDATION_LABELS: readonly RecommendationLabel[] = [
  "priority_diligence",
  "shortlist",
  "partner",
  "watch",
  "do_not_advance",
  "blocked",
];

/**
 * Section 29's source-quality ladder.
 *
 * Orthogonal to whether a claim is fact, forecast or inference: a company press
 * release is a level-B source whether the sentence it supports is a verified
 * fact or a forecast. Level D is discovery-only - an aggregator profile may
 * point research at a company, and may not be the sole proof of anything
 * material.
 */
export const EVIDENCE_LEVELS: readonly EvidenceLevel[] = [
  {
    level: "A",
    label: "Regulator, filing, contract or audited report",
    permittedUse: "A legal or financial fact, within the scope of the document.",
    discoveryOnly: false,
  },
  {
    level: "B",
    label: "Company release, product page or investor material",
    permittedUse:
      "Status and management statements. A marketing performance claim remains a claim.",
    discoveryOnly: false,
  },
  {
    level: "C",
    label: "High-quality reporting or a transparent database",
    permittedUse: "Gap filling and triangulation. A reported price stays labelled as reported.",
    discoveryOnly: false,
  },
  {
    level: "D",
    label: "Profile, social post or aggregator",
    permittedUse: "Discovery only, unless it is itself the official primary source.",
    discoveryOnly: true,
  },
];

/** Everything the engine needs beyond the model itself. */
export const SCORING_POLICY_V0_3: ScoringPolicy = {
  hardGates: [...HARD_GATES_V0_3],
  thresholds: SCORING_THRESHOLDS_V0_3,
};
