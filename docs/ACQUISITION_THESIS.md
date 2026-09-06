# eToro Acquisition Thesis v1.0 — extracted executable specification

|                      |                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Source**           | [`sources/eToro_Acquisition_Thesis_v1.0_2026-09-06.pdf`](sources/eToro_Acquisition_Thesis_v1.0_2026-09-06.pdf) — 44 pages |
| **Thesis version**   | `thesis/v1.0` — the value stored in `assessments.thesis_version`                                                          |
| **Research cut-off** | 2026-09-06. Anything time-sensitive after that date must be refreshed at runtime                                          |
| **Owner**            | Tom Rabinovich Fuhrer (Corporate Development)                                                                             |
| **Status**           | Authoritative business foundation for this system                                                                         |

## What this file is, and is not

This is the source document reduced to the parts a program can execute, with every
line carrying its section number so a disagreement can be settled against the PDF
rather than against someone's memory of it.

The document labels its own contents in three classes (§2), and that labelling
survives into the code:

- **Documented fact** — a transaction, metric or capability with a source. Becomes data
  and, where §31 requires it, a permanent test.
- **Analytical inference** — a reasoned hypothesis. Stays falsifiable and stays marked.
- **Proposed framework** — the taxonomy, weights, thresholds and cadence. The document
  states plainly that these are _"not an approved internal eToro policy"_, so they are
  stored as versioned, dated, replaceable configuration and never as constants.

It is **not** a target list, and it does not replace live research (§2, §4). It defines
how to think about a company, never which companies exist.

## Open question found by trying to execute it

**§35's coverage figures are unreachable under §26's weights.** The eight dimension
weights are 25, 15, 15, 10, 10, 10, 10 and 5 — every one a multiple of 5. Coverage is
defined as `Σ known weights ÷ 100`, so it can only ever land on a multiple of 5%. Four of
the five calibration examples require 88%, 81%, 72% and 76%.

The most likely reading is §27's _"Keep global weights, but vary sub-metrics by family"_:
coverage is measured across **sub-metrics within each dimension**, so a partially
evidenced dimension contributes a fraction of its weight. That produces the fine-grained
percentages the examples use, and it matches §26's insistence that missing evidence is
visible rather than rounded away.

This is recorded rather than silently resolved. `tests/unit/thesis-conformance.test.ts`
asserts the arithmetic the document states; the resolution is a decision for the model
owner.

---

## 1. Scoring model (§26)

One global weight set. Not two path-specific scorecards.

| Dimension                          | Weight  | Measures                                                           |
| ---------------------------------- | ------- | ------------------------------------------------------------------ |
| Strategic fit                      | 25      | Explicit connection to a current strategic pillar and material gap |
| Incremental capability             | 15      | Non-overlapping value and advantage over build/partner             |
| Market, customers and distribution | 15      | Audience quality, usage, retention, two-way distribution           |
| Product and technology             | 10      | Quality, IP, data, security, reliability, integration              |
| Financial quality                  | 10      | Growth, contribution, unit economics, resilience                   |
| Regulatory feasibility             | 10      | Valid permissions and ability to deploy intended use               |
| Integration and team               | 10      | Organisational fit, key-person dependency, systems, complexity     |
| Deal feasibility                   | 5       | Valuation, availability, structure, funding, competition           |
| **Total**                          | **100** | Before hard gates; evidence quality reported separately            |

§27: "Keep global weights, but vary sub-metrics by family." Family-specific behaviour lives in
sub-metrics and anchors, never in a second weight vector.

### Formula (§26, worked example §35)

```
score(d)          ∈ {0,1,2,3,4,5}  or  UNKNOWN
contribution(d)   = weight(d) * score(d) / 5
known             = { d : score(d) is not UNKNOWN }

normalized        = Σ contribution(d ∈ known) / Σ weight(d ∈ known) * 100
coverage          = Σ weight(d ∈ known) / 100
lower_bound       = ( Σ contribution(d ∈ known) + 0 ) / 100 * 100
upper_bound       = ( Σ contribution(d ∈ known) + Σ weight(d ∉ known) ) / 100 * 100
```

§35 worked example: 75 weight points known, contribution 60 → normalized 80, coverage 75%,
lower assumes 0 for the missing 25, upper assumes 5.

§26: "A normalized 82 at 55% coverage with a 45-90 range is not '82/100.'
Display 82 · 55% coverage · 45-90 range."

### What must NOT happen

- §26 "An unknown criterion is N/A, not 0 or 3."
- §30 "null means unknown. Zero means examined and weak. They are never interchangeable."
- Principle 5: "Never hide missing information inside a score."
- Principle 6: "Always display score, coverage and uncertainty together."
- §27 "A severe regulatory issue is handled by a gate, not double-counted without policy."
- §27 "No automatic bonus for AI, crypto, a 'hot' geography, a prominent investor or a
  competitor deal. These are research signals."

### Weight governance (§27)

Versioned with date, owner and rationale. "Do not change a weight to promote a known target
after seeing its result." Sensitivity: ranking should survive a 20% relative change in each
material weight.

---

## 2. Dimension anchors (§27)

Scored 0–5. Anchors given for 0-1, 3, 5.

| Dimension              | 0–1                                    | 3                                              | 5                                                       |
| ---------------------- | -------------------------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| Strategy               | No link or conflicts with direction    | Reasonable link to a secondary gap             | Solves an explicit, current and material gap            |
| Incremental capability | Overlapping / easy to replicate        | Partial addition or moderate acceleration      | Scarce asset and material advantage over alternatives   |
| Market/customers       | No reliable usage or complete overlap  | Relevant audience with partial evidence        | Strong usage/retention and proven two-way distribution  |
| Product/technology     | Unstable, weak rights or unsafe        | Good product with manageable debt/dependencies | High quality, clear ownership, demonstrated integration |
| Financial              | Negative units without plausible path  | Reasonable economics or controlled investment  | Strong, resilient contribution and cash quality         |
| Regulatory             | Use prohibited or gap cannot be solved | Plausible approval path with conditions        | Verified suitable permissions and relatively low risk   |
| Integration            | Severe technical/organisational break  | Feasible plan with defined dependencies        | Complementary systems/team and clear owners             |
| Deal feasibility       | Unavailable / unfinanceable            | Possible but expensive or competitive          | Executable structure and value with willing parties     |

**Consistency rule (§27):** a score of 5 requires at least one primary source, or two suitable
independent pieces of evidence, plus a described value mechanism.

Geographic sub-anchor (§21) is a separate 0–5 scale feeding regulatory/market, not its own dimension.

---

## 3. Thresholds (§26) — configurable and versioned, not policy

| Band   | Action                                                                          |
| ------ | ------------------------------------------------------------------------------- |
| 80–100 | Priority research/outreach — **requires coverage ≥ 75% and no unresolved gate** |
| 65–79  | Shortlist, partner or watch                                                     |
| 50–64  | Conditional watchlist                                                           |
| 0–49   | Do not advance now                                                              |

§42 restates: "A Priority label requires at least 80 normalized points, 75% coverage and no
unresolved gate, but these are proposed calibration settings rather than known eToro policy."

---

## 4. Hard gates (§28)

A gate blocks advancement regardless of score.

| Gate          | Trigger                                                                 | Agent result                                   |
| ------------- | ----------------------------------------------------------------------- | ---------------------------------------------- |
| Entity        | Target identity, parent or ownership uncertain                          | Stop; resolve entity **before scoring**        |
| Regulatory    | No permission for intended use, or control-change continuity unassessed | Blocked · Legal/Regulatory review              |
| Client-assets | Reconciliation, segregation or ownership gap                            | Immediate stop and escalation                  |
| Security      | Open breach, unclear key control, unauditable security                  | Stop pending independent review                |
| Integrity     | Activity, revenue or customer origin suspicious or unreproducible       | Do not advance; forensic review                |
| Deal          | Already acquired, not for sale, or structurally impossible              | Precedent/watch, **not target recommendation** |
| Coverage      | Scoring coverage **below 60%**                                          | Research only; no shortlist                    |

Note the entity gate is ordered **before** scoring, not evaluated alongside it.

**Red flags that are NOT gates (§28):** customer/supplier concentration, declining retention,
employee churn, technical debt, change-of-control clauses, litigation, founder dependency,
imminent funding need, investor preferences, single-asset exposure, inconsistent data.

---

## 5. Target taxonomy (§10)

Nine families. One primary family plus secondary tags. "Do not stack automatic bonuses for every tag."

| Code | Family                                 | Asset acquired                                       | Precedent                        |
| ---- | -------------------------------------- | ---------------------------------------------------- | -------------------------------- |
| A    | Brokerage and advanced trading         | Operations, product, infrastructure, traders         | Gatsby; pending TradeZero        |
| B    | Local savings and wealth               | Savings product, distribution, customer relationship | Spaceship                        |
| C    | Analytics, information and community   | Usage, insight, data, portfolio experience           | Delta; Bullsheet; BullAware      |
| D    | AI and developer tools                 | Technology, IP, process, team                        | Deep; App Store direction        |
| E    | Wallets and user control               | Security, signing, recovery, on-chain access         | Zengo                            |
| F    | Regulated crypto access                | Local operation, fiat conversion, customers          | Bit2C                            |
| G    | Payments and money services            | Rails, accounts, money operations                    | Marq Millions                    |
| H    | Market infrastructure and tokenization | Technology, trading/settlement mechanisms            | Firmo; on-chain direction        |
| I    | Compliance and operational automation  | Efficiency and controls                              | Conditional analytical extension |

Three additional axes:

- **Move:** market entry · product completion · team/IP acquisition · distribution · vertical integration · defence
- **Customer:** beginner · long-term investor · active trader · affluent client · adviser · institution
- **Model:** B2C · B2B · B2B2C

Classification rule (§10): "A trading-software provider to brokers belongs in H or D based on the
core asset, not A merely because customers are brokers. A retirement app remains B even if it
markets itself as a digital bank."

**Not automatically in scope (§19):** consumer credit/BNPL, full bank, hospitality POS/merchant
acquiring, mining/tokens/asset speculation, generic software vendor — each with a stated exception
condition.

---

## 6. Strategic pillars (§3, §7)

eToro's own management language, four pillars: **Trading · Investing · Wealth Management · Neo-Banking**.

AI, developer ecosystems and blockchain-based finance are **cross-cutting enablers, not pillars** (§3).

Gap statements per pillar are analytical framework, not management language (§7).

**Current baseline that must not be re-counted as a gap (§7):** as of July 2026 eToro has the Tori
app, active-trader tools, sub-accounts, an app ecosystem, and Zengo-based wallet capability.

---

## 7. Routes (§23) — the best alternative is mandatory

| Route                  | When it fits                                                                                     | Main risk                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Build                  | Capability close to core, requirements clear, no scarce asset, market not closing                | Time, execution, missed window                              |
| Partner                | Demand can be tested, or a specialist/local institution operates it better                       | Dependency, limited control of economics/experience         |
| Buy                    | IP, team, operations, permissions or customers cannot be replicated at reasonable cost and speed | Price, approvals, integration, damage to the acquired asset |
| Invest / option to buy | Direction promising but uncertain; information rights or future options create value             | Limited influence, conflicts                                |
| Watch                  | Thesis attractive but evidence, timing or valuation is not                                       | Competitor may move first; explicit triggers required       |

§23: "The agent must always present the second-best route. If there is no alternative, the thesis
may be defined too narrowly or research may be incomplete."

---

## 8. Evidence model (§29)

| Level | Typical source                                   | Permitted use                                                          |
| ----- | ------------------------------------------------ | ---------------------------------------------------------------------- |
| A     | Regulator, SEC filing, contract, audited report  | Legal/financial fact within document scope                             |
| B     | Company release, product page, investor material | Status and management statement; marketing performance remains a claim |
| C     | High-quality reporting or transparent database   | Gap filling and triangulation; reported prices labelled as reported    |
| D     | Profile, social post or aggregator               | **Discovery only** unless it is the official primary source            |

This is a **source-quality axis, orthogonal to** fact/forecast/inference.

**Claim object (§30):** subject, predicate, value, unit/currency, measurement period, event date,
publication date, source, supporting excerpt, evidence level, access time, current validity,
extractor identity, reason for change.

**Transaction verification order (§29):** signing announcement → regulatory/exchange filing →
completion confirmation → later financial report → product outcome. "A later explicit completion
source updates an earlier conditional release; the older event remains in history."

**Conflicts (§29):** "Do not silently choose. Preserve versions, compare definitions, dates and
entities, select only with explained precedence and create a next query."

**Confidence ≠ strategic score (§29):** "A company may fit strongly but remain uncertain, or be
perfectly documented and strategically irrelevant."

---

## 9. Temporal rules (§31, §33)

- **Append-only history:** "Never delete the prior value: use `valid_from` and `valid_to`." (§31)
- **Known-as-of:** "Every analysis stores 'known as of.' Historical backtests may use only
  information available by that date." (§33)
- **Look-ahead ban:** "Post-deal information can assess integration outcomes, not retroactively
  justify the original decision." (§33)
- **Freshness cadence (§31):** daily for news and regulators; weekly for company/funding sources;
  quarterly for financials; immediate for deals, enforcement and cyber incidents.
  "This is an operating target, not a real-time guarantee."
- Every event carries **three distinct dates**: event date, reporting period, publication date (§9).

---

## 10. Monitored events (§31)

| Event                               | Fields changed                                               | Impact                                                      |
| ----------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| Funding, debt or valuation reset    | Investors, amount, date, valuation, runway                   | Price, availability, urgency, financing risk                |
| License, restriction or enforcement | Entity, authority, services, status, effective date          | Regulatory gate, closing time, geographic value             |
| Product launch or shutdown          | Product, country, segment, status, suppliers                 | Capability gap, overlap, synergy assumptions                |
| Leadership change or layoffs        | Person, role, date, scale                                    | Team retention, availability, integration risk              |
| Cyber incident                      | Scope, assets, users, remediation, control                   | Hard gate, liabilities, trust repair                        |
| Transaction                         | Rumour, negotiation, signed, approved, completed, terminated | Availability; **signing and completion must stay distinct** |

Change mechanism (§31): entity resolution → atomic claim extraction → version comparison →
conflict detection → materiality ranking → risk-based approval.

Alert must show before, after, source and score impact.

---

## 11. Discovery (§32) — gap-first, not feed-first

"Discovery begins with a defined business gap and ends with an explainable pipeline.
It is not a search for 'interesting fintechs.'"

**Search brief must specify:** strategic pillar · problem · required capability · customer ·
geography · regulated service · size band · deal constraints · success measure.
Example given: "Add Australian retirement savings" beats "buy a savings app."

**Five discovery funnels:**

1. Internal gap — missing product, high external cost, long build time, critical supplier dependence
2. eToro history — adjacent capabilities suggested by precedent, without assuming repetition
3. Competitor moves — capability list for review, **not a copied target list**
4. Regulatory change — market opening, new authorisation, expiring transition
5. Company signals — financing, growth, layoffs, leadership, partnership, launch, withdrawal

**Early screen order:** remove duplicates and already-acquired entities → test thesis boundaries,
customer type, real operations, countries, ownership, permissions, scale, transaction plausibility.
"Do not perform full scoring when identity or basic fit is unresolved."

**Bias control:** "Search private and public companies, B2B and B2C, local and cross-border players,
plus partnership alternatives. Measure source mix. Media presence or high funding is not strategic fit."

**Discovery output:** verified name · category · one-sentence why-now · **at least two sources** ·
availability · main risk · decision whether to open full analysis.

---

## 12. Nine-stage workflow (§33)

1. **Resolve** — verify legal entity, ownership and domain; block name confusion
2. **Status** — test independence, prior/pending deals, availability
3. **Classify** — primary and secondary families plus value-chain role
4. **Map** — connect to eToro gap, pillar, customer, geography
5. **Evidence** — collect atomic, dated claims and contradictions
6. **Gate** — regulation, security, integrity, client assets, dealability, coverage
7. **Analyze** — economics, buy-versus-alternative, synergies, integration, price
8. **Score** — dimensions, normalized score, coverage, uncertainty range
9. **Explain** — recommendation, evidence, counter-case, missing information, smallest next action

**Pipeline status:** Discovered → Screened → Analyzed → Diligence → IC-ready.
**Side paths:** Partner · Watch · Blocked · Unavailable · Closed.
"Every transition requires a condition and evidence. The model cannot restore a blocked target
without new evidence or approval."

---

## 13. Output contract (§34)

| Field             | Required content                                                                  |
| ----------------- | --------------------------------------------------------------------------------- |
| Recommendation    | Priority diligence / Shortlist / Partner / Watch / Do not advance / Blocked       |
| One-line thesis   | Capability acquired, gap closed, expected outcome                                 |
| Strategic mapping | Pillar, category, customer, geography, value-chain role                           |
| Score             | Normalized score, coverage, lower/upper range, weight version, date               |
| Evidence          | Three to five decisive claims with sources and dates                              |
| Counter-case      | Strongest reason not to buy, and best alternative                                 |
| Gates             | Pass/fail/unknown for every gate with action owner                                |
| Economics         | Price range, synergy bridge, sensitivities, conditional walk-away ceiling         |
| Integration       | What integrates or stays independent, critical systems, team, 30/100/365-day plan |
| Next action       | Highest-value diligence question, owner, due date                                 |

**Language rules (§34):** label fact, inference and assumption. Say "unknown" rather than filling a
gap. Avoid "leading", "unique", "synergistic" without a benchmark. A company forecast stays a forecast.

**Recommendation-change delta (§34):** new event · fields changed · dimensions affected · score
movement · gate opened/closed · approver.
"A weight-only change is a model update, not a company event."

---

## 14. Acceptance tests — ready to implement

### 14a. Permanent smoke test (§31)

> "Zengo and Bit2C must show completed; TradeZero pending; B2C2 a different SBI-owned company.
> **Failure disables automatic recommendations.**"

| Entity    | Required state                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------- |
| Zengo     | eToro acquisition, **completed Q2 2026** (agreement announced 2026-04-15)                          |
| Bit2C     | eToro acquisition of business/activity, **completed Q2 2026**                                      |
| TradeZero | **Pending** — signed 2026-08-11, closing expected H1 2027, subject to approvals                    |
| B2C2      | **Not an eToro acquisition.** SBI-consolidated subsidiary since December 2020. Distinct from Bit2C |

### 14b. Five fictional calibration companies (§35)

| Candidate    | Score / coverage | Gate                | Required output                                     |
| ------------ | ---------------- | ------------------- | --------------------------------------------------- |
| AlphaVest    | 82 / 88%         | Open                | Priority diligence                                  |
| BetaOptions  | 77 / 81%         | Regulatory unknown  | Conditional shortlist; not IC before review         |
| GammaAI      | 45 / 72%         | Open                | Do not advance; consider vendor only                |
| DeltaCustody | 74 / 76%         | Security blocked    | **Blocked — score cannot override the gate**        |
| EpsilonReg   | 68 / 60%         | Coverage incomplete | Research/Partner; not Priority until coverage ≥ 75% |

What each proves: AlphaVest — a direct-fit candidate rises. BetaOptions — unresolved gate limits
action. GammaAI — no AI-label bias. DeltaCustody — a serious gate overrides score.
EpsilonReg — no false confidence under sparse data.

§35 warning: "Do not tune thresholds until every historical eToro deal 'passes.'"

### 14c. Test classes (§36)

| Class       | Test                                                | Acceptance condition                                        |
| ----------- | --------------------------------------------------- | ----------------------------------------------------------- |
| Identity    | Bit2C vs B2C2; brand vs legal entity                | No false merge or licence leakage between entities          |
| Deal status | Signing, completion, cancellation, conditions       | Verb/date match primary source; TradeZero is not "acquired" |
| Time        | As-of-date backtest                                 | No future information; every claim has an effective date    |
| Numbers     | Currency, unit, period, definition                  | AUA, funded accounts, price and revenue never substitute    |
| Citation    | Claim-to-source traceability                        | Every material claim opens to evidence; conflicts persist   |
| Gates       | High score with unresolved cyber or licensing issue | Recommendation blocked or conditional by policy             |
| Uncertainty | Remove critical financial fields                    | Coverage falls, range widens, **no zero fill**              |
| Explanation | Weight change vs fact change                        | Agent explains the two deltas differently                   |

### 14d. Mandatory contradiction log (§9)

| Case                            | Correct handling                                                                |
| ------------------------------- | ------------------------------------------------------------------------------- |
| Marq: 2019 vs 2020              | Store publication dates and alternative reports; exact completion remains a gap |
| Deep: agreement vs narrative    | Classify as asset/IP deal from the note; do not silently merge dates            |
| Spaceship: AUD vs USD           | Store currency and consideration basis; do not compare without reconciliation   |
| Zengo: conditional announcement | Later completion evidence updates current status without erasing history        |
| July launch inside Q2 release   | Keep event date, reporting period and publication date distinct                 |

---

## 15. Metric-definition traps (§4, §6, §24, §30)

Definitions the system must never conflate:

- **Net Contribution** = total revenue and other income − crypto cost of revenue − margin interest
  expense. Measured before general operating expenses. **Not net income.**
- **AUA vs AUM** — administration, custody and discretionary management are different roles.
  Market appreciation is not new asset gathering.
- **Funded accounts** — eToro's core definition requires onboarding, activation, deposit and trade.
  The Zengo/Bit2C 110,000 accounts used a positive-balance definition instead.
- **Crypto revenue** — gross revenue can include the value of assets sold; revenue multiples are
  unreliable without gross-versus-net presentation.
- **Client assets are not eToro cash.** Reported corporate cash ($1.2bn at June 2026) is not a
  disclosed acquisition budget.
- **Deal consideration fields are distinct:** enterprise value, equity value, maximum consideration,
  cash at close, shares, earn-out, rollover, assumed debt, holdback, transaction cost.
  Spaceship: AUD 80m headline vs US$20.796m acquisition-date accounting consideration.

Per business model, the metrics that matter and the common trap (§24):

| Model            | Core metrics                                                                                     | Common trap                                             |
| ---------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Broker / venue   | Active/funded accounts, assets, volume, net revenue, contribution, retention, concentration      | Volatility-driven or gross revenue; non-organic volume  |
| Savings / wealth | Fee-paying assets, net flows, revenue yield, retention, recurring deposits                       | Market appreciation as gathering; AUA as AUM            |
| SaaS / AI        | ARR, growth, gross retention, NRR, gross margin, CAC payback, supplier dependency                | ARR includes one-offs; model cost omitted from margin   |
| Payments         | TPV, net take rate, successful transactions, fraud losses, processing cost, revenue per customer | TPV or gross revenue treated as contribution            |
| Wallet / crypto  | Active funded wallets, assets, actions, net revenue, retention, security cost                    | Downloads or addresses inflated; asset value as revenue |

---

## 16. Governance and red lines (§37)

- The agent "does not negotiate, approve a transaction or independently interpret local law."
- Gate override only with documented approval. Override requires owner, rationale, expiry, evidence.
- "The model may not contact a target, reveal interest, change CRM state or send external material
  without explicit approval."
- Red line: "do not provide inside information, customer data or restricted material to any model or
  vendor not approved for that information classification."
- Weights restricted to owners; versioned claim editing; broad reading.

---

## 17. Standing corrections the system must encode (§8, §9, §10, §39)

1. Zengo — completed Q2 2026.
2. Bit2C — completed Q2 2026. Acquisition of business/activity; do not assert every share was acquired.
3. TradeZero — signed 2026-08-11, **pending**, expected H1 2027. Not consolidated.
4. B2C2 ≠ Bit2C. B2C2 is SBI-owned since December 2020, not an eToro precedent.
5. Deep — asset and IP purchase ($525,000 cash + 39,000 shares, Oct 2023 agreement).
   No evidence it powers Tori or all eToro AI.
6. Marq Millions — EMI precedent, not a bank acquisition. 2019 vs 2020 dates conflict; unresolved.
7. Generali and Papaya Global are **partnerships**, not acquisitions. Extended is an **investment**.
8. Signing, regulatory approval and completion are always separate stored events.
9. Historical acquisitions are **benchmarks, not available targets**.
