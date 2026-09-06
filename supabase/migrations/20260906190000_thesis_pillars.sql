-- Closes the thesis-conformance gap `tests/unit/thesis-conformance.test.ts`
-- records as `it.fails`: the taxonomy's four strategic themes did not match
-- section 3's four pillars in eToro's own language (Trading, Investing, Wealth
-- Management, Neo-Banking). `on_chain_infrastructure` had been promoted to a
-- theme in its own right, and "Investing" was missing entirely - which changes
-- what strategic fit, the heaviest dimension in the model at 25 points, is
-- actually measuring.
--
-- Three of the four old values are the same concept under eToro's own name and
-- rename directly. The fourth, `on_chain_infrastructure`, has no successor:
-- section 3 is explicit that blockchain-based finance is a cross-cutting
-- enabler, not a pillar, so a company tagged only with it is remapped to
-- `trading` - both companies actually carrying this tag today (Dfns, wallet
-- and key-management infrastructure; Hypernative, on-chain threat detection)
-- exist to serve trading and custody activity, not a pillar of their own.
-- `strategic_theme[]` still requires at least one entry on every bootstrap
-- row (`src/validation/bootstrap.ts`'s `.min(1)`), so an empty result here
-- would fail validation, not read as an honest "Unknown". `investing` starts
-- with no company tagged under it: nothing already in the database was
-- verified as fitting it, and a migration is not the place to decide that a
-- portfolio-tracking bootstrap identity is or is not an Investing-pillar
-- company.
--
-- Postgres cannot drop or rename an enum value in the same step as reassigning
-- the rows that use it, so this rebuilds the type: rename the old one aside,
-- create the real one under the original name, remap the column through the
-- old type's text labels, then drop what is left of the old type.
--
-- The remap itself has to go through a function rather than an inline
-- subquery: `ALTER COLUMN ... TYPE ... USING` rejects a subquery in the
-- transform expression (SQLSTATE 0A000), even one that only unnests the row's
-- own array. A plain function call is not a subquery, so the mapping lives in
-- one, used once here and dropped immediately after.
alter type strategic_theme rename to strategic_theme_old;

create type strategic_theme as enum ('trading', 'investing', 'wealth_management', 'neo_banking');

create function remap_strategic_themes(old_tags strategic_theme_old[])
returns strategic_theme[]
language sql
immutable
as $$
  select coalesce(array_agg(mapped.value), '{}'::strategic_theme[])
  from unnest(old_tags) as old(value)
  cross join lateral (
    select case old.value::text
      when 'active_trading' then 'trading'
      when 'wealth_long_term_savings' then 'wealth_management'
      when 'money_payments' then 'neo_banking'
      when 'on_chain_infrastructure' then 'trading'
      -- Anything else unrecognised is dropped rather than guessed at.
      else null
    end::strategic_theme as value
  ) mapped
  where mapped.value is not null;
$$;

drop index if exists companies_theme_tags_idx;

-- The existing default is itself typed strategic_theme_old[] and cannot be
-- cast automatically, so it has to go before the column type changes and come
-- back, as its own '{}', after.
alter table companies alter column theme_tags drop default;

alter table companies
  alter column theme_tags type strategic_theme[]
  using remap_strategic_themes(theme_tags);

alter table companies alter column theme_tags set default '{}';

create index if not exists companies_theme_tags_idx on companies using gin (theme_tags);

-- The mapping function exists only to satisfy the USING clause above, and it
-- references the old type by name, so it goes before that type is dropped.
drop function remap_strategic_themes(strategic_theme_old[]);

drop type strategic_theme_old;
