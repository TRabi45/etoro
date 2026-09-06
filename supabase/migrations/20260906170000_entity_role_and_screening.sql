-- Section 32's early screen, and the identity question it depends on.
--
-- The monitoring pipeline creates a company row for every entity an article
-- names that looks like financial services. That produced Apple Pay (a product
-- of Apple Inc.), Andreessen Horowitz (an investor, not a target), Navi Finserv
-- (a subsidiary already tracked as its parent) and Visa (a real company that
-- eToro is not going to buy) - all presented identically to a genuine candidate.
--
-- Section 32 orders the screen before any of that: "First remove duplicates and
-- already-acquired entities. Then test thesis boundaries, customer type, real
-- operations, countries, ownership, permissions, scale and transaction
-- plausibility. Do not perform full scoring when identity or basic fit is
-- unresolved."
--
-- Two different failures are being fixed here, and they need different answers.
--
-- Apple Pay and Andreessen Horowitz are not targets because they are not the
-- kind of thing that can be a target. That is an identity question, and
-- `entity_role` is the answer: a brand is not a company, and an investor that
-- appears in a funding announcement is a party to the story rather than its
-- subject.
--
-- Visa is a different matter. Section 19 is explicit that "a very large, public
-- or competitor-owned company is not excluded by label alone" - Plus500 bought
-- an Indian broker, Robinhood bought Bitstamp. Size does not disqualify. What
-- section 28's deal gate requires is that a company which is already acquired,
-- not for sale, or structurally impossible becomes a "precedent or watch, not a
-- target recommendation". So Visa is not deleted and its news is not discarded;
-- it stops being presented as something to buy. The lifecycle values that carry
-- that verdict are added at the end of this migration; the constraint that
-- depends on them lives in the next one (see the note down there).

-- What kind of thing this row describes.
--
-- `unknown` is the honest default for a row created from a single article, and
-- it is not the same as `operating_company`. A row nobody has classified must
-- not be screened in by omission.
do $$
begin
  create type entity_role as enum (
    'operating_company',
    'product_or_brand',
    'investor',
    'industry_body',
    'government_or_regulator',
    'individual',
    'unknown'
  );
exception
  when duplicate_object then null;
end
$$;

alter table companies
  add column if not exists entity_role entity_role not null default 'unknown';

create index if not exists companies_entity_role_idx on companies (entity_role);

-- Two new lifecycle states, because "rejected" says the wrong thing about both
-- of the cases this migration exists for.
--
--   screened_out - not a target entity at all. A product, an investor, a
--                  duplicate of a row that already exists.
--   precedent    - a real operating company that is not an available target.
--                  Its events still matter: section 20 treats a competitor deal
--                  as "a trigger, not a score", and a precedent that disappears
--                  from the database takes its signal with it.
--
-- Postgres will not let a transaction reference an enum value it just added
-- with `ALTER TYPE ... ADD VALUE` (SQLSTATE 55P04, "unsafe use of new value") -
-- the label has to be committed first. Each migration file is one transaction,
-- so the CHECK constraint that reads these two values is deferred to the next
-- migration rather than added here.
alter type lifecycle_status add value if not exists 'screened_out';
alter type lifecycle_status add value if not exists 'precedent';
