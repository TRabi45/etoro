-- Corrective invariants for Milestone 5. This is intentionally a forward
-- migration: v0.2/v0.3 rows already written remain historical evidence.

-- New research-ledger tables were added after the initial RLS sweep. They are
-- operational provenance, not public dashboard resources; service-role code is
-- their only writer and no public read policy is granted.
alter table company_research_runs enable row level security;
alter table company_tier_transitions enable row level security;

-- A numerical decision must sit inside the uncertainty interval that explains
-- it. Historical rows without v0.3 bounds remain valid and untouched.
alter table scores drop constraint if exists scores_bounds_contain_score;
alter table scores
  add constraint scores_bounds_contain_score check (
    final_score is null
    or lower_bound is null
    or upper_bound is null
    or (final_score >= lower_bound and final_score <= upper_bound)
  );

-- Scores are append-only historical decisions. Configuration was already
-- locked after first use; this completes the invariant by preventing an
-- existing score's inputs or outcome being rewritten in place.
create or replace function prevent_score_update() returns trigger
language plpgsql
as $$
begin
  raise exception 'scores are immutable; write a new model/input row instead';
end;
$$;

drop trigger if exists scores_prevent_update on scores;
create trigger scores_prevent_update before update on scores
  for each row execute function prevent_score_update();

-- Idempotency keys handle retries. This partial unique index additionally
-- establishes ownership of a company while work is running, so two different
-- triggers cannot concurrently derive competing profiles for the same entity.
create unique index if not exists company_research_runs_one_running_per_company
  on company_research_runs (company_id)
  where status = 'running';

-- Exact duplicate body content reached through a new URL is one evidence item,
-- not corroboration. URL identity (sources_url_normalized_key) already makes
-- the same address one row; this covers the same body at a second address.
--
-- Scoped per company, deliberately. A whole-table unique index on
-- `content_hash` would be wrong: the hash is taken over extracted page text,
-- so two unrelated companies publishing identical boilerplate - a shared
-- cookie policy, a parent company's press release carried on both sites -
-- would collapse into a single row, and the second company's evidence would
-- silently attach to the first company's source. That is the cross-company
-- claim attribution failure the security review is meant to prevent.
--
-- `sources` has no owning company by design: one article can back claims about
-- several companies, and provenance runs through claim_sources -> claims. So
-- this column records something narrower and honest - the company a document
-- was fetched *for* during a company-specific research pass. Feed and news
-- articles leave it null and stay shared, exactly as before.
alter table sources
  add column if not exists research_company_id uuid references companies (id) on delete set null;

comment on column sources.research_company_id is
  'The company this document was fetched for during a company-specific research pass. Null for shared feed/news sources. Scopes content-hash de-duplication; it is not a statement of ownership.';

create unique index if not exists sources_research_company_content_hash_unique
  on sources (research_company_id, content_hash)
  where research_company_id is not null and content_hash is not null;
