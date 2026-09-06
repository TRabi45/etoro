-- Continuation of 20260906170000_entity_role_and_screening.sql.
--
-- That migration added the `screened_out` and `precedent` lifecycle_status
-- values but could not use them yet - a new enum label is not visible to a
-- CHECK constraint until the transaction that added it has committed. This
-- migration runs afterward, once they have.

-- Why the screen reached its verdict, in the screen's own vocabulary. Stored
-- rather than recomputed so a reader can see why a company left the universe
-- even after the rule that removed it has changed.
alter table companies add column if not exists screen_reason text;
alter table companies add column if not exists screened_at timestamptz;

-- A screened row has to say why. Without this the state is an opinion.
alter table companies drop constraint if exists companies_screened_rows_have_a_reason;
alter table companies
  add constraint companies_screened_rows_have_a_reason
  check (
    lifecycle_status not in ('screened_out', 'precedent')
    or (screen_reason is not null and screened_at is not null)
  );

-- Section 30: "Never merge on name alone; B2C2 versus Bit2C is a required test."
-- The inverse failure is just as real - Navi and Navi Finserv are one target and
-- two rows. `parent_company_id` already exists to express it; this index makes
-- the lookup cheap enough to run during the screen.
create index if not exists companies_parent_company_id_idx
  on companies (parent_company_id) where parent_company_id is not null;
