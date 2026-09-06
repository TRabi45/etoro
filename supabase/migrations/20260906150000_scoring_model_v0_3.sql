-- Scoring model v0.3: the acquisition thesis, as schema.
--
-- Three changes the thesis forces, and one it forbids.
--
-- Forced:
--   * One global weight set (section 26), so `scoring_models.path` becomes
--     optional rather than the key a model is chosen by.
--   * A score always travels with its coverage and an uncertainty range
--     (section 26, mandatory principle 6), so `scores` gains lower and upper
--     bounds.
--   * Gates are part of the model, not of the code (section 28), so
--     `scoring_models` gains `hard_gates` - and section 27's weight governance
--     ("versioned with date, owner and rationale") gains the two columns it
--     needs to be more than a commit message.
--
-- Forbidden: hiding missing evidence inside the number. `risk_penalty` and
-- `evidence_penalty` are not dropped, because rows written under v0.2 still
-- carry real values in them, but they become nullable and v0.3 writes NULL.
-- NULL here means "this model has no such concept", which is not the same thing
-- as zero - the distinction section 30 insists on, applied to the score table
-- itself.
--
-- Nothing written under v0.2 is modified. `scoring_models.locked_at` already
-- freezes a configuration once it has produced a score, and the difference
-- between the two models is exactly what section 36 asks the agent to be able to
-- explain: "Weight change versus fact change - agent explains the two deltas
-- differently."

-- Section 34's recommendation labels are actions to take. v0.2's states were
-- routes (acquire, build, partner, invest, monitor), which section 23 treats as
-- a separate axis. Both vocabularies now live in the enum because the table
-- holds rows from both models; new values are added rather than the old ones
-- removed, since a stored score must keep meaning what it meant when written.
alter type recommendation_state add value if not exists 'priority_diligence';
alter type recommendation_state add value if not exists 'shortlist';
alter type recommendation_state add value if not exists 'watch';
alter type recommendation_state add value if not exists 'do_not_advance';
alter type recommendation_state add value if not exists 'blocked';

-- Section 23's five routes, stored so a recommendation can show which one won
-- and which came second.
do $$
begin
  create type scoring_route as enum ('build', 'partner', 'buy', 'invest', 'watch');
exception
  when duplicate_object then null;
end
$$;

------------------------------------------------------------------------------
-- scoring_models
------------------------------------------------------------------------------

alter table scoring_models alter column path drop not null;
alter table scoring_models alter column risk_components drop not null;
alter table scoring_models alter column evidence_bands drop not null;

alter table scoring_models add column if not exists hard_gates jsonb;
-- Section 27: "Weights are versioned with date, owner and rationale. Do not
-- change a weight to promote a known target after seeing its result."
alter table scoring_models add column if not exists owner text;
alter table scoring_models add column if not exists rationale text;
alter table scoring_models add column if not exists thesis_version text;

-- The old uniqueness assumed every model had a path. With one global model,
-- NULL paths would not collide with each other and two v0.3 rows could claim
-- the same version.
-- Split into two partial indexes rather than one expression over
-- `coalesce(path::text, 'global')`: casting an enum to text is not marked
-- immutable, so Postgres refuses it in an index.
drop index if exists scoring_models_path_version_key;
create unique index if not exists scoring_models_path_version_key
  on scoring_models (path, version) where path is not null;
create unique index if not exists scoring_models_global_version_key
  on scoring_models (version) where path is null;

drop index if exists scoring_models_one_active_per_path;
create unique index if not exists scoring_models_one_active_per_path
  on scoring_models (path) where is_active and path is not null;
-- At most one active global model: indexing the constant-true predicate column
-- makes every qualifying row collide with every other.
create unique index if not exists scoring_models_one_active_global
  on scoring_models (is_active) where is_active and path is null;

-- The immutability trigger has to learn about the new columns, or a locked
-- model's gates and rationale could be rewritten under a score that used them.
create or replace function reject_locked_scoring_model_change() returns trigger
language plpgsql
as $$
begin
  if old.locked_at is not null and (
    new.dimensions is distinct from old.dimensions
    or new.risk_components is distinct from old.risk_components
    or new.evidence_bands is distinct from old.evidence_bands
    or new.thresholds is distinct from old.thresholds
    or new.hard_gates is distinct from old.hard_gates
    or new.owner is distinct from old.owner
    or new.rationale is distinct from old.rationale
    or new.thesis_version is distinct from old.thesis_version
    or new.version is distinct from old.version
    or new.path is distinct from old.path
  ) then
    raise exception 'scoring model % is locked and cannot be changed', old.id;
  end if;
  return new;
end
$$;

------------------------------------------------------------------------------
-- scores
------------------------------------------------------------------------------

alter table scores alter column path drop not null;
alter table scores alter column risk_penalty drop not null;
alter table scores alter column evidence_penalty drop not null;

-- Section 26: "A normalized 82 at 55% coverage with a 45-90 range is not
-- '82/100.' Display 82 - 55% coverage - 45-90 range." The three numbers travel
-- together or the display is dishonest, so the bounds live beside the score
-- rather than being recomputed by whoever renders it.
alter table scores add column if not exists lower_bound numeric(6, 2);
alter table scores add column if not exists upper_bound numeric(6, 2);

-- Section 23. Ownership is one route among five and has to beat the others;
-- section 34 requires the counter-case to name the best alternative.
alter table scores add column if not exists best_route scoring_route;
alter table scores add column if not exists second_best_route scoring_route;
alter table scores add column if not exists buy_beats_alternatives boolean;

-- Section 34's output contract: "Gates: Pass/fail/unknown for every gate with
-- action owner." Stored as written, so a historical recommendation can still
-- show why it was blocked after the gate definitions have moved on.
alter table scores add column if not exists gates jsonb;
alter table scores add column if not exists blocking_gates text[];

alter table scores drop constraint if exists scores_bounds_ordered;
alter table scores
  add constraint scores_bounds_ordered
  check (
    lower_bound is null
    or upper_bound is null
    or upper_bound >= lower_bound
  );

alter table scores drop constraint if exists scores_bounds_contain_score;
alter table scores
  add constraint scores_bounds_contain_score
  check (
    final_score is null
    or lower_bound is null
    or upper_bound is null
    or (final_score >= 0 and final_score <= 100)
  );

-- v0.2 tied `research_only` the score state to `research_only` the
-- recommendation. v0.3 has no such label: a target nobody could score is a
-- `watch`, and the reason lives in the gates and the coverage figure. The old
-- constraint would reject every v0.3 row that scored nothing.
alter table scores drop constraint if exists scores_research_only_recommendation;

alter table scores drop constraint if exists scores_unscored_has_no_score;
alter table scores
  add constraint scores_unscored_has_no_score
  check (
    score_state <> 'research_only'
    or (final_score is null and positive_normalized is null)
  );
