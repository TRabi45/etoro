# eToro M&A Intelligence Agent

An internal M&A intelligence tool for eToro Corporate Development. The finished
product monitors the global fintech ecosystem, surfaces acquisition targets,
builds evidence-backed company profiles, scores them with deterministic and
versioned logic, and explains its reasoning conversationally with citations,
unknowns and a counter-thesis.

> **Current state: Build Milestone 2 of 6.** The evidence-backed vertical slice
> works end to end: sources, claims, linked evidence, fundamentals, a strategic
> assessment and a deterministic score for one company, rendered as a profile
> where every material statement carries a citation. It is **not yet a working
> research agent** - there is no web retrieval, no LLM call and no chat, so the
> pipeline is currently fed a clearly-labelled synthetic stub payload. See
> [Milestone status](#milestone-status).

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
| Pipeline               | `src/pipeline/`                  | Extraction-payload contract and the orchestration that writes the evidence tree.        |
| Bootstrap data         | `data/seed/`                     | Six company identities. Identity, aliases, domain, theme and search leads only.         |
| Stub payload           | `data/stub/`                     | Synthetic stand-in for LLM extraction until Milestone 3. Clearly labelled as such.      |
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

No AI provider or model identifier is configured yet: AI integration begins in
Milestone 3, and the model name will be environment configuration rather than a
hard-coded value.

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
| `pnpm test:integration`             | Integration tests against a live local database (needs Docker)         |

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
- `src/pipeline/` - the real orchestration logic, plus an `ExtractionPayload`
  contract the Milestone 3 LLM adapter will have to satisfy
- `pnpm slice:run` - writes the full evidence tree for one bootstrap company and
  runs the deterministic engine over the recorded inputs
- `/companies/[slug]` - fundamentals, assessment, score breakdown and a sources
  footer, with inline `[1]`-style citations on every material statement
- An integration suite (`pnpm test:integration`) proving against a live database
  that a contradictory claim never overwrites the original

**Not implemented yet, by design**

- Web search, RSS, crawling or source fetching
- Claim extraction and any LLM provider call - the pipeline is fed a stub payload
- Chat and conversation memory
- Scheduled monitoring
- Comparison, market map or watchlist UX
- Deployment to Vercel or a hosted Supabase project

## Limitations

- **The profile data is synthetic.** `pnpm slice:run` writes a hardcoded stub
  payload with `example.com` sources, and the page says so in a provenance
  notice. The evidence structure, citations and scoring are real; the underlying
  facts are invented, deliberately, so stage-two research is never passed off as
  agent discovery. Live retrieval arrives in Milestone 4.
- Only one company has a profile. The other five remain identity-only.
- The gold benchmark contains expectations for eight companies and is not yet
  executed; the evaluation runner arrives in Milestone 6.
- `pnpm slice:run` is append-only for claims (an observation is made at a point
  in time), so re-running it adds a second set. Reset with `pnpm db:reset &&
pnpm db:seed` for a clean slice. The score itself is keyed on its input hash
  and will not duplicate.

## Next milestone boundary

**Milestone 3 - agent tools and contextual chat.** Typed retrieval and comparison
tools, the Claude provider adapter behind a replaceable interface, versioned
prompts, streaming grounded responses, bounded session memory, and citation
checks on generated answers.
