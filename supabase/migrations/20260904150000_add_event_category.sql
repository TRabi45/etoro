-- ---------------------------------------------------------------------------
-- Two-level event taxonomy: a coarse category, plus an optional precise subtype.
--
-- `event_type` already held 27 specific values, drawn from the stage-two
-- research. That vocabulary is right for analysis and wrong for extraction: a
-- model reading "the regulator has taken action against the firm" cannot
-- honestly choose between `enforcement`, `license_suspension` and
-- `license_withdrawal`, and a guess stored in a controlled field is worse than
-- an admitted gap, because nothing downstream can tell the two apart.
--
-- So extraction now writes a category it can actually justify, and records the
-- subtype only when the source establishes it:
--
--   event_category  seven values, always present  -- what kind of thing happened
--   event_type      27 values, nullable           -- exactly which kind, if known
--
-- The pairing is enforced here rather than in application code. A row claiming
-- to be a funding event whose subtype is a shutdown is not a bug to be caught in
-- review; it is a state the database refuses to hold.
--
-- No backfill is needed: the monitoring pipeline that writes events is being
-- built in this milestone, so the table is empty.
-- ---------------------------------------------------------------------------

do $$ begin
  create type event_category as enum (
    'acquisition', 'funding', 'product_launch', 'regulatory', 'executive', 'distress', 'other'
  );
exception when duplicate_object then null; end $$;

alter table events
  add column if not exists event_category event_category;

-- Existing rows, if any, are classified from their subtype before the column is
-- made mandatory.
update events set event_category = case
  when event_type in ('acquisition', 'divestiture', 'strategic_review', 'carve_out',
                      'minority_investment', 'change_of_control') then 'acquisition'
  when event_type in ('funding', 'down_round') then 'funding'
  when event_type in ('product_launch', 'kpi_change') then 'product_launch'
  when event_type in ('license_grant', 'license_application', 'license_variation',
                      'license_suspension', 'license_withdrawal', 'enforcement') then 'regulatory'
  when event_type in ('founder_exit') then 'executive'
  when event_type in ('debt_distress', 'layoffs', 'shutdown') then 'distress'
  else 'other'
end::event_category
where event_category is null;

alter table events
  alter column event_category set not null;

-- The subtype becomes optional. `unknown` is a first-class state everywhere else
-- in this system and there is no reason for it to be forbidden here.
alter table events
  alter column event_type drop not null;

alter table events
  drop constraint if exists events_subtype_matches_category;

alter table events
  add constraint events_subtype_matches_category check (
    event_type is null
    or (event_category = 'acquisition' and event_type in (
      'acquisition', 'divestiture', 'strategic_review', 'carve_out',
      'minority_investment', 'change_of_control'))
    or (event_category = 'funding' and event_type in ('funding', 'down_round'))
    or (event_category = 'product_launch' and event_type in ('product_launch', 'kpi_change'))
    or (event_category = 'regulatory' and event_type in (
      'license_grant', 'license_application', 'license_variation',
      'license_suspension', 'license_withdrawal', 'enforcement'))
    or (event_category = 'executive' and event_type in ('founder_exit'))
    or (event_category = 'distress' and event_type in ('debt_distress', 'layoffs', 'shutdown'))
    -- The Extractor's vocabulary has no incident category, so incidents keep
    -- their meaning in the subtype and sit under `other`.
    or (event_category = 'other' and event_type in (
      'security_incident', 'custody_incident', 'privacy_incident',
      'aml_incident', 'fraud_incident', 'conduct_incident', 'other'))
  );

create index if not exists events_event_category_idx on events (event_category);

-- ---------------------------------------------------------------------------
-- Deduplication key for the monitoring pipeline.
--
-- The same article reached through two URLs is one source, which `url_normalized`
-- already handles. The same *event* reported by two articles is one event, and
-- nothing handled that. Without this an event re-reported the next day would be
-- written twice and the "what changed?" feed would repeat itself.
-- ---------------------------------------------------------------------------

alter table events
  add column if not exists dedupe_key text;

-- Not a partial index. `... where dedupe_key is not null` looks tidier and is
-- unusable as an ON CONFLICT target, so every upsert against it fails with
-- "no unique or exclusion constraint matching the ON CONFLICT specification".
-- A plain unique index works because Postgres already treats NULLs as distinct,
-- so rows without a key never collide with each other.
create unique index if not exists events_dedupe_key_idx on events (dedupe_key);
