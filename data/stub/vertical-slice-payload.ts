import type { ExtractionPayload } from "@/src/pipeline/extraction-payload";

/**
 * A hand-written stand-in for the extraction the Claude adapter will perform in
 * Milestone 3.
 *
 * Everything below is INVENTED. The URLs point at example.com, every publisher
 * is labelled a stub source, and every statement carries a STUB marker. That is
 * deliberate and not laziness:
 *
 *   - The project's stage-two research already contains real, sourced findings
 *     about these companies. Copying those figures into the runtime database
 *     would present research a human did as something the agent discovered,
 *     which is precisely the bootstrap/benchmark/runtime confusion the whole
 *     data model exists to prevent.
 *   - Fabricated-but-realistic numbers about a real company, carrying
 *     real-looking citations, is the worst possible artefact to leave in a
 *     database. If it leaks into a screenshot or a demo, nothing marks it as
 *     fiction. Making it unmistakably synthetic costs nothing and removes that
 *     risk entirely.
 *
 * What is real here is the *shape*: the claim kinds, the source relations, the
 * contradiction, the recorded unknowns, and the scoring inputs all exercise the
 * exact paths that live extraction will use.
 *
 * getquin is chosen because it is a bootstrap identity. The eight gold-benchmark
 * companies are deliberately untouched - they are the exam, and the agent does
 * not get to see the exam.
 */
export const VERTICAL_SLICE_STUB_PAYLOAD: ExtractionPayload = {
  companySlug: "getquin",
  provenance: "stub",

  sources: [
    {
      key: "stub-press",
      url: "https://example.com/stub/tech-press/quin-technologies-round",
      urlNormalized: "example.com/stub/tech-press/quin-technologies-round",
      title: "STUB: European wealth app raises a Series A extension",
      publisher: "Example Tech Press (STUB SOURCE)",
      sourceType: "trade_press",
      trustTier: "secondary",
      publishedAt: "2026-05-19",
    },
    {
      key: "stub-register",
      url: "https://example.com/stub/company-register/quin-technologies-gmbh",
      urlNormalized: "example.com/stub/company-register/quin-technologies-gmbh",
      title: "STUB: Commercial register extract",
      publisher: "Example Company Register (STUB SOURCE)",
      sourceType: "regulator_registry",
      trustTier: "primary",
      publishedAt: null,
    },
    {
      key: "stub-company",
      url: "https://example.com/stub/company/getquin-about",
      urlNormalized: "example.com/stub/company/getquin-about",
      title: "STUB: Company about page",
      publisher: "Example Company Page (STUB SOURCE)",
      sourceType: "company_official",
      trustTier: "primary",
      publishedAt: "2026-06-01",
    },
  ],

  claims: [
    {
      key: "legal-entity",
      subject: "getquin",
      predicate: "registered_legal_entity",
      valueText:
        "STUB: QUIN Technologies GmbH is recorded as the operating entity behind the getquin brand.",
      valueStatus: "disclosed",
      asOfDate: "2026-05-19",
      claimKind: "verified_fact",
      verificationStatus: "verified",
      aiConfidence: "high",
      sources: [
        {
          sourceKey: "stub-register",
          relation: "supports",
          excerpt: "STUB EXCERPT: register entry naming the operating entity.",
        },
      ],
    },
    {
      key: "regulatory-scope",
      subject: "getquin",
      predicate: "regulatory_permissions",
      valueText:
        "STUB: operates under limited investment-intermediation permissions; the full licensed scope is not established.",
      valueStatus: "disclosed",
      asOfDate: "2026-05-19",
      claimKind: "verified_fact",
      verificationStatus: "verified",
      aiConfidence: "medium",
      sources: [
        {
          sourceKey: "stub-register",
          relation: "supports",
          excerpt: "STUB EXCERPT: permissions section of the register entry.",
        },
      ],
    },
    // The two claims below disagree, on purpose. They share a conflict group,
    // and neither overwrites the other - the profile shows both and says so.
    {
      key: "users-press",
      subject: "getquin",
      predicate: "registered_users",
      valueNumeric: 1_200_000,
      valueUnit: "registered users",
      valueStatus: "estimated",
      asOfDate: "2026-05-19",
      claimKind: "estimate",
      aiConfidence: "low",
      conflictGroup: "registered-user-count",
      sources: [
        {
          sourceKey: "stub-press",
          relation: "supports",
          excerpt: "STUB EXCERPT: press article citing an approximate user base.",
        },
      ],
    },
    {
      key: "users-company",
      subject: "getquin",
      predicate: "registered_users",
      valueNumeric: 900_000,
      valueUnit: "registered users",
      valueStatus: "disclosed",
      asOfDate: "2026-06-01",
      claimKind: "company_reported",
      aiConfidence: "medium",
      conflictGroup: "registered-user-count",
      sources: [
        {
          sourceKey: "stub-company",
          relation: "supports",
          excerpt: "STUB EXCERPT: company page stating a registered-user figure.",
        },
        {
          sourceKey: "stub-press",
          relation: "contradicts",
          excerpt: "STUB EXCERPT: the same press article gives a materially higher figure.",
        },
      ],
    },
    {
      key: "funding",
      subject: "getquin",
      predicate: "last_funding_round_amount",
      valueNumeric: 12_000_000,
      valueUnit: "round size",
      valueCurrency: "EUR",
      valueStatus: "disclosed",
      asOfDate: "2026-05-19",
      claimKind: "company_reported",
      aiConfidence: "medium",
      sources: [
        {
          sourceKey: "stub-press",
          relation: "supports",
          excerpt: "STUB EXCERPT: announcement of the round size.",
        },
      ],
    },
    {
      key: "headcount",
      subject: "getquin",
      predicate: "headcount",
      valueNumeric: 85,
      valueUnit: "employees",
      valueStatus: "estimated",
      asOfDate: "2026-05-19",
      claimKind: "estimate",
      aiConfidence: "low",
      sources: [
        {
          sourceKey: "stub-press",
          relation: "supports",
          excerpt: "STUB EXCERPT: approximate team size mentioned in passing.",
        },
      ],
    },
    // A recorded gap. Writing this down is the point: the absence of revenue is
    // itself a finding, and it must never be rendered as zero.
    {
      key: "revenue-unknown",
      subject: "getquin",
      predicate: "annual_revenue",
      valueStatus: "unknown",
      valueNumeric: null,
      asOfDate: null,
      claimKind: "unknown",
      unknownReason:
        "STUB: annual revenue is not disclosed by this private company and was not found in any checked source.",
      aiConfidence: "high",
      sources: [
        {
          sourceKey: "stub-company",
          relation: "supports",
          excerpt: "STUB EXCERPT: company page discloses no financial figures.",
        },
      ],
    },
  ],

  metrics: [
    {
      metricType: "registered_users",
      valueNumeric: 900_000,
      valueUnit: "registered users",
      valueStatus: "disclosed",
      asOfDate: "2026-06-01",
      claimKey: "users-company",
      confidence: "medium",
    },
    {
      metricType: "last_funding_round_amount",
      valueNumeric: 12_000_000,
      valueUnit: "round size",
      currency: "EUR",
      valueStatus: "disclosed",
      asOfDate: "2026-05-19",
      claimKey: "funding",
      confidence: "medium",
    },
    {
      metricType: "headcount",
      valueNumeric: 85,
      valueUnit: "employees",
      valueStatus: "estimated",
      asOfDate: "2026-05-19",
      claimKey: "headcount",
      confidence: "low",
    },
    // Unknown: nobody has published it.
    {
      metricType: "annual_revenue",
      valueNumeric: null,
      valueUnit: null,
      valueStatus: "unknown",
      asOfDate: null,
      claimKey: "revenue-unknown",
      confidence: null,
    },
    // Not applicable: a different state entirely. This company does not hold
    // client assets, so assets under administration is not a gap in the
    // evidence - it is a measure that does not apply to this business.
    {
      metricType: "assets_under_administration",
      valueNumeric: null,
      valueUnit: null,
      valueStatus: "not_applicable",
      asOfDate: null,
      claimKey: null,
      confidence: null,
    },
  ],

  fundamentals: {
    archetype: "wealth_savings",
    revenueQuality:
      "STUB: monetisation is understood to be subscription-led, but the split between subscription and other revenue is not evidenced.",
    growthAssessment:
      "STUB: user growth is the only observable growth signal, and the two available figures disagree.",
    marginAssessment: "STUB: no margin data is available in any checked source.",
    burnRunway:
      "STUB: burn and runway are not disclosed; the recent round is the only liquidity signal.",
    concentration:
      "STUB: customer concentration is low by the nature of a consumer product, but partner dependence is not established.",
    // Deliberately does not restate the revenue gap: the `revenue-unknown`
    // claim already records it, with a more specific reason, and the profile
    // collects unknowns from every layer.
    unknowns: [
      "Subscription-versus-other revenue mix is not disclosed",
      "Gross margin is not disclosed",
      "Burn and runway are not disclosed",
    ],
    claimLinks: [
      { claimKey: "revenue-unknown", field: "revenue_quality" },
      { claimKey: "users-company", field: "growth_assessment" },
      { claimKey: "users-press", field: "growth_assessment" },
      { claimKey: "funding", field: "burn_runway" },
    ],
  },

  assessment: {
    thesisVersion: "v0.2-stub",
    path: "tuck_in",
    strategicFitSummary:
      "STUB: sits in the wealth and long-term savings theme with an AI, data and community enabling layer.",
    gapClosed:
      "STUB: portfolio aggregation and planning UX that would otherwise need to be built in-house.",
    whyNow: "STUB: a recent funding round sets a current reference point for a conversation.",
    synergies: "STUB: an engaged retail user base overlapping the existing distribution footprint.",
    risks:
      "STUB: the licensed perimeter is only partly established, and the user-base figures do not agree.",
    counterThesis:
      "STUB: the aggregation feature set is reproducible in-house, and with no revenue evidence the case rests entirely on users and team.",
    unknowns: [
      "Licensed scope is only partly established",
      "No valuation evidence, so acquisition plausibility cannot be scored",
    ],
    claimLinks: [
      { claimKey: "funding", role: "why_now" },
      { claimKey: "regulatory-scope", role: "risks" },
      { claimKey: "users-company", role: "synergies" },
      { claimKey: "legal-entity", role: "strategic_fit_summary" },
    ],
  },

  /**
   * Structured inputs for the deterministic engine - never a score.
   *
   * `acquisition_plausibility` is deliberately `unknown`: no valuation evidence
   * exists, so it stays in the coverage denominator without being scored. That
   * single decision is what stops this company from qualifying for Acquire no
   * matter how well it scores elsewhere, which is the behaviour the scoring
   * design exists to produce.
   */
  scoring: {
    path: "tuck_in",
    subtype: null,
    dimensions: {
      product_capability_gap_closed: { status: "scored", score: 4 },
      technology_ip_data_team: { status: "scored", score: 4 },
      speed_to_market_vs_build: { status: "scored", score: 4 },
      distribution_leverage: { status: "scored", score: 4 },
      strategic_theme_fit: { status: "scored", score: 5 },
      integration_feasibility: { status: "scored", score: 3 },
      acquisition_plausibility: {
        status: "unknown",
        reason: "STUB: no valuation or shareholder evidence was found.",
      },
      why_now_competitive_scarcity: { status: "scored", score: 3 },
    },
    risk: {
      regulatory_change_of_control: {
        value: 1,
        reason: "STUB: licensed perimeter only partly established.",
      },
      aml_sanctions_security_custody: { value: 0 },
      integration_technology_data_migration: {
        value: 2,
        reason: "STUB: account-linking data would need migration and re-consent.",
      },
      valuation_financing_seller_dynamics: {
        value: 1,
        reason: "STUB: a recent round may have reset price expectations upward.",
      },
      conduct_reputation_customer_concentration: { value: 0 },
    },
    // 93% weighted coverage falls in the >=85% band, which allows 0-2.
    evidencePenalty: 2,
    hardGates: {
      legal_regulatory_impossibility: { state: "clear", evidence: "STUB: no prohibition found." },
      sanctions_aml_financial_crime: { state: "clear", evidence: "STUB: nothing found." },
      entity_mismatch: {
        state: "clear",
        evidence: "STUB: brand maps to a single registered operating entity.",
      },
      non_acquirability: { state: "clear", evidence: "STUB: independent, no sale process found." },
      critical_security_custody_failure: {
        state: "clear",
        evidence: "STUB: no incident found; company does not hold client assets.",
      },
      strategic_contradiction: { state: "clear", evidence: "STUB: none identified." },
      evidence_floor: {
        state: "clear",
        evidence: "STUB: identity and operating status are established.",
      },
    },
    resolution: {
      legalIdentity: "resolved",
      maStatus: "resolved",
      regulatoryPerimeter: "unresolved",
    },
    routeAssessment: {
      acquire: { score: 3, reason: "STUB: plausible, but price and perimeter are unclear." },
      build: { score: 2, reason: "STUB: reproducible, but slower and without the user base." },
      partner: {
        score: 4,
        reason: "STUB: distribution partnership tests the thesis at far lower cost.",
      },
      invest: { score: 3, reason: "STUB: keeps the option open without integration risk." },
      monitor: { score: 2, reason: "STUB: a round has just closed, so nothing is imminent." },
    },
  },
};
