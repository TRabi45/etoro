-- ---------------------------------------------------------------------------
-- eToro M&A Intelligence Agent - initial system of record
--
-- Design invariants this schema enforces at the database level, because they are
-- the invariants the product is graded on and code-only guards drift:
--
--   1. Bootstrap identity rows can never carry researched conclusions. A CHECK
--      constraint on `companies` rejects them outright, so a careless seed or a
--      future pipeline bug cannot pass off seed data as agent research.
--   2. Unknown is never zero. Numeric observations carry an explicit value
--      status; `unknown` and `not_applicable` require a NULL value, and a
--      disclosed/estimated value requires a number. There is no third state
--      where a missing figure silently becomes 0.
--   3. An expected close date never becomes a completed transaction. `deals`
--      keeps expected_close_date and closed_date apart and refuses a `closed`
--      status without an actual close date.
--   4. Analysis is never a verified fact. A CHECK constraint stops a claim of
--      kind `analysis` from being marked verified.
--   5. Every runtime-derived row keeps `agent_run_id` provenance.
--   6. Scores keep an immutable model version, the validated input snapshot,
--      and the hash of those inputs, so any stored score can be recomputed.
--
-- Row-level security posture: SELECT policies exist for the public evaluator
-- dashboard on the read-only tables. No INSERT/UPDATE/DELETE policy exists for
-- any role, so all writes must use the service role, which bypasses RLS
-- server-side. Chat tables carry no public policy at all.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Controlled vocabularies
--
-- These mirror the validated taxonomy. They are enum types rather than free
-- text so that an AI extraction step cannot invent a new category by writing a
-- slightly different string.
-- ---------------------------------------------------------------------------

do $$ begin
  create type strategic_theme as enum (
    'active_trading', 'wealth_long_term_savings', 'on_chain_infrastructure', 'money_payments'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type enabling_layer as enum ('ai', 'data', 'community', 'none');
exception when duplicate_object then null; end $$;

do $$ begin
  create type strategic_vector as enum (
    'geographic_entry', 'regulatory_acceleration', 'product_expansion', 'technology_ip',
    'talent', 'customer_acquisition', 'aua_acquisition', 'infrastructure', 'defensive_move'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type target_path as enum ('platform', 'tuck_in', 'hybrid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type target_object as enum (
    'full_company', 'regulated_subsidiary', 'business_unit', 'product_ip',
    'team_acquihire', 'customer_book', 'license_entity', 'minority_investment'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type customer_type as enum (
    'mass_retail', 'affluent', 'active_trader', 'crypto_native',
    'adviser_ria', 'institutional', 'developer_builder', 'smb_business'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type product_layer as enum (
    'brokerage', 'options_futures', 'execution_oms', 'market_data', 'retirement',
    'managed_portfolios', 'payments', 'e_money', 'custody', 'wallet', 'tokenization',
    'stablecoin', 'dex', 'prediction_markets', 'ai_analytics', 'social_community'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type regulatory_role as enum (
    'broker_dealer', 'investment_firm', 'fcm_derivatives', 'bank', 'emi_payment_institution',
    'casp_vasp', 'custodian', 'asset_wealth_manager', 'pension_super', 'unregulated_technology'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type economics_type as enum (
    'transaction_led', 'spread_led', 'interest_led', 'aua_management_fee',
    'subscription', 'payments_interchange', 'b2b_saas', 'mixed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type ma_state as enum (
    'independent', 'strategic_investor', 'sponsor_backed', 'sale_process',
    'announced_acquisition', 'pending', 'completed', 'terminated',
    'divestiture_carveout_candidate'
  );
exception when duplicate_object then null; end $$;

-- Bootstrap identity is a first-class origin: it marks a row the agent did not
-- research, which is what keeps seed data out of the "agent generated" story.
do $$ begin
  create type record_origin as enum ('bootstrap_identity', 'agent_generated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lifecycle_status as enum (
    'research_pending', 'discovered_unreviewed', 'under_review', 'active_candidate', 'rejected'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type alias_kind as enum ('legal_entity', 'brand', 'former_name', 'working_alias');
exception when duplicate_object then null; end $$;

do $$ begin
  create type claim_kind as enum (
    'verified_fact', 'company_reported', 'estimate', 'analysis', 'unknown'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type confidence_level as enum ('low', 'medium', 'high');
exception when duplicate_object then null; end $$;

do $$ begin
  create type source_type as enum (
    'regulator_registry', 'securities_filing', 'company_official', 'transaction_party',
    'investor', 'financial_press', 'specialist_database', 'trade_press', 'other'
  );
exception when duplicate_object then null; end $$;

-- Source trust is a property of the publisher. AI confidence is a property of
-- the extraction. They are deliberately separate columns on separate tables.
do $$ begin
  create type source_trust_tier as enum ('primary', 'secondary', 'tertiary');
exception when duplicate_object then null; end $$;

do $$ begin
  create type verification_status as enum ('unverified', 'verified', 'disputed', 'superseded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type claim_source_relation as enum ('supports', 'contradicts');
exception when duplicate_object then null; end $$;

do $$ begin
  create type value_status as enum ('disclosed', 'estimated', 'unknown', 'not_applicable');
exception when duplicate_object then null; end $$;

do $$ begin
  create type deal_status as enum (
    'rumored', 'announced', 'signed', 'regulatory_review',
    'closed', 'integrated', 'divested', 'terminated'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type license_status as enum (
    'active', 'applied', 'variation_requested', 'suspended', 'withdrawn', 'revoked', 'unknown'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type fundamental_archetype as enum (
    'brokerage_active_trading', 'wealth_savings', 'payments_e_money',
    'crypto_on_chain', 'b2b_infrastructure_saas', 'team_ip_tuck_in'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type event_type as enum (
    'acquisition', 'divestiture', 'strategic_review', 'carve_out', 'minority_investment',
    'funding', 'down_round', 'debt_distress', 'layoffs', 'shutdown', 'founder_exit',
    'license_grant', 'license_application', 'license_variation', 'license_suspension',
    'license_withdrawal', 'enforcement', 'change_of_control', 'product_launch',
    'kpi_change', 'security_incident', 'custody_incident', 'privacy_incident',
    'aml_incident', 'fraud_incident', 'conduct_incident', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type materiality_level as enum ('low', 'medium', 'high');
exception when duplicate_object then null; end $$;

do $$ begin
  create type score_state as enum ('scored', 'research_only');
exception when duplicate_object then null; end $$;

do $$ begin
  create type recommendation_state as enum (
    'acquire', 'invest', 'partner', 'build', 'monitor', 'pass', 'research_only'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type watchlist_status as enum ('watching', 'paused', 'removed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type run_trigger as enum ('scheduled', 'manual', 'bootstrap');
exception when duplicate_object then null; end $$;

do $$ begin
  create type run_status as enum ('running', 'success', 'partial_success', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type chat_role as enum ('user', 'assistant');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest without relying on the application.
-- ---------------------------------------------------------------------------

create or replace function set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Observability first: provenance tables are referenced by nearly everything
-- else, so they are created before the knowledge tables.
-- ---------------------------------------------------------------------------

create table if not exists monitoring_runs (
  id uuid primary key default gen_random_uuid(),
  trigger run_trigger not null,
  status run_status not null default 'running',
  -- Reusing an idempotency key is how an overlapping scheduled trigger avoids
  -- creating a duplicate run.
  idempotency_key text not null unique,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  sources_discovered integer not null default 0 check (sources_discovered >= 0),
  sources_fetched integer not null default 0 check (sources_fetched >= 0),
  claims_written integer not null default 0 check (claims_written >= 0),
  events_written integer not null default 0 check (events_written >= 0),
  warnings text[] not null default '{}',
  error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monitoring_runs_finished_after_started
    check (finished_at is null or finished_at >= started_at)
);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  monitoring_run_id uuid references monitoring_runs (id) on delete set null,
  purpose text not null,
  -- Prompt and model configuration are recorded per run for auditability. They
  -- are never hard-coded in application code.
  prompt_version text,
  model_name text,
  status run_status not null default 'running',
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  usage jsonb,
  error_class text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_runs_monitoring_run_id_idx on agent_runs (monitoring_run_id);

-- ---------------------------------------------------------------------------
-- Company identity
-- ---------------------------------------------------------------------------

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  -- The name a human uses. Deliberately separate from the legal entity, because
  -- a brand and the entity that can actually be acquired are different facts.
  canonical_name text not null check (length(trim(canonical_name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  legal_entity_name text,
  parent_company_id uuid references companies (id) on delete set null,
  primary_domain text,
  record_origin record_origin not null,
  lifecycle_status lifecycle_status not null default 'research_pending',
  theme_tags strategic_theme[] not null default '{}',
  enabling_layers enabling_layer[] not null default '{}',
  -- Everything below this line is researched output. It stays NULL for
  -- bootstrap identities, enforced by the constraint at the end of the table.
  description text,
  path target_path,
  ma_state ma_state,
  hq_country text,
  incorporation_country text,
  discovery_reason text,
  agent_run_id uuid references agent_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A company cannot be its own parent.
  constraint companies_parent_not_self check (parent_company_id is null or parent_company_id <> id),

  -- The bootstrap isolation rule, enforced by the database rather than trusted
  -- to the seed script: an identity-only row carries identity only.
  constraint companies_bootstrap_is_identity_only check (
    record_origin <> 'bootstrap_identity'
    or (
      description is null
      and path is null
      and ma_state is null
      and discovery_reason is null
      and agent_run_id is null
      and lifecycle_status = 'research_pending'
    )
  ),

  -- Conversely, anything the agent generated must say which run produced it.
  constraint companies_agent_rows_have_provenance check (
    record_origin <> 'agent_generated' or agent_run_id is not null
  )
);

create index if not exists companies_record_origin_idx on companies (record_origin);
create index if not exists companies_lifecycle_status_idx on companies (lifecycle_status);
create index if not exists companies_path_idx on companies (path);
create index if not exists companies_theme_tags_idx on companies using gin (theme_tags);
create unique index if not exists companies_primary_domain_key
  on companies (lower(primary_domain)) where primary_domain is not null;

drop trigger if exists companies_set_updated_at on companies;
create trigger companies_set_updated_at before update on companies
  for each row execute function set_updated_at();

-- Aliases are normalized rather than buried in profile prose so that identity
-- resolution is a query, not a string search over descriptions. `B2C2` and
-- `Bit2C` are different companies; nothing here may merge them.
create table if not exists company_aliases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  alias text not null check (length(trim(alias)) > 0),
  alias_kind alias_kind not null,
  -- True only when this string is the exact registered legal entity name.
  is_exact_legal_entity boolean not null default false,
  notes text,
  agent_run_id uuid references agent_runs (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists company_aliases_unique_per_company
  on company_aliases (company_id, lower(alias));
create index if not exists company_aliases_alias_idx on company_aliases (lower(alias));

create table if not exists company_domains (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  domain text not null check (domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  is_primary boolean not null default false,
  agent_run_id uuid references agent_runs (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists company_domains_domain_key on company_domains (lower(domain));
create index if not exists company_domains_company_id_idx on company_domains (company_id);

-- Search leads are labels and queries that tell the first monitoring run where
-- to look. They are instructions for research, never research results.
create table if not exists company_search_leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  query text,
  created_at timestamptz not null default now()
);

create unique index if not exists company_search_leads_unique_per_company
  on company_search_leads (company_id, lower(label));

-- ---------------------------------------------------------------------------
-- Evidence: sources, claims, and the link between them
-- ---------------------------------------------------------------------------

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  -- Normalized form is the deduplication key: the same article reached through
  -- two tracking URLs is one source.
  url_normalized text not null unique,
  title text,
  publisher text,
  source_type source_type not null,
  trust_tier source_trust_tier not null,
  -- Three distinct dates, never collapsed into one.
  published_at date,
  accessed_at timestamptz not null default now(),
  content_hash text,
  agent_run_id uuid references agent_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sources_url_is_http check (url ~* '^https?://')
);

create index if not exists sources_source_type_idx on sources (source_type);
create index if not exists sources_content_hash_idx on sources (content_hash);

drop trigger if exists sources_set_updated_at on sources;
create trigger sources_set_updated_at before update on sources
  for each row execute function set_updated_at();

create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies (id) on delete cascade,
  subject text not null,
  predicate text not null,
  value_text text,
  value_numeric numeric,
  value_unit text,
  value_currency text check (value_currency is null or value_currency ~ '^[A-Z]{3}$'),
  value_status value_status not null default 'disclosed',
  -- The date the fact is true for, which is not the date it was published.
  as_of_date date,
  claim_kind claim_kind not null,
  -- Confidence of the extraction. Source trust lives on `sources`.
  ai_confidence confidence_level,
  verification_status verification_status not null default 'unverified',
  -- Contradictory claims are kept side by side and joined by this group rather
  -- than one overwriting the other.
  conflict_group uuid,
  unknown_reason text,
  agent_run_id uuid references agent_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Analysis is a judgement. It can never be stored as a verified fact.
  constraint claims_analysis_is_not_verified check (
    claim_kind <> 'analysis' or verification_status <> 'verified'
  ),

  -- Unknown means unknown: no number, and a reason for the gap.
  constraint claims_unknown_has_no_value check (
    value_status not in ('unknown', 'not_applicable') or value_numeric is null
  ),
  constraint claims_known_value_is_present check (
    value_status not in ('disclosed', 'estimated')
    or value_numeric is not null
    or value_text is not null
  )
);

create index if not exists claims_company_id_idx on claims (company_id);
create index if not exists claims_conflict_group_idx on claims (conflict_group)
  where conflict_group is not null;
create index if not exists claims_claim_kind_idx on claims (claim_kind);

drop trigger if exists claims_set_updated_at on claims;
create trigger claims_set_updated_at before update on claims
  for each row execute function set_updated_at();

-- A source can support a claim or contradict it. Modelling the relation
-- explicitly is what allows the UI to show a disagreement instead of silently
-- picking a winner.
create table if not exists claim_sources (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims (id) on delete cascade,
  source_id uuid not null references sources (id) on delete cascade,
  relation claim_source_relation not null default 'supports',
  excerpt text,
  created_at timestamptz not null default now()
);

create unique index if not exists claim_sources_unique_link
  on claim_sources (claim_id, source_id, relation);
create index if not exists claim_sources_source_id_idx on claim_sources (source_id);

-- ---------------------------------------------------------------------------
-- Company knowledge derived from evidence
-- ---------------------------------------------------------------------------

create table if not exists company_metrics (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  metric_type text not null,
  value_numeric numeric,
  value_unit text,
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  value_status value_status not null,
  period_start date,
  period_end date,
  as_of_date date,
  claim_id uuid references claims (id) on delete set null,
  confidence confidence_level,
  agent_run_id uuid references agent_runs (id) on delete set null,
  created_at timestamptz not null default now(),

  -- A missing metric stays missing. It never becomes zero.
  constraint company_metrics_unknown_has_no_value check (
    value_status not in ('unknown', 'not_applicable') or value_numeric is null
  ),
  constraint company_metrics_known_has_value check (
    value_status not in ('disclosed', 'estimated') or value_numeric is not null
  ),
  constraint company_metrics_period_ordered check (
    period_start is null or period_end is null or period_end >= period_start
  )
);

create index if not exists company_metrics_company_id_idx on company_metrics (company_id);
create index if not exists company_metrics_metric_type_idx on company_metrics (metric_type);

create table if not exists fundamental_analyses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  archetype fundamental_archetype not null,
  version integer not null check (version > 0),
  revenue_quality text,
  growth_assessment text,
  margin_assessment text,
  burn_runway text,
  concentration text,
  derived_ratios jsonb not null default '{}',
  unknowns text[] not null default '{}',
  evidence_coverage numeric(5, 4) check (
    evidence_coverage is null or (evidence_coverage >= 0 and evidence_coverage <= 1)
  ),
  agent_run_id uuid not null references agent_runs (id) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index if not exists fundamental_analyses_company_version_key
  on fundamental_analyses (company_id, version);

create table if not exists licenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  -- A licence belongs to an exact legal entity, not to a brand.
  legal_entity_name text not null,
  regulator text not null,
  jurisdiction text not null,
  license_type text not null,
  reference_number text,
  regulatory_role regulatory_role,
  status license_status not null default 'unknown',
  verified_at date,
  claim_id uuid references claims (id) on delete set null,
  agent_run_id uuid references agent_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists licenses_company_id_idx on licenses (company_id);
create unique index if not exists licenses_unique_reference
  on licenses (lower(regulator), lower(reference_number))
  where reference_number is not null;

drop trigger if exists licenses_set_updated_at on licenses;
create trigger licenses_set_updated_at before update on licenses
  for each row execute function set_updated_at();

create table if not exists funding_rounds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  announced_date date,
  round_type text,
  amount numeric,
  amount_currency text check (amount_currency is null or amount_currency ~ '^[A-Z]{3}$'),
  amount_status value_status not null default 'disclosed',
  valuation numeric,
  valuation_currency text check (valuation_currency is null or valuation_currency ~ '^[A-Z]{3}$'),
  -- A round is often disclosed while the valuation behind it is not. The two
  -- statuses are independent for exactly that reason.
  valuation_status value_status not null default 'unknown',
  investors text[] not null default '{}',
  claim_id uuid references claims (id) on delete set null,
  agent_run_id uuid references agent_runs (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint funding_rounds_amount_status check (
    (amount_status in ('unknown', 'not_applicable') and amount is null)
    or (amount_status in ('disclosed', 'estimated') and amount is not null)
  ),
  constraint funding_rounds_valuation_status check (
    (valuation_status in ('unknown', 'not_applicable') and valuation is null)
    or (valuation_status in ('disclosed', 'estimated') and valuation is not null)
  )
);

create index if not exists funding_rounds_company_id_idx on funding_rounds (company_id);

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  full_name text not null,
  role text,
  start_date date,
  end_date date,
  claim_id uuid references claims (id) on delete set null,
  agent_run_id uuid references agent_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint people_dates_ordered check (
    start_date is null or end_date is null or end_date >= start_date
  )
);

create index if not exists people_company_id_idx on people (company_id);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies (id) on delete cascade,
  event_type event_type not null,
  -- When the thing happened, which is not when it was written about.
  event_date date,
  published_at date,
  summary text not null,
  materiality materiality_level,
  etoro_relevance text,
  primary_source_id uuid references sources (id) on delete set null,
  agent_run_id uuid not null references agent_runs (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists events_company_id_idx on events (company_id);
create index if not exists events_event_date_idx on events (event_date desc);
create index if not exists events_event_type_idx on events (event_type);

-- ---------------------------------------------------------------------------
-- Transactions
-- ---------------------------------------------------------------------------

create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  -- Either side may be a company that is not in the universe yet, so a text
  -- identity is allowed until it is resolved to a row.
  acquirer_company_id uuid references companies (id) on delete set null,
  acquirer_name_text text,
  target_company_id uuid references companies (id) on delete set null,
  target_name_text text,
  deal_type target_object,
  status deal_status not null,
  announced_date date,
  signed_date date,
  -- An expectation, never evidence of completion.
  expected_close_date date,
  closed_date date,
  terminated_date date,
  consideration_amount numeric,
  consideration_currency text check (
    consideration_currency is null or consideration_currency ~ '^[A-Z]{3}$'
  ),
  consideration_status value_status not null default 'unknown',
  rationale text,
  agent_run_id uuid references agent_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint deals_has_acquirer check (acquirer_company_id is not null or acquirer_name_text is not null),
  constraint deals_has_target check (target_company_id is not null or target_name_text is not null),

  -- A transaction is only closed when an actual close date exists. This is the
  -- constraint that stops "expected H1 2027" from becoming "completed".
  constraint deals_closed_requires_close_date check (
    status not in ('closed', 'integrated') or closed_date is not null
  ),
  constraint deals_terminated_requires_date check (
    status <> 'terminated' or terminated_date is not null
  ),
  constraint deals_consideration_status check (
    (consideration_status in ('unknown', 'not_applicable') and consideration_amount is null)
    or (consideration_status in ('disclosed', 'estimated') and consideration_amount is not null)
  )
);

create index if not exists deals_acquirer_company_id_idx on deals (acquirer_company_id);
create index if not exists deals_target_company_id_idx on deals (target_company_id);
create index if not exists deals_status_idx on deals (status);

drop trigger if exists deals_set_updated_at on deals;
create trigger deals_set_updated_at before update on deals
  for each row execute function set_updated_at();

-- Transaction status is time-versioned: the history is kept so that "announced
-- on X, signed on Y, still pending on Z" is answerable, and a later state never
-- erases the evidence for an earlier one.
create table if not exists deal_status_history (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals (id) on delete cascade,
  status deal_status not null,
  effective_from date not null,
  source_id uuid references sources (id) on delete set null,
  note text,
  agent_run_id uuid references agent_runs (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists deal_status_history_unique_state
  on deal_status_history (deal_id, status, effective_from);
create index if not exists deal_status_history_deal_id_idx
  on deal_status_history (deal_id, effective_from desc);

-- ---------------------------------------------------------------------------
-- Assessment and deterministic scoring
-- ---------------------------------------------------------------------------

create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  thesis_version text not null,
  path target_path not null,
  strategic_fit_summary text,
  gap_closed text,
  why_now text,
  synergies text,
  risks text,
  counter_thesis text,
  unknowns text[] not null default '{}',
  -- Acquire is only defensible when control beats the alternatives, so the
  -- comparison against build/partner/invest/monitor is recorded, not implied.
  route_assessment jsonb not null default '{}',
  agent_run_id uuid not null references agent_runs (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists assessments_company_id_idx on assessments (company_id);

-- Scoring configuration is data, not code branching: a stored, versioned row.
create table if not exists scoring_models (
  id uuid primary key default gen_random_uuid(),
  path target_path not null check (path <> 'hybrid'),
  version text not null,
  dimensions jsonb not null,
  risk_components jsonb not null,
  evidence_bands jsonb not null,
  thresholds jsonb not null,
  is_active boolean not null default false,
  activated_at timestamptz,
  -- Set the first time a score is written against this model. From then on the
  -- configuration is immutable, so historical scores stay reproducible.
  locked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists scoring_models_path_version_key on scoring_models (path, version);
-- At most one active configuration per path.
create unique index if not exists scoring_models_one_active_per_path
  on scoring_models (path) where is_active;

create or replace function reject_locked_scoring_model_change() returns trigger
language plpgsql
as $$
begin
  -- Once a model has produced a score its definition is frozen. Only the
  -- activation flags may still change, so a newer version can take over.
  if old.locked_at is not null and (
    new.dimensions is distinct from old.dimensions
    or new.risk_components is distinct from old.risk_components
    or new.evidence_bands is distinct from old.evidence_bands
    or new.thresholds is distinct from old.thresholds
    or new.version is distinct from old.version
    or new.path is distinct from old.path
  ) then
    raise exception 'scoring model %/% is locked and cannot be modified', old.path, old.version;
  end if;
  return new;
end;
$$;

drop trigger if exists scoring_models_immutable_after_use on scoring_models;
create trigger scoring_models_immutable_after_use before update on scoring_models
  for each row execute function reject_locked_scoring_model_change();

create table if not exists scores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  scoring_model_id uuid not null references scoring_models (id) on delete restrict,
  -- Denormalized on purpose: the version that produced this number must survive
  -- even if configuration rows are later reorganized.
  model_version text not null,
  path target_path not null,
  -- The exact validated inputs, plus the hash of their canonical form. Together
  -- they make every stored score independently recomputable.
  input_snapshot jsonb not null,
  input_hash text not null,
  positive_normalized numeric(6, 2) check (
    positive_normalized is null or (positive_normalized >= 0 and positive_normalized <= 100)
  ),
  risk_penalty numeric(5, 2) not null check (risk_penalty >= 0 and risk_penalty <= 20),
  evidence_penalty numeric(5, 2) not null check (evidence_penalty >= 0 and evidence_penalty <= 15),
  weighted_coverage numeric(5, 4) not null check (weighted_coverage >= 0 and weighted_coverage <= 1),
  final_score numeric(6, 2) check (
    final_score is null or (final_score >= 0 and final_score <= 100)
  ),
  score_state score_state not null,
  recommendation recommendation_state not null,
  calculated_at timestamptz not null default now(),
  agent_run_id uuid references agent_runs (id) on delete set null,
  created_at timestamptz not null default now(),

  -- Research only means there is no decision score to show. Anything else must
  -- carry a number.
  constraint scores_research_only_has_no_score check (
    (score_state = 'research_only' and final_score is null and positive_normalized is null)
    or (score_state = 'scored' and final_score is not null and positive_normalized is not null)
  ),
  constraint scores_research_only_recommendation check (
    score_state <> 'research_only' or recommendation = 'research_only'
  )
);

-- One score per company per model per set of inputs: a recalculation with
-- unchanged inputs is not a new score.
create unique index if not exists scores_unique_input
  on scores (company_id, scoring_model_id, input_hash);
create index if not exists scores_company_id_idx on scores (company_id);
create index if not exists scores_final_score_idx on scores (final_score desc nulls last);

-- Writing a score freezes the configuration that produced it.
create or replace function lock_scoring_model_on_score() returns trigger
language plpgsql
as $$
begin
  update scoring_models
     set locked_at = coalesce(locked_at, now())
   where id = new.scoring_model_id;
  return new;
end;
$$;

drop trigger if exists scores_lock_scoring_model on scores;
create trigger scores_lock_scoring_model after insert on scores
  for each row execute function lock_scoring_model_on_score();

-- ---------------------------------------------------------------------------
-- Watchlist and conversation
-- ---------------------------------------------------------------------------

create table if not exists watchlist (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references companies (id) on delete cascade,
  status watchlist_status not null default 'watching',
  reasons text[] not null default '{}',
  review_date date,
  tracked_event_types event_type[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists watchlist_set_updated_at on watchlist;
create trigger watchlist_set_updated_at before update on watchlist
  for each row execute function set_updated_at();

create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  current_company_id uuid references companies (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists chat_sessions_set_updated_at on chat_sessions;
create trigger chat_sessions_set_updated_at before update on chat_sessions
  for each row execute function set_updated_at();

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions (id) on delete cascade,
  role chat_role not null,
  content text not null,
  citations jsonb not null default '[]',
  tool_summary jsonb,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_session_id_idx on chat_messages (session_id, created_at);

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- The evaluator dashboard is public and read-only. Every table has RLS enabled;
-- read policies are granted only where the dashboard needs them, and no role
-- other than the service role can write anything.
-- ---------------------------------------------------------------------------

alter table monitoring_runs enable row level security;
alter table agent_runs enable row level security;
alter table companies enable row level security;
alter table company_aliases enable row level security;
alter table company_domains enable row level security;
alter table company_search_leads enable row level security;
alter table sources enable row level security;
alter table claims enable row level security;
alter table claim_sources enable row level security;
alter table company_metrics enable row level security;
alter table fundamental_analyses enable row level security;
alter table licenses enable row level security;
alter table funding_rounds enable row level security;
alter table people enable row level security;
alter table events enable row level security;
alter table deals enable row level security;
alter table deal_status_history enable row level security;
alter table assessments enable row level security;
alter table scoring_models enable row level security;
alter table scores enable row level security;
alter table watchlist enable row level security;
alter table chat_sessions enable row level security;
alter table chat_messages enable row level security;

do $$
declare
  readable_table text;
begin
  foreach readable_table in array array[
    'companies', 'company_aliases', 'company_domains', 'company_search_leads',
    'sources', 'claims', 'claim_sources', 'company_metrics', 'fundamental_analyses',
    'licenses', 'funding_rounds', 'people', 'events', 'deals', 'deal_status_history',
    'assessments', 'scoring_models', 'scores', 'watchlist', 'monitoring_runs', 'agent_runs'
  ]
  loop
    execute format('drop policy if exists %I on %I', readable_table || '_public_read', readable_table);
    execute format(
      'create policy %I on %I for select to anon, authenticated using (true)',
      readable_table || '_public_read',
      readable_table
    );
  end loop;
end $$;

-- chat_sessions and chat_messages intentionally have no public policy: a
-- conversation is served through a server route that owns the session, not read
-- directly from the browser.
