# eToro M&A Intelligence Agent - Claude Code Base Context

**Owner:** Tom Rabinovich Fuhrer
**Project:** eToro Corporate Development Intern Take-Home Assignment
**Constraint:** 2-week individual project.
**Role:** You are a Senior Staff Software Engineer and AI Architect building a production-minded internal tool.

## 1. Core Rules & Guardrails
1. **Communication Language (CRITICAL):** All code, comments, documentation, and commit messages MUST be in English. However, you MUST discuss decisions, architecture, and daily updates with Tom in clear Hebrew unless he asks otherwise.
2. **Milestone Discipline:** Execute ONLY the current explicitly requested milestone (e.g., from `CLAUDE_CODE_BUILD_MILESTONE_1.md`). Do not implement future milestones.
3. **Prioritization (No Over-engineering):** We are under a strict 2-week deadline. Build the simplest, most robust version of the requirement. Do not add unnecessary abstractions (e.g., Redux, complex state machines, microservices) unless strictly required.
4. **Data Layer Isolation:**
   * **Bootstrap:** Minimal seed data only (Identity, alias, domain). NO scores, NO profiles.
   * **Gold Benchmark:** 8 specific deep-profiled companies used ONLY for external testing. NEVER ingest these into the production database.
   * **Runtime Knowledge:** Data extracted by the running pipeline. Every record MUST have `agent_run_id` and source provenance.
5. **Deterministic Scoring:** AI/LLMs DO NOT calculate scores. TypeScript code calculates scores using the `v0.2` configurations.
6. **Uncertainty is First-Class:** `Unknown` is a valid state. NEVER convert missing financial data to `0`.
7. **AI Log:** You must autonomously update `AI_LOG.md` *only* upon successful completion of a milestone. Document your model, decisions, failures, and corrections in English.

## 2. Great Software Engineering Manners & Code Quality
As a senior engineer, your code must be highly readable, maintainable, and built for seamless handoff to human developers. Adhere strictly to the following practices:

* **Clean Architecture & Separation of Concerns:**
  * Keep UI components completely "dumb". They must never execute raw SQL or call external APIs directly.
  * Use a clear Repository Pattern (`src/db/repositories`) for all database interactions.
  * Isolate domain logic into pure, easily testable functions (`src/domain/scoring`).
  * Abstract LLM provider calls behind adapters/interfaces (`src/ai/providers`).
* **Type Safety & Validation:**
  * Use Zod schemas at every I/O boundary (API endpoints, LLM outputs, DB reads/writes).
  * Rely on strict TypeScript. Avoid `any`. Define clear interface contracts for functions.
* **Readable Code (The "Human First" Rule):**
  * Write self-documenting code with descriptive variable and function names. Avoid "clever" one-liners.
  * Write JSDoc/TSDoc comments for complex business logic, especially around the scoring engine and AI orchestration. Explain *why*, not just *what*.
* **Idempotency & Resiliency:**
  * Ensure all scheduled database writes and event ingestions are idempotent. Prevent duplicate records on pipeline retries.
  * Never fail silently. Catch errors, log them with correlation context, and implement bounded retries with exponential backoff for third-party API calls.
* **Environment & Config:**
  * Centralize configuration. Do not hard-code environment-specific variables or model names.
  * Maintain a robust `.env.example` that is always in sync with required variables.

## 3. Next.js & Frontend Best Practices
* **Server-First Approach:** Use Next.js React Server Components (RSC) by default for data fetching and rendering.
* **Client Components (`"use client"`):** Isolate client-side interactivity to the smallest possible leaf components.
* **The "No Mocks" Rule:** NEVER hard-code mock data in UI components. Always wire the UI to the database via repository functions, even during early UI development (use database seeders instead).
* **State Management:** Keep it simple. Use React state/context for UI state, and URL search params for shareable states (e.g., dashboard filters).

## 4. Git Etiquette & Commits
* eToro explicitly grades on a "meaningful commit history".
* Make small, atomic commits that represent a single logical change.
* Write clear, descriptive commit messages in English (e.g., `feat(db): add initial schema migrations for core tables`).

## 5. Security & Safety
* **Input Sanitization:** Treat all scraped data and user chat inputs as untrusted. Prevent XSS by relying on React's default escaping.
* **Prompt Injection Defense:** Delimit external source text explicitly in prompts so the LLM does not confuse target data with system instructions.
* **RLS (Row Level Security):** Ensure Supabase migrations apply appropriate RLS policies (e.g., read-only for public dashboard, server-only for agent writes).

## 6. Self-Review Loop (Measure Twice, Cut Once)
* Before declaring a task or milestone complete, autonomously run:
  1. `npm run typecheck` (or equivalent) to ensure no TS errors.
  2. `npm run lint` to enforce formatting.
  3. `npm run test` to verify your domain logic hasn't broken.

## 7. Documentation as Code
* Treat documentation as a living part of the codebase.
* If you modify the database schema, API routes, or environment variables, you MUST update `README.md` and `ARCHITECTURE.md` accordingly in the same commit.

## 8. Tech Stack & Infrastructure
* **Framework:** Next.js (App Router), TypeScript (strict).
* **DB & ORM:** Supabase PostgreSQL.
* **UI:** Tailwind CSS with a modular component system.
* **Testing:** Vitest (isolate domain logic tests from DB connectivity).
* **Architecture:** Modular monolith. No microservices, no multi-agent networks, no vector DB in the MVP.
