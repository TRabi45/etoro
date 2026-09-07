-- ---------------------------------------------------------------------------
-- Milestone 19A.2 - the Universe data model foundation.
--
-- This is the persistence layer that Universe expansion will sit on, and
-- nothing more. It adds no provider, no adapter, no external call, no entity
-- resolution and no UI. `docs/UNIVERSE_DATA_MODEL_19A.md` states the contract
-- this migration has to satisfy; the acceptance suite in
-- `tests/integration/universe-data-model.test.ts` was written and run against
-- an empty implementation before any of this SQL existed.
--
-- Three concepts, deliberately kept apart:
--
--   1. `company_external_ids` answers "which record in someone else's registry
--      is this company", and is identity data.
--   2. `company_discovery_observations` answers "how did we come to hear about
--      this entity at all", and is discovery provenance. It is explicitly not
--      research evidence: an observation never becomes a claim, a citation, a
--      score input or a verified fact by being stored here, nor by later being
--      associated with a company.
--   3. `companies.company_stage` answers "how mature is this company", which
--      the schema had no way of saying.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Company maturity stage
--
-- The existing schema was checked for an equivalent before adding one. Three
-- neighbouring axes already exist and none of them expresses maturity:
--
--   ma_state         - ownership and transaction availability (independent,
--                      sale_process, pending, completed, ...).
--   lifecycle_status - where the row sits in the discovery and screening
--                      pipeline (research_pending, precedent, screened_out).
--   research_state   - how the last research pass ended.
--
-- The name is `company_stage` rather than `stage` on purpose. The Targets
-- filter and the Agent tool schema already expose a parameter called `stage`,
-- and there it is an alias for `ma_state`. Reusing the word here would silently
-- change what an existing filter means, so the new column carries the
-- unambiguous domain name and the old filter is left exactly as it was.
--
-- `unknown` is the truthful default and a real state, not a placeholder. It is
-- also the only value this migration writes: no bootstrap identity has been
-- researched, so any other value would be invented. Stage is deliberately kept
-- out of the `companies_bootstrap_is_identity_only` constraint - a bootstrap
-- identity keeps its origin after the pipeline researches it, so freezing its
-- stage at `unknown` forever would make a genuine future finding unrecordable.
-- ---------------------------------------------------------------------------

do $$
begin
  create type company_stage as enum (
    'pre_seed',
    'seed',
    'series_a',
    'series_b',
    'series_c_plus',
    'growth',
    'late_stage',
    'public',
    'bootstrapped',
    'unknown'
  );
exception
  when duplicate_object then null;
end
$$;

alter table companies
  add column if not exists company_stage company_stage not null default 'unknown';

create index if not exists companies_company_stage_idx on companies (company_stage);

comment on column companies.company_stage is
  'Company maturity/funding stage. Distinct from ma_state, lifecycle_status and research_state. `unknown` is a truthful state, not a placeholder.';

comment on column companies.ma_state is
  'Ownership and transaction availability. The product surfaces this as its "stage" filter; it is not company maturity - see company_stage.';

-- ---------------------------------------------------------------------------
-- 2. Company external identifiers
--
-- `provider` is extensible text rather than an enum, because the point of the
-- namespace is to admit registries the schema was never told about. A closed
-- enum would mean a migration every time Universe expansion learns a new
-- source, which is precisely the coupling this table exists to avoid.
--
-- `(provider, external_id)` is unique, and that constraint carries the real
-- meaning: one provider identity resolves to at most one canonical company.
-- There is deliberately no unique constraint on (company_id, provider) - a
-- company legitimately holds several records in one registry (multiple licence
-- entities, superseded registrations), and the contract leaves identifier
-- history unspecified rather than forbidding it.
--
-- `agent_run_id` is nullable and follows the project rule that runtime-derived
-- rows carry run provenance. It is what lets Milestone 18's stub isolation
-- extend to this table without a later schema change.
-- ---------------------------------------------------------------------------

create table if not exists company_external_ids (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  provider text not null check (length(trim(provider)) > 0),
  external_id text not null check (length(trim(external_id)) > 0),
  agent_run_id uuid references agent_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists company_external_ids_provider_identity_key
  on company_external_ids (provider, external_id);
create index if not exists company_external_ids_company_id_idx
  on company_external_ids (company_id);

drop trigger if exists company_external_ids_set_updated_at on company_external_ids;
create trigger company_external_ids_set_updated_at before update on company_external_ids
  for each row execute function set_updated_at();

-- The unique index alone does not say everything the contract needs.
--
-- It stops a *second* company from claiming an identity, but it does not stop
-- an upsert from moving the existing row to a different company: ON CONFLICT DO
-- UPDATE succeeds quietly and leaves one perfectly valid row behind, which is
-- how two companies become one without anybody deciding that they should. This
-- was found by pointing a raw upsert at an identity another company already
-- held, and it worked.
--
-- Re-pointing a provider identity is an entity-resolution decision, and this
-- milestone deliberately implements no entity resolution, so the database
-- refuses it for every writer rather than trusting each one to check. A
-- deliberate correction is a delete followed by an insert, which is auditable;
-- an accidental merge is not.
create or replace function public.forbid_external_identity_reassignment()
returns trigger
language plpgsql
as $$
begin
  if new.company_id is distinct from old.company_id then
    raise exception
      'external identifier %:% already resolves to company %; re-pointing it is an entity-resolution decision, not an update',
      old.provider, old.external_id, old.company_id
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

comment on function public.forbid_external_identity_reassignment() is
  'Refuses to move a (provider, external_id) identity between companies, so no upsert can merge two companies by accident.';

drop trigger if exists company_external_ids_forbid_reassignment on company_external_ids;
create trigger company_external_ids_forbid_reassignment
  before update on company_external_ids
  for each row execute function public.forbid_external_identity_reassignment();

comment on table company_external_ids is
  'Namespaced identifiers for one canonical company in external registries. (provider, external_id) resolves to at most one company.';

-- ---------------------------------------------------------------------------
-- 3. Discovery observations
--
-- `company_id` is nullable because an observation routinely exists before a
-- canonical company does. Resolution is an update of the same row, so the
-- record of how the entity was first seen survives it. Deleting a company
-- returns its observations to the unresolved state rather than destroying
-- them: the provider still reported the entity, whatever we later concluded.
--
-- `raw_metadata` holds whatever the provider sent. It is retained for audit and
-- debugging and is not user-facing data - see the security section below.
-- ---------------------------------------------------------------------------

create table if not exists company_discovery_observations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies (id) on delete set null,
  provider text not null check (length(trim(provider)) > 0),
  observed_name text not null check (length(trim(observed_name)) > 0),
  -- Observed values, not canonical conclusions. A provider's spelling of a
  -- domain or a country is what that provider said, not a company fact.
  observed_domain text check (observed_domain is null or length(trim(observed_domain)) > 0),
  observed_geography text check (observed_geography is null or length(trim(observed_geography)) > 0),
  -- Optional, because not every source has stable record identity.
  source_record_id text check (source_record_id is null or length(trim(source_record_id)) > 0),
  source_url text check (source_url is null or source_url ~* '^https?://'),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  raw_metadata jsonb,
  agent_run_id uuid references agent_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_discovery_observations_seen_window
    check (last_seen_at >= first_seen_at)
);

-- Idempotency, and only where a source can actually support it.
--
-- The index is intentionally not partial. Postgres infers an ON CONFLICT target
-- from a partial index only when the statement repeats that index's predicate,
-- which PostgREST's upsert does not emit, so a partial index would make the
-- upsert path fail outright. A plain unique index over nullable columns behaves
-- exactly as this model needs, because NULLs are distinct: a provider with
-- stable record identity is de-duplicated, and a provider without one simply
-- accumulates observations, which is the honest outcome. Nothing here guesses
-- that two rows describe the same entity.
create unique index if not exists company_discovery_observations_source_record_key
  on company_discovery_observations (provider, source_record_id);
create index if not exists company_discovery_observations_company_id_idx
  on company_discovery_observations (company_id);
create index if not exists company_discovery_observations_provider_idx
  on company_discovery_observations (provider);

-- A re-observation reports its own idea of "first seen", which for a replaying
-- provider is simply today. Provenance must not be rewritten by the most recent
-- claim about it, so the window only ever widens: the earliest sighting stays,
-- the latest sighting advances. Doing this in a trigger rather than in the
-- repository keeps it true for every writer, including a raw upsert.
create or replace function public.preserve_discovery_seen_window()
returns trigger
language plpgsql
as $$
begin
  new.first_seen_at = least(old.first_seen_at, new.first_seen_at);
  new.last_seen_at = greatest(old.last_seen_at, new.last_seen_at);
  return new;
end;
$$;

comment on function public.preserve_discovery_seen_window() is
  'Keeps first_seen_at at the earliest sighting and advances last_seen_at, so a provider replay cannot rewrite discovery provenance.';

drop trigger if exists company_discovery_observations_preserve_seen_window
  on company_discovery_observations;
create trigger company_discovery_observations_preserve_seen_window
  before update on company_discovery_observations
  for each row execute function public.preserve_discovery_seen_window();

drop trigger if exists company_discovery_observations_set_updated_at
  on company_discovery_observations;
create trigger company_discovery_observations_set_updated_at
  before update on company_discovery_observations
  for each row execute function set_updated_at();

comment on table company_discovery_observations is
  'Discovery provenance: how an entity came to our attention. Not research evidence, and never a claim, citation or score input.';

-- ---------------------------------------------------------------------------
-- 4. Row-level security
--
-- External identifiers are identity data of the same class as aliases and
-- domains, so they follow the rule those tables were given in Milestone 18:
-- readable by ordinary clients only when the company they point at is itself
-- readable, and only when their own provenance is not synthetic. That keeps the
-- new table from becoming a side channel around stub isolation, and it exposes
-- strictly less than the companies table already does.
--
-- Discovery observations get no public policy at all, and their default grants
-- are revoked outright. Raw provider payloads are third-party data captured for
-- audit; they are internal by construction rather than by a component
-- remembering not to render them. `chat_sessions` and `chat_messages` set the
-- precedent for a table with no public read policy. Any future public exposure
-- of discovery data must go through a view that omits `raw_metadata`, not
-- through a grant on this table.
--
-- Neither table gets an INSERT, UPDATE or DELETE policy, so every write stays
-- service-role only, exactly like the rest of this schema.
-- ---------------------------------------------------------------------------

alter table company_external_ids enable row level security;
alter table company_discovery_observations enable row level security;

drop policy if exists company_external_ids_public_read on company_external_ids;
create policy company_external_ids_public_read on company_external_ids
  for select to anon, authenticated
  using (
    (agent_run_id is null or public.is_production_agent_run(agent_run_id))
    and exists (
      select 1
      from public.companies
      where companies.id = company_external_ids.company_id
    )
  );

revoke all on table company_discovery_observations from anon, authenticated;
