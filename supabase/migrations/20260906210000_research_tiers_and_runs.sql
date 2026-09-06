-- The minimum relational state needed for automated research allocation
-- (Claude Code Build Milestone 5, workstream B). None of this existed before:
-- a discovered company had identity and, once monitored, article-derived
-- claims and events - but nothing recorded how much research attention it
-- deserved, when it was last actually researched, or when it is due again.
--
-- Deliberately not reusing `record_origin` (historical provenance: bootstrap
-- vs agent-generated - a fact about how the row was created, which never
-- changes) or `lifecycle_status` (the discovery/screening pipeline stage) for
-- any of this. Research completeness is a third, independent axis that
-- changes on every research pass regardless of either of those.

do $$
begin
  create type research_tier as enum ('indexed', 'monitored', 'deep');
exception
  when duplicate_object then null;
end
$$;

-- Distinct from `run_status` (running/success/partial_success/failed), which
-- describes one execution. This describes the company's current profile
-- completeness, which persists between runs and is what the dashboard and the
-- auto-enrichment selector actually need to read.
do $$
begin
  create type research_state as enum ('pending', 'running', 'complete', 'partial', 'blocked', 'failed');
exception
  when duplicate_object then null;
end
$$;

alter table companies add column if not exists research_tier research_tier not null default 'indexed';
alter table companies add column if not exists research_tier_reason text;
alter table companies add column if not exists research_tier_confidence confidence_level;
alter table companies add column if not exists research_state research_state not null default 'pending';
alter table companies add column if not exists last_researched_at timestamptz;
alter table companies add column if not exists next_refresh_at timestamptz;
alter table companies add column if not exists last_material_change_at timestamptz;
alter table companies
  add column if not exists tier_changed_by_run_id uuid references agent_runs (id) on delete set null;

create index if not exists companies_research_tier_idx on companies (research_tier);
-- Powers "which companies are due" - the auto-enrichment selector's core
-- query - without a sequential scan as the universe grows.
create index if not exists companies_next_refresh_at_idx
  on companies (next_refresh_at) where next_refresh_at is not null;

-- Append-only, because "store the reason for every tier transition" (workstream
-- B) means every one, not just the current one. A reader asking "why is this
-- company deep" should be able to see the whole path that got it there, the
-- same way claims stay append-only for the same reason (section 31).
create table if not exists company_tier_transitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  -- Null on a company's first transition; there is no "from" yet.
  from_tier research_tier,
  to_tier research_tier not null,
  reason text not null,
  confidence confidence_level,
  agent_run_id uuid not null references agent_runs (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists company_tier_transitions_company_id_idx
  on company_tier_transitions (company_id, created_at desc);

-- The run ledger for the company-research orchestrator (workstream D), on the
-- same idempotent create-or-reuse pattern already proven by `monitoring_runs`:
-- a unique idempotency key decides whether a call starts new work or reuses
-- an existing run, so a retried trigger cannot duplicate a company's research
-- pass.
create table if not exists company_research_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  trigger run_trigger not null,
  idempotency_key text not null,
  status run_status not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  sources_planned integer not null default 0,
  sources_fetched integer not null default 0,
  claims_written integer not null default 0,
  warnings text[] not null default '{}',
  error_summary text
);

create unique index if not exists company_research_runs_idempotency_key_key
  on company_research_runs (idempotency_key);
create index if not exists company_research_runs_company_id_idx
  on company_research_runs (company_id, started_at desc);

-- Workstream D.14: a research run must be able to finish as success,
-- partial_success, blocked or failed. `blocked` does not exist on the
-- existing `run_status` enum (monitoring runs never needed it - a monitoring
-- pass has nothing that "blocks" the way an unresolved entity or hard gate
-- blocks one company's research). Added here, used starting in workstream D's
-- own migration - a new enum value cannot be referenced in the same
-- transaction that adds it (see 20260906170000/20260906170001 for the same
-- restriction hit earlier in this milestone).
alter type run_status add value if not exists 'blocked';
