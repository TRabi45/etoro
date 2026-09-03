import type { BootstrapCompany } from "@/src/validation/bootstrap";

/**
 * The minimal bootstrap universe: six company identities and nothing else.
 *
 * Every field below is identity, alias, domain, theme or a search lead. There
 * are no scores, no recommendations, no KPIs, no funding amounts, no licences,
 * no valuations, no ownership conclusions and no copied report prose - the
 * production agent has to go and find all of that itself, with sources and run
 * provenance attached.
 *
 * The eight gold-benchmark companies (PensionBee, Lightyear, Plum, Fintual,
 * Archax, Utila, QuantConnect, AfterHour) are deliberately absent. They live in
 * `tests/evaluation/gold/`, outside every production module, so the agent can be
 * measured against research it never had access to.
 */
export const BOOTSTRAP_COMPANIES: readonly BootstrapCompany[] = [
  {
    canonicalName: "getquin",
    slug: "getquin",
    legalEntityName: "QUIN Technologies GmbH",
    primaryDomain: "getquin.com",
    aliases: [
      { alias: "QUIN Technologies GmbH", aliasKind: "legal_entity", isExactLegalEntity: true },
      { alias: "getquin", aliasKind: "brand", isExactLegalEntity: false },
    ],
    themeTags: ["wealth_long_term_savings"],
    enablingLayers: ["ai", "data", "community"],
    searchLeads: [
      { label: "imprint/terms" },
      { label: "May 2026 funding" },
      { label: "product pages" },
    ],
  },
  {
    canonicalName: "Dfns",
    slug: "dfns",
    legalEntityName: "DFNS SAS",
    primaryDomain: "dfns.co",
    aliases: [
      { alias: "DFNS SAS", aliasKind: "legal_entity", isExactLegalEntity: true },
      { alias: "Dfns", aliasKind: "brand", isExactLegalEntity: false },
    ],
    themeTags: ["on_chain_infrastructure"],
    enablingLayers: ["none"],
    searchLeads: [
      { label: "legal/privacy" },
      { label: "Series A" },
      { label: "product/security docs" },
    ],
  },
  {
    canonicalName: "Swan",
    slug: "swan",
    legalEntityName: "Swan SAS",
    primaryDomain: "swan.io",
    aliases: [
      { alias: "Swan SAS", aliasKind: "legal_entity", isExactLegalEntity: true },
      { alias: "Swan", aliasKind: "brand", isExactLegalEntity: false },
    ],
    themeTags: ["money_payments"],
    enablingLayers: ["none"],
    searchLeads: [
      { label: "legal notice" },
      { label: "ACPR/REGAFI" },
      { label: "Series B" },
      { label: "partner metrics" },
    ],
  },
  {
    canonicalName: "Alpaca",
    slug: "alpaca",
    legalEntityName: "AlpacaDB, Inc.",
    primaryDomain: "alpaca.markets",
    aliases: [
      { alias: "AlpacaDB, Inc.", aliasKind: "legal_entity", isExactLegalEntity: true },
      {
        alias: "Alpaca Clearing LLC",
        aliasKind: "legal_entity",
        isExactLegalEntity: true,
        notes: "Group entity; distinct from the parent.",
      },
      {
        alias: "Alpaca Crypto LLC",
        aliasKind: "legal_entity",
        isExactLegalEntity: true,
        notes: "Group entity; distinct from the parent.",
      },
      { alias: "Alpaca", aliasKind: "brand", isExactLegalEntity: false },
    ],
    themeTags: ["active_trading", "on_chain_infrastructure"],
    enablingLayers: ["none"],
    searchLeads: [
      { label: "legal disclosures" },
      { label: "FINRA/SEC" },
      { label: "July 2026 round" },
      { label: "EU page" },
    ],
  },
  {
    canonicalName: "Hypernative",
    slug: "hypernative",
    // The parent/entity perimeter is not established in public evidence, so the
    // legal entity stays null rather than guessing at one.
    legalEntityName: null,
    primaryDomain: "hypernative.io",
    aliases: [
      {
        alias: "Hypernative",
        aliasKind: "brand",
        isExactLegalEntity: false,
        notes: "Parent entity perimeter unresolved; not recorded as a legal entity.",
      },
    ],
    themeTags: ["on_chain_infrastructure"],
    enablingLayers: ["ai", "data"],
    searchLeads: [
      { label: "legal entity confirmation" },
      { label: "Series B" },
      { label: "product metrics" },
      { label: "security audits" },
    ],
  },
  {
    canonicalName: "Griffin",
    slug: "griffin",
    legalEntityName: "Griffin Bank Ltd",
    primaryDomain: "griffin.com",
    aliases: [
      { alias: "Griffin Bank Ltd", aliasKind: "legal_entity", isExactLegalEntity: true },
      { alias: "Griffin", aliasKind: "brand", isExactLegalEntity: false },
    ],
    themeTags: ["money_payments"],
    enablingLayers: ["none"],
    searchLeads: [
      { label: "FCA/PRA register" },
      { label: "company facts" },
      { label: "financial statements" },
      { label: "change-of-control rules" },
    ],
  },
];

/** Exactly six identities. The count is asserted in the test suite. */
export const BOOTSTRAP_COMPANY_COUNT = BOOTSTRAP_COMPANIES.length;
