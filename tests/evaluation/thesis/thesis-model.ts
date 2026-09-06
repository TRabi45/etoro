/**
 * The scoring model the acquisition thesis specifies, transcribed as data.
 *
 * This file deliberately imports nothing from `src/`. It is the document's
 * account of what the engine should do, written down before the engine can do
 * it, so that "the code matches the thesis" is a claim a test can settle rather
 * than a claim a person can assert.
 *
 * Every constant carries the section of `docs/ACQUISITION_THESIS.md` it comes
 * from. If one of these numbers is wrong, the fix is to correct it against the
 * PDF and let the conformance test fail - never to adjust the engine until the
 * test passes, which is how a model quietly stops meaning what the business
 * agreed to.
 */

/** §26. One global weight set. The document specifies no per-path variant. */
export interface ThesisDimension {
  key: string;
  label: string;
  weight: number;
  /** §27 anchors. The document gives wording for 0-1, 3 and 5. */
  anchors: { low: string; mid: string; high: string };
}

export const THESIS_DIMENSIONS: readonly ThesisDimension[] = [
  {
    key: "strategic_fit",
    label: "Strategic fit",
    weight: 25,
    anchors: {
      low: "No link or conflicts with direction.",
      mid: "Reasonable link to a secondary gap.",
      high: "Solves an explicit, current and material gap.",
    },
  },
  {
    key: "incremental_capability",
    label: "Incremental capability",
    weight: 15,
    anchors: {
      low: "Overlapping or easy to replicate.",
      mid: "Partial addition or moderate acceleration.",
      high: "Scarce asset and material advantage over alternatives.",
    },
  },
  {
    key: "market_customers_distribution",
    label: "Market, customers and distribution",
    weight: 15,
    anchors: {
      low: "No reliable usage or complete overlap.",
      mid: "Relevant audience with partial evidence.",
      high: "Strong usage and retention, and proven two-way distribution.",
    },
  },
  {
    key: "product_technology",
    label: "Product and technology",
    weight: 10,
    anchors: {
      low: "Unstable, weak rights or unsafe.",
      mid: "Good product with manageable debt and dependencies.",
      high: "High quality, clear ownership and demonstrated integration.",
    },
  },
  {
    key: "financial_quality",
    label: "Financial quality",
    weight: 10,
    anchors: {
      low: "Negative units without a plausible path.",
      mid: "Reasonable economics or controlled investment.",
      high: "Strong, resilient contribution and cash quality.",
    },
  },
  {
    key: "regulatory_feasibility",
    label: "Regulatory feasibility",
    weight: 10,
    anchors: {
      low: "Use prohibited or the gap cannot be solved.",
      mid: "Plausible approval path with conditions.",
      high: "Verified suitable permissions and relatively low risk.",
    },
  },
  {
    key: "integration_team",
    label: "Integration and team",
    weight: 10,
    anchors: {
      low: "Severe technical or organisational break.",
      mid: "Feasible plan with defined dependencies.",
      high: "Complementary systems and team, and clear owners.",
    },
  },
  {
    key: "deal_feasibility",
    label: "Deal feasibility",
    weight: 5,
    anchors: {
      low: "Unavailable or unfinanceable.",
      mid: "Possible but expensive or competitive.",
      high: "Executable structure and value with willing parties.",
    },
  },
] as const;

/** §26. Stated as a total, and worth asserting rather than assuming. */
export const THESIS_TOTAL_WEIGHT = 100;

/** §26 and §42. Proposed calibration settings, not eToro policy. */
export const THESIS_THRESHOLDS = {
  /** 80-100: priority research or outreach. */
  priorityMinScore: 80,
  /** Priority additionally requires this coverage and no unresolved gate. */
  priorityMinCoverage: 0.75,
  /** 65-79: shortlist, partner or watch. */
  shortlistMinScore: 65,
  /** 50-64: conditional watchlist. */
  conditionalWatchlistMinScore: 50,
  /** §28 coverage gate: below this, research only - never a shortlist. */
  coverageGateFloor: 0.6,
} as const;

/**
 * §28. Seven gates. A gate overrides the score.
 *
 * `blocksBeforeScoring` marks the entity gate, which the document orders ahead
 * of scoring rather than alongside it: "Stop; resolve entity before scoring."
 * §32 says the same thing from the discovery side - "Do not perform full scoring
 * when identity or basic fit is unresolved."
 */
export interface ThesisGate {
  key: string;
  label: string;
  trigger: string;
  result: string;
  blocksBeforeScoring: boolean;
}

export const THESIS_GATES: readonly ThesisGate[] = [
  {
    key: "entity",
    label: "Entity gate",
    trigger: "Target identity, parent or ownership is uncertain.",
    result: "Stop; resolve entity before scoring.",
    blocksBeforeScoring: true,
  },
  {
    key: "regulatory",
    label: "Regulatory gate",
    trigger: "No permission for intended use, or control-change continuity unassessed.",
    result: "Blocked - Legal/Regulatory review.",
    blocksBeforeScoring: false,
  },
  {
    key: "client_assets",
    label: "Client-assets gate",
    trigger: "Reconciliation, segregation or ownership gap.",
    result: "Immediate stop and escalation.",
    blocksBeforeScoring: false,
  },
  {
    key: "security",
    label: "Security gate",
    trigger: "Open breach, unclear key control, or unauditable security.",
    result: "Stop pending independent review.",
    blocksBeforeScoring: false,
  },
  {
    key: "integrity",
    label: "Integrity gate",
    trigger: "Activity, revenue or customer origin is suspicious or unreproducible.",
    result: "Do not advance; forensic review.",
    blocksBeforeScoring: false,
  },
  {
    key: "deal",
    label: "Deal gate",
    trigger: "Already acquired, not for sale, or structurally impossible.",
    result: "Precedent or watch, not a target recommendation.",
    blocksBeforeScoring: false,
  },
  {
    key: "coverage",
    label: "Coverage gate",
    trigger: "Scoring coverage below 60%.",
    result: "Research only; no shortlist.",
    blocksBeforeScoring: false,
  },
] as const;

/**
 * §34. The recommendation label, which the document keeps separate from the
 * route in §23. A label says what to do about this target now; a route says
 * which form of ownership, if any, the evidence supports.
 */
export const THESIS_RECOMMENDATION_LABELS = [
  "priority_diligence",
  "shortlist",
  "partner",
  "watch",
  "do_not_advance",
  "blocked",
] as const;

/** §23. Acquisition is one route among five, and must beat the others. */
export const THESIS_ROUTES = ["build", "partner", "buy", "invest", "watch"] as const;

/** §33. Pipeline status, plus the side paths a target can leave it by. */
export const THESIS_PIPELINE_STATES = [
  "discovered",
  "screened",
  "analyzed",
  "diligence",
  "ic_ready",
] as const;

export const THESIS_PIPELINE_SIDE_PATHS = [
  "partner",
  "watch",
  "blocked",
  "unavailable",
  "closed",
] as const;

/** §10. Nine target families. One primary, secondary tags allowed. */
export const THESIS_TARGET_FAMILIES = [
  { code: "A", key: "brokerage_advanced_trading", precedent: "Gatsby; pending TradeZero" },
  { code: "B", key: "local_savings_wealth", precedent: "Spaceship" },
  { code: "C", key: "analytics_information_community", precedent: "Delta; Bullsheet; BullAware" },
  { code: "D", key: "ai_developer_tools", precedent: "Deep; App Store direction" },
  { code: "E", key: "wallets_user_control", precedent: "Zengo" },
  { code: "F", key: "regulated_crypto_access", precedent: "Bit2C" },
  { code: "G", key: "payments_money_services", precedent: "Marq Millions" },
  { code: "H", key: "market_infrastructure_tokenization", precedent: "Firmo; on-chain direction" },
  { code: "I", key: "compliance_operational_automation", precedent: "Conditional extension" },
] as const;

/**
 * §3. eToro's own language for its four pillars.
 *
 * AI, developer ecosystems and blockchain-based finance are cross-cutting
 * enablers in the document, not pillars. The distinction matters: the current
 * taxonomy promotes on-chain infrastructure to a theme and omits Investing
 * entirely, which changes what "strategic fit" - the heaviest dimension - means.
 */
export const THESIS_PILLARS = ["trading", "investing", "wealth_management", "neo_banking"] as const;

export const THESIS_ENABLERS = ["ai", "developer_ecosystem", "blockchain_finance"] as const;

/** §29. Source quality, orthogonal to whether a claim is fact or inference. */
export const THESIS_EVIDENCE_LEVELS = [
  { level: "A", typical: "Regulator, SEC filing, contract, audited report.", discoveryOnly: false },
  {
    level: "B",
    typical: "Company release, product page, investor material.",
    discoveryOnly: false,
  },
  { level: "C", typical: "High-quality reporting or transparent database.", discoveryOnly: false },
  { level: "D", typical: "Profile, social post or aggregator.", discoveryOnly: true },
] as const;

/**
 * §26 and §35, as executable arithmetic.
 *
 * Written here rather than imported so the conformance test compares two
 * independent implementations. If the engine and this function agree, they agree
 * because the specification is unambiguous, not because they share a bug.
 */
export interface ThesisScoreInput {
  /** Dimension key to a 0-5 score, or `null` for a criterion nobody has established. */
  scores: Record<string, number | null>;
}

export interface ThesisScoreResult {
  normalized: number;
  coverage: number;
  lowerBound: number;
  upperBound: number;
}

export function thesisScore({ scores }: ThesisScoreInput): ThesisScoreResult {
  let knownWeight = 0;
  let unknownWeight = 0;
  let contribution = 0;

  for (const dimension of THESIS_DIMENSIONS) {
    const score = scores[dimension.key];
    if (score === null || score === undefined) {
      unknownWeight += dimension.weight;
      continue;
    }
    knownWeight += dimension.weight;
    contribution += (dimension.weight * score) / 5;
  }

  return {
    // §26: "Normalized known score: Σ known contributions ÷ Σ known weights × 100."
    normalized: knownWeight === 0 ? 0 : (contribution / knownWeight) * 100,
    // §26: "Coverage: Σ known weights ÷ 100."
    coverage: knownWeight / THESIS_TOTAL_WEIGHT,
    // §26: "Range: lower if missing=0; upper if missing=5."
    lowerBound: contribution,
    upperBound: contribution + unknownWeight,
  };
}
