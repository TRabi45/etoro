-- companies.tier_changed_by_run_id and company_tier_transitions.agent_run_id
-- were both pointed at agent_runs, but the tier decision they record is made
-- by the company-research orchestrator, whose unit of work is a row in
-- company_research_runs (added in the prior migration) - not the lower-level
-- agent_runs row runVerticalSlice happens to create for its own bookkeeping,
-- which does not even exist on every code path (a run that fetched nothing
-- never calls it). Found by actually running the orchestrator against a
-- fixture, not by reading the schema.
alter table companies drop constraint if exists companies_tier_changed_by_run_id_fkey;
alter table companies
  add constraint companies_tier_changed_by_run_id_fkey
  foreign key (tier_changed_by_run_id) references company_research_runs (id) on delete set null;

alter table company_tier_transitions rename column agent_run_id to research_run_id;
alter table company_tier_transitions
  drop constraint if exists company_tier_transitions_agent_run_id_fkey;
alter table company_tier_transitions
  add constraint company_tier_transitions_research_run_id_fkey
  foreign key (research_run_id) references company_research_runs (id) on delete restrict;
