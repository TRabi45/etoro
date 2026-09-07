-- Synthetic runs remain available to service-role test and demo tooling, but
-- the public application must fail closed: only artifacts with non-stub run
-- provenance are production intelligence. Keeping this rule in RLS protects
-- every current and future anon/authenticated reader without relying on each
-- repository or UI component to remember an application-side filter.

create or replace function public.is_production_agent_run(run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.agent_runs
    where id = run_id
      and is_stub = false
  );
$$;

comment on function public.is_production_agent_run(uuid) is
  'RLS predicate: true only when an artifact has explicit non-stub agent-run provenance.';

revoke all on function public.is_production_agent_run(uuid) from public;
grant execute on function public.is_production_agent_run(uuid) to anon, authenticated;

-- Run metadata is itself provenance. Normal readers can inspect real runs but
-- cannot discover synthetic runs or accidentally present them as activity.
drop policy if exists agent_runs_public_read on agent_runs;
create policy agent_runs_public_read on agent_runs
  for select to anon, authenticated
  using (is_stub = false);

-- Bootstrap identities have no agent run and remain visible. Agent-created
-- identities are visible only when the run that introduced them was real.
drop policy if exists companies_public_read on companies;
create policy companies_public_read on companies
  for select to anon, authenticated
  using (
    agent_run_id is null
    or public.is_production_agent_run(agent_run_id)
  );

drop policy if exists company_aliases_public_read on company_aliases;
create policy company_aliases_public_read on company_aliases
  for select to anon, authenticated
  using (
    (agent_run_id is null or public.is_production_agent_run(agent_run_id))
    and exists (
      select 1
      from public.companies
      where companies.id = company_aliases.company_id
    )
  );

drop policy if exists company_domains_public_read on company_domains;
create policy company_domains_public_read on company_domains
  for select to anon, authenticated
  using (
    (agent_run_id is null or public.is_production_agent_run(agent_run_id))
    and exists (
      select 1
      from public.companies
      where companies.id = company_domains.company_id
    )
  );

drop policy if exists company_search_leads_public_read on company_search_leads;
create policy company_search_leads_public_read on company_search_leads
  for select to anon, authenticated
  using (
    exists (
      select 1
      from public.companies
      where companies.id = company_search_leads.company_id
    )
  );

-- Every analytical artifact fails closed when provenance is absent or points
-- to a synthetic run. A NULL run is not evidence that something is real.
do $$
declare
  artifact_table text;
begin
  foreach artifact_table in array array[
    'sources', 'claims', 'company_metrics', 'fundamental_analyses',
    'licenses', 'funding_rounds', 'people', 'events', 'deals',
    'deal_status_history', 'assessments', 'scores'
  ]
  loop
    execute format(
      'drop policy if exists %I on %I',
      artifact_table || '_public_read',
      artifact_table
    );
    execute format(
      'create policy %I on %I for select to anon, authenticated using (public.is_production_agent_run(agent_run_id))',
      artifact_table || '_public_read',
      artifact_table
    );
  end loop;
end $$;

-- Link tables have no run column of their own. They are visible only when all
-- linked analytical records survive the production-provenance policies above.
drop policy if exists claim_sources_public_read on claim_sources;
create policy claim_sources_public_read on claim_sources
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.claims where claims.id = claim_sources.claim_id
    )
    and exists (
      select 1 from public.sources where sources.id = claim_sources.source_id
    )
  );

drop policy if exists assessment_claims_public_read on assessment_claims;
create policy assessment_claims_public_read on assessment_claims
  for select to anon, authenticated
  using (
    exists (
      select 1
      from public.assessments
      where assessments.id = assessment_claims.assessment_id
    )
    and exists (
      select 1 from public.claims where claims.id = assessment_claims.claim_id
    )
  );

drop policy if exists fundamental_analysis_claims_public_read on fundamental_analysis_claims;
create policy fundamental_analysis_claims_public_read on fundamental_analysis_claims
  for select to anon, authenticated
  using (
    exists (
      select 1
      from public.fundamental_analyses
      where fundamental_analyses.id = fundamental_analysis_claims.fundamental_analysis_id
    )
    and exists (
      select 1 from public.claims where claims.id = fundamental_analysis_claims.claim_id
    )
  );

-- Watchlist rows are analyst configuration rather than generated intelligence,
-- but they must not reveal an identity that the production universe cannot see.
drop policy if exists watchlist_public_read on watchlist;
create policy watchlist_public_read on watchlist
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.companies where companies.id = watchlist.company_id
    )
  );
