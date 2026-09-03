-- ---------------------------------------------------------------------------
-- Evidence links: connect derived analysis back to the claims it rests on.
--
-- Milestone 1 gave every runtime record `agent_run_id` provenance, and gave
-- individual metrics a `claim_id`. That is enough to say *which run* produced an
-- assessment, but not *which evidence* it was reasoning from - so a rendered
-- conclusion ("integration risk is manageable") had no path back to a source.
--
-- The product requirement is that every material fact, metric and assessment
-- conclusion on screen is traceable to a source. These two join tables close
-- that gap relationally, rather than by embedding claim ids in a jsonb blob
-- where nothing would enforce that the referenced claims still exist.
--
--   assessment_claims           - which claims support a strategic conclusion
--   fundamental_analysis_claims - which claims support a fundamentals field
--
-- The chain the UI walks to render a citation is therefore:
--   assessment -> assessment_claims -> claims -> claim_sources -> sources
-- ---------------------------------------------------------------------------

create table if not exists assessment_claims (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments (id) on delete cascade,
  claim_id uuid not null references claims (id) on delete restrict,
  -- Which part of the assessment this claim supports, so the UI can cite the
  -- specific sentence rather than footnoting the whole section.
  role text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists assessment_claims_unique_link
  on assessment_claims (assessment_id, claim_id, role);
create index if not exists assessment_claims_assessment_id_idx
  on assessment_claims (assessment_id);
create index if not exists assessment_claims_claim_id_idx on assessment_claims (claim_id);

create table if not exists fundamental_analysis_claims (
  id uuid primary key default gen_random_uuid(),
  fundamental_analysis_id uuid not null
    references fundamental_analyses (id) on delete cascade,
  claim_id uuid not null references claims (id) on delete restrict,
  -- The fundamentals field this claim evidences (revenue_quality, growth, ...).
  field text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists fundamental_analysis_claims_unique_link
  on fundamental_analysis_claims (fundamental_analysis_id, claim_id, field);
create index if not exists fundamental_analysis_claims_analysis_id_idx
  on fundamental_analysis_claims (fundamental_analysis_id);
create index if not exists fundamental_analysis_claims_claim_id_idx
  on fundamental_analysis_claims (claim_id);

-- Same posture as every other table: public read for the evaluator dashboard,
-- writes only through the service role.
alter table assessment_claims enable row level security;
alter table fundamental_analysis_claims enable row level security;

drop policy if exists assessment_claims_public_read on assessment_claims;
create policy assessment_claims_public_read on assessment_claims
  for select to anon, authenticated using (true);

drop policy if exists fundamental_analysis_claims_public_read on fundamental_analysis_claims;
create policy fundamental_analysis_claims_public_read on fundamental_analysis_claims
  for select to anon, authenticated using (true);
