/**
 * Controlled market taxonomy.
 *
 * These are the only values the system accepts for classification. They exist
 * as frozen arrays rather than loose strings so that a future extraction step
 * cannot quietly invent a new category, and so the TypeScript union and the
 * PostgreSQL enum stay in step - the values below are byte-identical to the
 * enum types created in the initial migration.
 */

/** The four validated strategic themes. Geography is a vector, not a theme. */
export const STRATEGIC_THEMES = [
  "active_trading",
  "wealth_long_term_savings",
  "on_chain_infrastructure",
  "money_payments",
] as const;

/** AI, data and community are a selective enabling layer, not a theme. */
export const ENABLING_LAYERS = ["ai", "data", "community", "none"] as const;

export const STRATEGIC_VECTORS = [
  "geographic_entry",
  "regulatory_acceleration",
  "product_expansion",
  "technology_ip",
  "talent",
  "customer_acquisition",
  "aua_acquisition",
  "infrastructure",
  "defensive_move",
] as const;

/** Deal size never decides the path; the operating role does. */
export const TARGET_PATHS = ["platform", "tuck_in", "hybrid"] as const;

/** The paths that own a scorecard. `hybrid` is scored as both, never averaged. */
export const SCORABLE_PATHS = ["platform", "tuck_in"] as const;

export const TARGET_OBJECTS = [
  "full_company",
  "regulated_subsidiary",
  "business_unit",
  "product_ip",
  "team_acquihire",
  "customer_book",
  "license_entity",
  "minority_investment",
] as const;

export const CUSTOMER_TYPES = [
  "mass_retail",
  "affluent",
  "active_trader",
  "crypto_native",
  "adviser_ria",
  "institutional",
  "developer_builder",
  "smb_business",
] as const;

export const PRODUCT_LAYERS = [
  "brokerage",
  "options_futures",
  "execution_oms",
  "market_data",
  "retirement",
  "managed_portfolios",
  "payments",
  "e_money",
  "custody",
  "wallet",
  "tokenization",
  "stablecoin",
  "dex",
  "prediction_markets",
  "ai_analytics",
  "social_community",
] as const;

export const REGULATORY_ROLES = [
  "broker_dealer",
  "investment_firm",
  "fcm_derivatives",
  "bank",
  "emi_payment_institution",
  "casp_vasp",
  "custodian",
  "asset_wealth_manager",
  "pension_super",
  "unregulated_technology",
] as const;

export const ECONOMICS_TYPES = [
  "transaction_led",
  "spread_led",
  "interest_led",
  "aua_management_fee",
  "subscription",
  "payments_interchange",
  "b2b_saas",
  "mixed",
] as const;

export const MA_STATES = [
  "independent",
  "strategic_investor",
  "sponsor_backed",
  "sale_process",
  "announced_acquisition",
  "pending",
  "completed",
  "terminated",
  "divestiture_carveout_candidate",
] as const;

/**
 * Evidence kinds. `analysis` is research judgement and can never be promoted to
 * `verified_fact`; `unknown` is a real state, not an absence of a record.
 */
export const CLAIM_KINDS = [
  "verified_fact",
  "company_reported",
  "estimate",
  "analysis",
  "unknown",
] as const;

export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;

export const SOURCE_TYPES = [
  "regulator_registry",
  "securities_filing",
  "company_official",
  "transaction_party",
  "investor",
  "financial_press",
  "specialist_database",
  "trade_press",
  "other",
] as const;

/** Trust belongs to the publisher. AI confidence is stored separately. */
export const SOURCE_TRUST_TIERS = ["primary", "secondary", "tertiary"] as const;

export const VERIFICATION_STATUSES = ["unverified", "verified", "disputed", "superseded"] as const;

export const CLAIM_SOURCE_RELATIONS = ["supports", "contradicts"] as const;

/**
 * Whether a numeric observation is known at all. `unknown` and `not_applicable`
 * are different states, and neither is ever rendered as zero.
 */
export const VALUE_STATUSES = ["disclosed", "estimated", "unknown", "not_applicable"] as const;

/**
 * Transaction lifecycle. Reaching `closed` requires an actual close date; an
 * expected closing date never advances the state on its own.
 */
export const DEAL_STATUSES = [
  "rumored",
  "announced",
  "signed",
  "regulatory_review",
  "closed",
  "integrated",
  "divested",
  "terminated",
] as const;

export const LICENSE_STATUSES = [
  "active",
  "applied",
  "variation_requested",
  "suspended",
  "withdrawn",
  "revoked",
  "unknown",
] as const;

export const FUNDAMENTAL_ARCHETYPES = [
  "brokerage_active_trading",
  "wealth_savings",
  "payments_e_money",
  "crypto_on_chain",
  "b2b_infrastructure_saas",
  "team_ip_tuck_in",
] as const;

export const EVENT_TYPES = [
  "acquisition",
  "divestiture",
  "strategic_review",
  "carve_out",
  "minority_investment",
  "funding",
  "down_round",
  "debt_distress",
  "layoffs",
  "shutdown",
  "founder_exit",
  "license_grant",
  "license_application",
  "license_variation",
  "license_suspension",
  "license_withdrawal",
  "enforcement",
  "change_of_control",
  "product_launch",
  "kpi_change",
  "security_incident",
  "custody_incident",
  "privacy_incident",
  "aml_incident",
  "fraud_incident",
  "conduct_incident",
  "other",
] as const;

export const RECOMMENDATION_STATES = [
  "acquire",
  "invest",
  "partner",
  "build",
  "monitor",
  "pass",
  "research_only",
] as const;

/** The routes an acquisition is measured against before Acquire is allowed. */
export const ALTERNATIVE_ROUTES = ["build", "partner", "invest", "monitor"] as const;

/** Marks whether a row is seed identity or something the pipeline produced. */
export const RECORD_ORIGINS = ["bootstrap_identity", "agent_generated"] as const;

export const LIFECYCLE_STATUSES = [
  "research_pending",
  "discovered_unreviewed",
  "under_review",
  "active_candidate",
  "rejected",
] as const;

export const ALIAS_KINDS = ["legal_entity", "brand", "former_name", "working_alias"] as const;

export type StrategicTheme = (typeof STRATEGIC_THEMES)[number];
export type EnablingLayer = (typeof ENABLING_LAYERS)[number];
export type StrategicVector = (typeof STRATEGIC_VECTORS)[number];
export type TargetPath = (typeof TARGET_PATHS)[number];
export type ScorablePath = (typeof SCORABLE_PATHS)[number];
export type TargetObject = (typeof TARGET_OBJECTS)[number];
export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export type ProductLayer = (typeof PRODUCT_LAYERS)[number];
export type RegulatoryRole = (typeof REGULATORY_ROLES)[number];
export type EconomicsType = (typeof ECONOMICS_TYPES)[number];
export type MaState = (typeof MA_STATES)[number];
export type ClaimKind = (typeof CLAIM_KINDS)[number];
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];
export type SourceType = (typeof SOURCE_TYPES)[number];
export type SourceTrustTier = (typeof SOURCE_TRUST_TIERS)[number];
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export type ClaimSourceRelation = (typeof CLAIM_SOURCE_RELATIONS)[number];
export type ValueStatus = (typeof VALUE_STATUSES)[number];
export type DealStatus = (typeof DEAL_STATUSES)[number];
export type LicenseStatus = (typeof LICENSE_STATUSES)[number];
export type FundamentalArchetype = (typeof FUNDAMENTAL_ARCHETYPES)[number];
export type EventType = (typeof EVENT_TYPES)[number];
export type RecommendationState = (typeof RECOMMENDATION_STATES)[number];
export type AlternativeRoute = (typeof ALTERNATIVE_ROUTES)[number];
export type RecordOrigin = (typeof RECORD_ORIGINS)[number];
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];
export type AliasKind = (typeof ALIAS_KINDS)[number];
