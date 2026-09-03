# AI Log — eToro M&A Intelligence Agent

**Owner:** Tom Rabinovich Fuhrer
**Started:** September 2026
**Format:** Milestone-based log

## How This Log Is Maintained

This is not a record of every prompt or small task. It is a record of the major milestones in the project and the role AI played in reaching them.

For each milestone, the log captures:

- The AI tools and models used, and why they were selected.
- The meaningful ways AI accelerated the work.
- Important failures, hallucinations, or misleading directions.
- How AI output was checked and corrected.
- Decisions I made independently or against the AI's recommendation.

The log will be updated only when the project reaches a meaningful research, product, engineering, testing, or delivery milestone.

---

## Milestone 1 — Preparing to Work Effectively with AI

Before beginning the project, I watched a YouTube video about prompt engineering. My goal was to improve how I give context, define expected outputs, challenge assumptions, and verify AI-generated work throughout the assignment.

This influenced the way I approached the project. Instead of asking AI to immediately generate a product or write code, I tried to break the assignment into stages and give the model the business context required for each stage.

The main lesson I carried into the project was that a well-written answer is not necessarily a correct answer. I therefore treated AI output as a proposal to inspect rather than a final decision.

---

## Milestone 2 — Understanding eToro Before Designing the Agent

### AI used

I started with **GPT-5.6 Sol, medium reasoning**.

I selected medium reasoning because I do not have unlimited usage, but this stage still required high-quality and logically consistent analysis. I wanted a reasonable balance between depth and token usage before moving to more expensive research or implementation workflows.

### What I used it for

I used the model to structure my initial research into:

- eToro's business model and main products.
- Its major revenue drivers.
- Its growth priorities and key markets.
- Its regulatory footprint.
- Its previous acquisitions and the strategic reason behind each one.
- The beginnings of an eToro-specific acquisition thesis.

I also researched the M&A strategies of eToro's competitors, including how they use acquisitions to enter markets, obtain licenses, add products, acquire technology, and strengthen their user bases.

The research highlighted four areas in which eToro competes and may use acquisitions:

- Geographic expansion through licenses and regulated entities.
- Wealth management and long-term savings.
- On-chain and crypto infrastructure.
- Products and technology for active traders.

These themes later became part of the agent's acquisition logic.

### How AI accelerated the work

AI helped me turn a very broad research task into a structured framework. It made it possible to compare acquisitions by strategic purpose rather than simply collecting a list of deals.

It also helped connect business research with product design. Instead of asking whether a fintech company looked attractive in general, the project began asking whether it closed a specific gap for eToro.

### Verification and judgment

I prioritized information published by eToro and treated strategic conclusions as analysis rather than verified facts. Any acquisition data used in the final system will still need a direct source and a clear date.

---

## Milestone 3 — Choosing Deeper Research Over Premature Development

At one point, GPT suggested moving from the initial research into agent development. I decided not to follow that recommendation.

I believed that beginning implementation at that stage would create a polished agent with weak acquisition judgment. The assignment specifically states that strong technical work on the wrong business problem scores poorly. I therefore insisted on conducting more research before writing code.

The additional work focused on:

- eToro's acquisition history and the logic behind its deals.
- Competitor M&A activity.
- The strategic gaps an acquisition could close for eToro.
- The difference between a major platform acquisition and a smaller tuck-in acquisition.
- The conditions that should cause a company to be rejected, monitored, or researched further.

### Why this decision mattered

This was an important human override. The AI optimized for visible forward progress, but I prioritized the quality of the agent's future recommendations.

The additional research became the foundation for the acquisition thesis rather than background material added after implementation.

---

## Milestone 4 — Building the Acquisition Thesis and Agent Logic

### AI used

I continued using GPT-5.6 Sol with medium reasoning for structured product and M&A analysis.

### What we developed

Based on eToro's published information, historical acquisitions, competitor activity, and the conclusions drawn from that research, I developed:

- An eToro-specific acquisition thesis.
- Separate Platform and Tuck-in target paths.
- Initial screening and rejection rules.
- Watchlist conditions for companies that are strategically interesting but not currently actionable.
- The main questions the agent must be able to answer.
- The core tasks a Corporate Development analyst should be able to complete.
- A structured company profile.
- Rules for sources, confidence, conflicting information, freshness, and unknown data.

The agent's purpose became more precise:

> Turn fragmented fintech information into sourced, thesis-driven acquisition opportunities that a Corporate Development analyst can review, challenge, compare, and act on.

### How AI accelerated the work

AI was particularly useful for converting unstructured business research into consistent decision criteria and product workflows. It helped identify repeated questions across discovery, company analysis, comparison, monitoring, and strategic explanation.

### Where AI needed correction

The model initially moved into a detailed company-profile schema before fully defining the analyst's jobs. That order was backwards: the user's decisions should determine the required data, not the other way around.

I challenged whether anything had been missed. We then defined the analyst workflows first and revised the schema to support them.

This correction prevented the project from becoming a large database with no clear product purpose.

---

## Milestone 5 — Auditing the Work Against the Full Assignment Brief

I did not want to continue based only on remembered excerpts from the assignment. I insisted that the original brief be read in full before declaring the planning stage complete.

### AI and tools used

Codex first attempted to access the protected online brief directly. The environment blocked both browser and direct web access. Instead of claiming that the brief had been reviewed, the limitation was surfaced and I uploaded the complete ten-page PDF.

The PDF was then:

- Extracted into text.
- Checked section by section.
- Rendered visually to ensure that tables and structured content were not missed.
- Compared against the work completed so far.

### What the audit revealed

The earlier plan was strong, but it was not complete. The audit identified several important corrections:

- The AI log needed to begin immediately rather than being written at the end.
- The MVP needed to be mapped directly to the 100-point scoring rubric.
- Each core capability needed a Definition of Done.
- The agent required a proactive scheduled loop, not only user-triggered research.
- Several ideas we had treated as core — including advanced change detection, deal memo generation, valuation, portfolio clustering, and multi-agent design — were bonus features.

### AI failure and human override

Before reading the complete brief, AI recommended moving directly to Market Taxonomy. I rejected that sequence and required a full audit.

The corrected order became:

1. Freeze the MVP and map it to the rubric.
2. Define acceptance criteria.
3. Begin the AI log.
4. Consolidate the business research.
5. Continue to Market Taxonomy and scoring.

This was another case in which challenging a confident AI recommendation materially improved the project.

---

## Milestone 6 — Creating the 14-Day Execution Roadmap

### AI and tools used

Codex was used to convert the assignment requirements and completed work into a fourteen-day execution plan. Document-generation and rendering tools were used to produce and inspect the final Word document.

### What was produced

The roadmap includes:

- The work already completed.
- A daily plan from research through submission.
- Time budgets and exit gates.
- Four non-negotiable project milestones.
- A Core / Bonus / Cut framework.
- A cut order if the project falls behind.
- Definition of Done for each core capability.
- Mapping to all twelve scoring dimensions.
- A feature freeze on Day 10.
- Dedicated time for evaluation, deployment, documentation, demo, and presentation.

### Where AI failed

The first generated roadmap was in Hebrew, while I wanted a document that could be used directly in the English-language submission.

The initial render also exposed an empty page and a single exit-gate line pushed onto a separate page.

### How the failure was caught and corrected

I requested a fully English version. The document was rebuilt, all eleven pages were rendered, and every page was visually inspected. The layout was adjusted until there were no empty pages or orphaned lines.

### Result

The final artifact is:

**eToro_MA_Intelligence_Agent_14_Day_Roadmap.docx**

---

## Milestone 7 — Locking the Technical Architecture Before Implementation

### AI and tools used

While a separate Deep Research process was running, I used Codex to convert the audited assignment requirements into an implementation-ready architecture. I deliberately used this time for technical planning that did not depend on the unfinished business research.

I also decided that the production implementation would be carried out in **Claude Code**. Codex would be used for research synthesis, product decisions, architecture, acceptance criteria, and later review; Claude Code would receive bounded implementation milestones rather than one request to build the entire system.

### What was decided

The architecture was designed as a TypeScript modular monolith with:

- A Next.js dashboard and embedded conversational agent.
- Supabase PostgreSQL as the system of record.
- A shared research pipeline for scheduled and manual runs.
- A Claude-based AI layer behind a provider adapter.
- Structured source, claim, event, company, assessment, and score records.
- A deterministic and versioned scoring engine separate from AI-written explanations.
- Daily scheduling through GitHub Actions.
- Vercel and Supabase as the proposed deployment path.
- Explicit handling for retries, partial failures, stale data, conflicting sources, rate limits, secrets, and prompt injection.

The architecture also defined the agent's tools, memory boundaries, API surface, repository structure, testing strategy, vertical-slice acceptance test, and six implementation milestones for Claude Code.

### Human judgment and prioritization

I chose not to begin coding while the business research was still incomplete. Instead, the architecture isolates the decisions that genuinely depend on research: market taxonomy, scoring weights, hard gates, monitoring priorities, and the seed target universe.

This allowed technical progress without prematurely embedding unverified business assumptions in the code. It also prevented multi-agent orchestration, a vector database, and other bonus complexity from entering the MVP before the required vertical slice works.

### Verification

The architecture was checked against every core capability and architecture requirement in the brief. Each requirement has a defined component, data path, failure behavior, and implementation milestone. The result is documented in:

**ARCHITECTURE.md**

---

## Milestone 8 — Deep Research Review and Business Logic Validation

### AI and tools used

I used ChatGPT Deep Research in a separate conversation to produce a 36-page business and M&A research foundation. The research was given the complete assignment brief, the product requirements, the existing hypotheses, the source policy, and an exact requested report structure.

After the report returned, I used Codex to inspect the complete PDF, extract and review its text, visually check all pages, compare the findings with the existing project, and spot-check important claims against current primary sources.

### What the research changed

The research validated three original themes—active trading, wealth and long-term savings, and on-chain infrastructure—and materially refined the fourth. Geographic and regulatory expansion was changed from a standalone product theme into a horizontal acquisition vector that must be justified through useful permissions, customers, local infrastructure, and change-of-control feasibility.

The research added **Money, Payments, and Account Primacy** as a primary theme because eToro now explicitly treats neo-banking as a strategic pillar and eToro Money is economically meaningful. It also added **AI, Data, and Community** as a selective Tuck-in layer rather than a broad target category.

The report also supported my suggestion that the agent should include fundamental analysis. This was formalized as a Fundamentals & Commercial Quality module that separates strategic fit, standalone business quality, financial risk, and evidence confidence. A full DCF or precise private-company valuation remains outside the core MVP.

### Important correction discovered

The assignment names B2C2, but the public evidence supports a 2026 eToro transaction with **Bit2C**, a different company. eToro's Q2 2026 release states that Zengo and Bit2C were completed during the quarter, and Bit2C separately described the transfer of its trading platform and customer-account management into the eToro group.

The system must therefore reject fuzzy entity matching between B2C2 and Bit2C. The assignment reference will remain documented, but it will not override the verified legal identity.

### Where AI output required correction

The Deep Research report was strong overall, but two regulatory citations were not safe to ingest as affirmative proof:

- One FCA citation pointed to a clone-firm warning rather than the canonical register record for eToro (UK) Ltd.
- One CySEC citation pointed to a deregistered-CASP page and cannot independently establish current MiCA authorization.

These issues did not invalidate the strategy, but they demonstrated why official-looking links still require semantic verification. The source policy was therefore reinforced: regulatory facts must use the exact legal entity, current register record, license status, and verification date.

### Result

The research was translated into:

- A validated acquisition thesis.
- A multi-dimensional market taxonomy.
- Separate Platform and Tuck-in scoring models.
- Hard gates, risk deductions, and evidence controls.
- Fundamental-analysis requirements.
- Recommendation logic and monitoring priorities.
- A historical calibration set and negative controls.

The implementation-ready artifact is:

**STRATEGY_AND_SCORING.md**

---

## Milestone 9 — Target Universe Selection and Scoring Calibration

### AI and tools used

I used **OpenAI Codex with GPT-5-family reasoning in the Deep Research workflow** for the source-heavy target search, entity and transaction-status checks, evidence synthesis, and score calibration. A strong reasoning workflow was appropriate because the task required reconciling legal entities, ownership, licensing, current M&A status, historical timing, unknowns, and recommendation trade-offs across jurisdictions. I used the document-generation and rendering workflow to turn the audited research into a submission-ready Word report and inspect every rendered page.

### What AI accelerated

AI helped screen a 52-company discovery set, preserve an advance/reject trail, freeze an exact 20-company monitoring and evaluation universe, and build eight independent gold-standard profiles. It also applied the v0.1 formulas consistently to the current universe and nine historical eToro transactions, compared Acquire against Build, Partner, Invest, Monitor, and Pass, and converted repeated calibration findings into explicit v0.2 operating rules.

The completed milestone produced:

- Five candidates for acquisition diligence: getquin, Dfns, QuantConnect, AfterHour, and Utila.
- Eight Monitor candidates, five Partner/Invest candidates, and two Pass/Build controls.
- Eight gold profiles that remain outside the bootstrap and runtime path.
- A separate six-name, identity-only bootstrap seed with no overlap with the gold set.
- A 65-source register with fact/publication and access-date discipline.

### Where AI output was weak or risky

The early discovery set included lemon.markets because it looked strategically attractive before the current M&A-status check. Broad searches also produced name collisions, including Lightyear Financial versus unrelated Lightyear Capital results and Dfns versus similarly named securities references. Public reporting on Superhero's failed Swyftx transaction and later ownership or valuation signals was too contradictory to support a clean acquisition-object record. The first document render also allowed the long source table to create an unstable page continuation.

### Verification and correction

The legal-entity, owner, regulator, and transaction-status audit showed that dwpbank had acquired 100% of lemon.markets and completed the transaction in October 2025, so lemon.markets was rejected. Domain, company-page, regulator, and transaction-party checks were used to resolve name collisions. Superhero was kept outside the final 20 rather than forcing an unsupported conclusion. ARQ's incomplete group perimeter remains explicit, TradeZero remains pending with an expected H1 2027 close rather than completed, and Bit2C remains distinct from B2C2.

All scores were recalculated deterministically from recorded inputs. The final Word report was rendered to 37 pages; every page was inspected, and the source register was reformatted to remove the unstable table continuation without changing its evidence content. Structural checks found no high-severity accessibility issue; the only medium finding was the non-data footer layout table.

### Human judgment and decisions

I did not change the Platform or Tuck-in weights. Nine historical positives all scored strongly, but the sample is too small and heterogeneous to justify reweighting without overfitting. Instead, v0.2 changes scoring operations: weighted evidence coverage, explicit unknown handling, coverage penalties, dual scoring for genuine Hybrids, separate action logic, explicit risk buckets, and `clear | triggered | unresolved` hard-gate states.

I also kept recommendation separate from fit score. Alpaca, Hypernative, and PensionBee score above the nominal Acquire threshold, but price, ownership, investor dynamics, or regulatory control make Partner, Invest, or Monitor the better current action. No user override was required during this milestone.

### Result and next bounded step

The research milestone is complete in **eToro_MA_Target_Universe_and_Scoring_Calibration_2026-09-03.docx**, with **report-source.md** as the canonical source. No repository, runtime database, dashboard, or application code was created. The next step is Claude Code **Build Milestone 1 only**: repository scaffold, schema and migrations, shared types, versioned configuration, deterministic scoring tests, minimal identity-only bootstrap, and README, followed by review before any later milestone.

---

## Milestone 10 — Claude Code Build Milestone 1: Repository and Database Foundation

### AI and tools used

Implementation was carried out in **Claude Code** (this session ran primarily on Claude Sonnet 5, with brief portions on Claude Opus 5 and Claude Opus 4.8 after mid-session `/model` switches), following the bounded prompt in `CLAUDE_CODE_BUILD_MILESTONE_1.md` and the persistent rules in `CLAUDE.md`. This is the first milestone where AI wrote application code rather than research or planning documents, so the review discipline shifted from reading prose to running the actual toolchain — every claim of "this passes" below is backed by a command that was actually executed in this session, not inferred.

### What AI accelerated

In one session, Claude Code produced: a scaffolded Next.js 16 App Router project with strict TypeScript, Tailwind, ESLint, Prettier and Vitest; one committed forward migration implementing all 19 required tables with UUID keys, foreign keys, check constraints and row-level security; a controlled taxonomy module and Zod validation layer with schema-derived types at every I/O boundary; the versioned v0.2 scoring configuration and a pure deterministic scoring engine (positive-normalized score, weighted coverage, evidence-banded penalties, itemized risk, hard gates, Hybrid dual-scoring, the regulated-access subtype, and canonical input hashing); 84 unit tests covering those invariants plus bootstrap/gold isolation and B2C2-versus-Bit2C entity resolution; the six-record bootstrap seed and an idempotent seed script; a database-backed dashboard shell; and a GitHub Actions CI workflow. Translating the business rules from `report-source.md` and the handoff document directly into SQL CHECK constraints (for example, the constraint that makes a `bootstrap_identity` row structurally incapable of holding a description, a score, or an `agent_run_id`) was significantly faster than writing the equivalent application-level guards and arguably more trustworthy, since the database itself refuses the bad state rather than relying on every future code path to remember to check.

### Failures and how they were caught

Four real defects surfaced during this milestone, each caught by actually running the corresponding check rather than by inspection:

1. **A self-inflicted tooling bug corrupted the generated database types.** The command used to write `src/db/types.generated.ts` captured the Supabase CLI's own `Connecting to db 5432` status line into the file alongside the generated TypeScript, which then failed to parse. Caught immediately by `pnpm typecheck`. Fixed by separating the CLI's diagnostic output from the redirected stdout.
2. **`pnpm typecheck` failed on a stale generated type.** An earlier `rm -rf .next` (done while relocating the scaffold) had deleted Next.js's generated route-typing directory, and nothing regenerated it before typecheck ran, so `LayoutProps<"/">` was unresolvable. Fixed by running `next typegen`, and — since this was a way for typecheck to silently depend on build artifacts left over from a previous command — by adding `next typegen` as a prerequisite step inside the `typecheck` script itself, so it cannot recur.
3. **Two of my own test fixtures were invalid, and the engine correctly rejected them.** Two tests constructed a scoring input with 84.54% weighted coverage but left the evidence penalty at its default of 0, which does not belong to the 70–84% band that coverage actually falls into. `pnpm test` failed with `ScoringInputError: evidence penalty 0 is outside the 3-5 band`. This was the engine's own input validation working as designed — the fix was in the test fixtures (supplying a penalty inside the band), not in the engine.
4. **A real, user-visible UI bug that no type check or unit test could have caught.** After the full toolchain was green, I opened the dashboard in a browser rather than trusting the build output. `create-next-app`'s default `globals.css` switches the page background to near-black under `prefers-color-scheme: dark`, while every component in this milestone uses hard-coded light Tailwind colors (`text-slate-900` on `bg-white` cards). Outside the white cards, this produced near-invisible dark-on-dark heading text — confirmed with a screenshot before the fix and after. Fixed by making the page explicitly light-only for this milestone, with a comment explaining why a real dark theme is deferred rather than half-built.

### How everything was verified, not just claimed

Every exit-gate item was executed against the actual local environment (Docker was available, so nothing had to be deferred): `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` (84/84 passing) were run to completion; `pnpm build` produced a successful production build with the dashboard route correctly marked dynamic; `supabase db reset` applied the migration to a genuinely fresh database; `pnpm db:seed` was run twice in a row, and the second run inserted zero new rows, which is the actual evidence of idempotency rather than an assumption about the upsert logic; and a dedicated `pnpm db:verify` script proved, against the live database rather than by reading the code, that the bootstrap CHECK constraint rejects a researched field and that row-level security rejects a write from the public (anon) role — both are the specific invariants the milestone's data-isolation requirement depends on, so they were proved directly instead of trusted by inspection. The dashboard was then loaded in an actual browser against the seeded database and screenshotted, which is what caught defect 4 above.

### Human/engineering decisions and deviations

- The milestone prompt's rule 13 ("Do not push to a remote repository") conflicts with Tom's own standing instruction, given earlier in this session, to push meaningful commits to `main` without asking each time. I resolved this in favor of the milestone document as the more specific and more recently issued instruction: this milestone's work was committed locally only, and Tom is asked explicitly, in the final report, whether to push it.
- Chose `pnpm` per the locked baseline's stated preference order, since no existing repository dictated otherwise.
- Database types are generated (`pnpm db:types`) rather than hand-maintained, and are excluded from ESLint and Prettier, so they cannot drift from the migration that produced them without a visible diff.
- `data/seed/bootstrap.ts` is the single source of truth for the six bootstrap identities; `supabase/seed.sql` is deliberately absent (and the migration's warning about it is expected) so there is no second copy that could drift from the one the tests assert against.

### Remaining unverified item

None. Local Docker and Supabase were available for the entire milestone, so every exit-gate check — migrations, seed idempotency, the bootstrap constraint, row-level security, and the rendered dashboard — was verified against a real running instance rather than deferred.

### Next bounded milestone

Build Milestone 2 — the evidence-backed company vertical slice: one company taken from source retrieval through stored sources and claims, a cited profile, a deterministic score computed from validated inputs, and rendered citations, with the independent gold profile used only to evaluate that output.

---

## Next Milestones to Document

The next AI log entries will be added only when one of these meaningful milestones is reached:

1. Research and company-profiling pipeline working.
2. Strategic scoring and reasoning pipeline working.
3. Dashboard vertical slice deployed.
4. Conversational agent working end to end.
5. Proactive monitoring and competitor tracking working.
6. Evaluation and reliability testing completed.
7. Production deployment stabilized.
8. Final documentation, demo, and submission completed.

---

## Final Reflection

This section will be completed at the end of the project. It will summarize:

- Where AI created the greatest leverage.
- Where AI was least reliable.
- Which verification methods were most effective.
- The most important decisions made independently.
- What I would change in a second iteration.

---
