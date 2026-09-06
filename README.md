# eToro M&A Intelligence Agent

An internal M&A intelligence tool for eToro Corporate Development. The finished
product monitors the global fintech ecosystem, surfaces acquisition targets,
builds evidence-backed company profiles, scores them with deterministic and
versioned logic, and explains its reasoning conversationally with citations,
unknowns and a counter-thesis.

> **Current state: Build Milestone 4 of 6.** The system now reads the world on
> its own: a scheduled pipeline fetches fintech press, an Extractor model turns
> each document into validated claims and events, entity resolution decides
> conservatively whether a named company is one already tracked, and the
> dashboard shows what the last run produced and what it missed. The
> evidence-backed profile and the grounded chat agent from earlier milestones sit
> on top of it. Still ahead: the full dashboard (Milestone 5) and deployment
> (Milestone 6). See [Milestone status](#milestone-status).

## The business foundation

[`docs/ACQUISITION_THESIS.md`](docs/ACQUISITION_THESIS.md) is the authoritative
account of what eToro may want to buy and why, reduced to the parts a program can
execute. It carries the scoring model, the decision thresholds, the hard gates,
the nine target families, the evidence-quality levels and the acceptance tests -
each line tagged with the section of the source PDF it comes from, which is kept
alongside it under `docs/sources/`.

Two things follow from it that are easy to get wrong:

- **The weights and thresholds are a proposal, not policy.** The document says so
  itself. They live in versioned configuration with an owner and a rationale, and
  a model that has produced a score can never be edited in place.
- **It is not a target list.** It defines how to reason about a company. Which
  companies exist, and what is true of them today, is live research the runtime
  has to do and cite.

`tests/unit/thesis-conformance.test.ts` states what the thesis requires as
executable assertions and checks the implementation against them. The gaps that
remain open are inverted with `it.fails`, so closing one makes its test fail for
passing unexpectedly - a specification gap cannot quietly become satisfied
without someone noticing.

## Why the product is shaped this way

Three decisions drive most of the architecture:

1. **Deterministic code calculates scores; the model never does.** A language
   model may propose structured inputs and write the explanation afterwards, but
   the number comes from a pure function over a versioned configuration. Scores
   have to be reproducible and independently testable.
2. **Unknown is a first-class state.** Private companies do not publish their
   revenue. A missing figure stays missing - it is never converted to zero,
   which would score an unmeasured company as though it had failed. Coverage and
   evidence penalties price that uncertainty explicitly and visibly.
3. **Three data layers stay separate.** Bootstrap identities, the gold
   evaluation benchmark, and runtime knowledge produced by the pipeline are
   different things, and presenting one as another would misrepresent what the
   agent actually did. The separation is enforced in the schema, in validation,
   and by lint rules - not by convention.

## Architecture summary

A TypeScript modular monolith. One codebase, one relational database, one shared
research pipeline used by both scheduled and manual runs. No microservices, no
multi-agent orchestration, no vector database.

| Layer                  | Location                         | Responsibility                                                                          |
| ---------------------- | -------------------------------- | --------------------------------------------------------------------------------------- |
| Dashboard              | `app/`, `components/`            | Server-rendered views. Never queries the database directly, never calls a provider SDK. |
| Repositories           | `src/db/repositories/`           | The only path to persistence. Returns typed results, including typed failures.          |
| Database clients       | `src/db/client.ts`               | Public read-only client and server-only service client.                                 |
| Domain logic           | `src/domain/scoring/`            | Pure deterministic scoring engine and canonical input hashing.                          |
| Business configuration | `src/config/`                    | Controlled taxonomy and versioned scoring weights, gates and thresholds.                |
| Runtime validation     | `src/validation/`                | Zod schemas at every I/O boundary; TypeScript types are derived from them.              |
| Pipeline               | `src/research/pipeline/`         | Extraction-payload contract and the orchestration that writes the evidence tree.        |
| Bootstrap data         | `data/seed/`                     | Six company identities. Identity, aliases, domain, theme and search leads only.         |
| Stub payload           | `data/stub/`                     | Synthetic stand-in for live extraction until Milestone 4. Clearly labelled as such.     |
| AI layer               | `src/ai/`                        | Provider adapter, versioned prompts, and the typed tools the agent may call.            |
| Server utilities       | `src/server/`                    | Transport concerns that are not repositories - currently endpoint rate limiting.        |
| Migrations             | `supabase/migrations/`           | Committed, idempotent forward migrations.                                               |
| Tests                  | `tests/unit/`, `tests/fixtures/` | Pure unit tests, runnable with no database.                                             |
| Integration tests      | `tests/integration/`             | Need a live local database; excluded from CI.                                           |
| Gold benchmark         | `tests/evaluation/gold/`         | Evaluation fixtures. Production modules cannot import these.                            |

### Enforced boundaries

- UI code cannot import `@supabase/supabase-js` or a database client - an ESLint
  rule rejects it.
- Production modules under `src/` cannot import anything from `tests/`, so gold
  benchmark research cannot leak into the runtime path.
- `companies` carries a CHECK constraint making a bootstrap row incapable of
  holding a description, a path, an M&A state or a run id.
- Scoring configuration rows lock themselves the first time a score is written
  against them, so a stored score always reconciles with the weights that
  produced it.

## Prerequisites

- Node.js 22.13 or newer (pnpm 11 requires it - it uses the `node:sqlite`
  built-in, which Node 20 does not have)
- pnpm 11 (`npm install -g pnpm`)
- Docker Desktop, for the local Supabase stack

## Setup

```bash
pnpm install
cp .env.example .env.local
pnpm db:start     # starts local Supabase and prints URL, anon key, service key
                  # paste those three values into .env.local
pnpm db:reset     # applies the migrations to a fresh database
pnpm db:seed      # inserts the six bootstrap identities (idempotent)
pnpm dev          # http://localhost:3000
```

`pnpm db:start` prints the local credentials on every machine. They are local
development values, not secrets, but `.env.local` is gitignored regardless - only
`.env.example` is ever committed.

## Environment variables

| Variable                        | Where it is used   | Notes                                                                                            |
| ------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | Browser and server | Project URL. Local default `http://127.0.0.1:54321`.                                             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server | Restricted by row-level security to reading the public dashboard tables.                         |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server only        | Bypasses row-level security. The only credential that may write. Never prefix it `NEXT_PUBLIC_`. |
| `ANTHROPIC_API_KEY`             | Server only        | From <https://console.anthropic.com>. Required for chat; everything else runs without it.        |
| `ANTHROPIC_MODEL`               | Server only        | For example `claude-sonnet-5`. Configuration, never a literal in code.                           |

The model is an environment variable rather than a constant so that swapping it -
for cost, latency or capability - never means editing application logic, and so
that every `agent_runs` row can record which model actually produced an answer.

## Commands

| Command                             | What it does                                                           |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `pnpm dev`                          | Development server                                                     |
| `pnpm build`                        | Production build. Succeeds with no database configured.                |
| `pnpm lint`                         | ESLint, including the architectural import boundaries                  |
| `pnpm format:check` / `pnpm format` | Prettier check / write                                                 |
| `pnpm typecheck`                    | `tsc --noEmit`                                                         |
| `pnpm test`                         | Unit tests. No database, no secrets, no Docker.                        |
| `pnpm db:start` / `pnpm db:stop`    | Local Supabase stack                                                   |
| `pnpm db:reset`                     | Drop and re-apply all migrations                                       |
| `pnpm db:seed`                      | Seed the bootstrap identities (idempotent)                             |
| `pnpm db:types`                     | Regenerate `src/db/types.generated.ts` from the running local database |
| `pnpm db:verify`                    | Integration checks against a live local database (needs Docker)        |
| `pnpm slice:run`                    | Run the evidence-backed vertical slice for one bootstrap company       |
| `pnpm monitor`                      | Run one monitoring pass. `--max N`, `--manual`, `--key <value>`        |
| `pnpm test:integration`             | Integration tests against a live local database (needs Docker)         |
| `pnpm agent:ask "<question>"`       | Ask the agent one question from the terminal (needs an API key)        |

### Database workflow

Migrations are plain SQL in `supabase/migrations/`, committed, and written to be
idempotent so re-application is safe. To change the schema, add a new migration
file - never edit an applied one - then run `pnpm db:reset` and `pnpm db:types`
and commit the regenerated types alongside the migration.

Bootstrap data deliberately does **not** live in `supabase/seed.sql`. It is
defined once in `data/seed/bootstrap.ts`, validated by a strict schema, and
written by `pnpm db:seed`. A second copy in SQL would drift from the copy the
tests assert against.

`pnpm db:verify` is separate from `pnpm test` because it needs Docker. It proves
what a unit test cannot: that the migration produced the expected schema, that
row-level security lets the public role read and refuses to let it write, that
the bootstrap CHECK constraint actually rejects researched fields, and that
re-seeding is idempotent.

## Scoring

Version 0.2 keeps the version 0.1 Platform and Tuck-in weights. Nine historical
eToro transactions all scored as strong positives under those weights, and that
sample is too small and too heterogeneous to justify reweighting without
overfitting. What 0.2 changes is the operations:

```text
positive_normalized = 100 * Σ((dimension_score / 5) * weight) / Σ(scored applicable weights)
weighted_coverage   = Σ(scored applicable weights) / Σ(all applicable weights)
final_score         = max(0, positive_normalized - risk_penalty - evidence_penalty)
```

- `scored`, `unknown` and `not_applicable` are three distinct dimension states.
  `unknown` stays in the coverage denominator but not the numerator;
  `not_applicable` leaves both and requires a stated reason.
- Below 40% weighted coverage, or with an unresolved critical gate, the result is
  **Research only** and there is no decision score at all.
- Evidence penalty bands: `>=85% → 0-2`, `70-84% → 3-5`, `55-69% → 6-9`,
  `40-54% → 10-15`. The penalty is supplied and then validated against the band
  the coverage actually earned.
- Risk is an itemised sum capped at 20, and every non-zero component needs a
  reason.
- Each hard gate is `clear`, `triggered` or `unresolved`. A triggered permanent
  gate rules out Acquire; an unresolved critical gate forces Research only.
- **Recommendation is a separate decision from the score.** Acquire additionally
  requires no triggered gate, a final score of at least 75, strategic fit of at
  least 4, coverage of at least 70%, acquisition plausibility of at least 3,
  resolved legal identity, M&A status and regulatory perimeter, and acquisition
  beating build, partner, invest and monitor on the recorded route assessment. A
  high score with a weak control case yields Partner, Invest or Monitor.
- Genuine Hybrids are scored on both scorecards and both results are kept.
  They are never averaged.
- Rounding: full double precision throughout, rounded half-up on output only -
  scores to two decimals, coverage to four.

## Milestone status

**Delivered in Milestone 1**

- Next.js App Router application with strict TypeScript, Tailwind, ESLint,
  Prettier, Vitest and GitHub Actions CI
- Committed forward migration for the full MVP system of record, with row-level
  security, and generated database types
- Controlled taxonomy and runtime validation schemas with schema-derived types
- Versioned scoring configuration v0.2 and the pure deterministic engine
- Unit tests covering the scoring invariants, evidence bands, gate states,
  recommendation logic, input hashing and bootstrap isolation
- Six identity-only bootstrap records, seeded idempotently
- A database-backed dashboard shell with loading, empty, configuration-error and
  database-error states

**Delivered in Milestone 2**

- Repository functions for the whole evidence tree - sources, claims,
  `claim_sources`, metrics, fundamentals, assessments, scores, scoring models and
  agent runs - plus a composite `getCompanyProfileWithEvidence(slug)`
- `assessment_claims` and `fundamental_analysis_claims`, so a rendered conclusion
  can be traced back through claims to sources
- A strictly typed `EvidencePacket` (facts, contradictions, unknowns, freshness)
  enforced at the repository boundary; a claim cannot be written without a source
- `src/research/pipeline/` - the real orchestration logic, plus an `ExtractionPayload`
  contract the Milestone 3 LLM adapter will have to satisfy
- `pnpm slice:run` - writes the full evidence tree for one bootstrap company and
  runs the deterministic engine over the recorded inputs
- `/companies/[slug]` - fundamentals, assessment, score breakdown and a sources
  footer, with inline `[1]`-style citations on every material statement
- An integration suite (`pnpm test:integration`) proving against a live database
  that a contradictory claim never overwrites the original

**Delivered in Milestone 3**

- `src/ai/provider-adapter.ts` - the only module that imports an AI SDK, so the
  provider stays replaceable
- Nine typed agent tools, every one returning a `ToolResult<T>` envelope with
  citations, confidence, warnings and errors-as-data
- Versioned prompts in `src/ai/prompts/v1/` (conversational agent, M&A analyst,
  extractor shell)
- `POST /api/chat` with streaming, bounded 10-message memory, and sessions
  persisted to `chat_sessions` / `chat_messages`
- A contextual chat panel that streams replies, shows which tools ran, renders
  inline citations, and fails gracefully
- `pnpm agent:ask --canonical` to re-run the six assignment questions as text

**Hardening pass before Milestone 4**

An audit before opening the pipeline to the live web found and fixed several
issues that no type check, lint rule or existing test could have caught. The
three that changed the architecture:

- **Conversation history is rebuilt on the server.** The route previously
  forwarded the browser's message list to the model, and a UI message list
  carries tool _outputs_ - so a crafted request could hand the agent a fabricated
  company profile and have it reported as looked-up fact. The client's array now
  supplies only the newest question; everything replayed comes from
  `chat_messages`. The adapter takes provider-neutral turns, so the replayed type
  has nowhere to put a tool result.
- **`chat_sessions` rows are owned.** Session ids travel in the request body, so
  a server-minted token in an HttpOnly cookie now proves that the browser
  continuing a conversation is the one that started it. See
  `supabase/migrations/20260904103000_add_chat_session_owner.sql`.
- **External source text is delimited.** Excerpts are wrapped in
  `<untrusted_source_text>` (with the delimiter stripped from the text itself, so
  a page cannot close the block and escape into instruction position), and the
  prompt states that tool content is data and never an instruction.

Also: the chat endpoint is rate limited per client and per session, malformed
tool inputs are repaired rather than fatal, and the scoring engine now blocks
Acquire while _any_ hard gate is unresolved, not only a critical one.

**Delivered in Milestone 4**

- `src/research/sources/` - URL normalisation, content hashing, and a fetcher
  bounded by scheme, destination, time and size, with SSRF protection that
  resolves every address a host answers with and re-checks after redirects
- `src/research/pipeline/runner.ts` - the eight-step orchestration loop, where a
  failed document costs one document and never the run
- The Extractor role, with a relevance gate deciding which named entities may
  enter the monitored universe at all
- Conservative entity resolution: equality after normalisation, never string
  similarity, so `Bit2C` and `B2C2` cannot merge
- `POST /api/monitor/run`, `pnpm monitor`, and a daily GitHub Actions schedule
- Dashboard panels for the last run and the recent-events feed

**Not implemented yet, by design**

- Web search as a discovery source - RSS only, which needs no additional secret
- Company enrichment after discovery: a discovered company is identity-only and
  stays `discovered_unreviewed` until a human reviews it
- Market map or watchlist UX
- Deployment to Vercel or a hosted Supabase project

## Limitations

- **Two kinds of data now coexist, and they are not equally trustworthy.**
  Claims and events written by the monitoring pipeline are real: fetched from a
  real article, extracted by a model, and traceable to a URL. The _profile_ for
  `getquin` is still the synthetic stub payload from `pnpm slice:run`, with
  `example.com` sources and a provenance notice on the page. Its evidence
  structure, citations and score are real; its underlying facts are invented, so
  the stage-two research is never passed off as agent discovery.
- **Only `getquin` has a scored profile.** Discovered companies are identity-only
  and unscored - the pipeline reads news, and news does not establish the
  fundamentals a score needs.
- **Extraction quality is bounded by what one article says.** Geography, revenue
  and licensing are rarely stated in press coverage, so most companies stay
  without them, which is why the search tool still reports geography as
  unrecorded.
- **A run that reports `partial_success` is the normal case.** Paywalls, blocked
  crawlers and extraction timeouts are ordinary conditions on the open web. The
  status means "something was missed and here is what", not "something is
  broken".
- The gold benchmark contains expectations for eight companies and is not yet
  executed; the evaluation runner arrives in Milestone 6.
- `pnpm slice:run` is append-only for claims (an observation is made at a point
  in time), so re-running it adds a second set. Reset with `pnpm db:reset &&
pnpm db:seed` for a clean slice. The score itself is keyed on its input hash
  and will not duplicate.
- **The chat agent needs an `ANTHROPIC_API_KEY`.** Without one, `/api/chat`
  returns a 503 and the panel says the provider is not configured. The tools,
  envelopes, schemas, session persistence and UI are all covered by tests that
  run without a key; the agent's own answers are not, because nothing can
  generate them.
- **The chat endpoint is throttled, not authenticated.** There is no login: the
  session cookie proves a browser is continuing its own conversation, and the
  rate limiter bounds what any one caller can spend. Both are the right scope for
  an internal demo and neither is an access control. The limiter is also
  in-memory, so it resets on restart and counts per instance.
- Geography is not recorded for any company and the `events` table stays empty
  until the monitoring pipeline exists, so discovery questions ("targets in
  Germany") and change questions ("what changed since yesterday?") correctly
  return nothing. The agent is built to say so rather than fill the gap from the
  model's own memory - which is the behaviour being tested there.

## Next milestone boundary

**Milestone 4 - monitoring and discovery.** Source adapters and the shared
pipeline, deduplication, identity resolution, run logging, daily scheduling and
bounded manual execution - the step that finally replaces the stub payload with
real retrieval.
