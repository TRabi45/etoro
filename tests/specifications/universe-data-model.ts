import { z } from "zod";

/**
 * Test-only contract for Milestone 19A.1.
 *
 * Production code must not import this file. Phase 19A.2 will implement the
 * behavior independently, then these schemas will validate what its database
 * boundary returns. Keeping the contract here lets the RED tests compile
 * before generated database types or repositories know about the new model.
 */

export const COMPANY_STAGES = [
  "pre_seed",
  "seed",
  "series_a",
  "series_b",
  "series_c_plus",
  "growth",
  "late_stage",
  "public",
  "bootstrapped",
  "unknown",
] as const;

export const companyExternalIdContractSchema = z.object({
  companyId: z.uuid(),
  provider: z.string().min(1),
  externalId: z.string().min(1),
});

export const companyDiscoveryObservationContractSchema = z.object({
  companyId: z.uuid().nullable(),
  provider: z.string().min(1),
  observedName: z.string().min(1),
  observedDomain: z.string().min(1).nullable(),
  observedGeography: z.string().min(1).nullable(),
  sourceRecordId: z.string().min(1).nullable(),
  sourceUrl: z.url().nullable(),
  // `offset: true` rather than Zod's default, which accepts only a `Z` suffix.
  // A Postgres `timestamptz` renders as `2026-09-07T18:00:00+00:00` through
  // PostgREST and there is no output mode that emits `Z`, so the default form
  // of this rule could not be satisfied by any real temporal column - only by
  // storing timestamps as text, which would turn the `last_seen_at >=
  // first_seen_at` constraint into a string comparison. This was corrected in
  // 19A.2 with explicit approval, after the RED phase never reached the line:
  // test G failed at the insert with PGRST205 long before it parsed anything.
  // The rule still rejects nulls, non-strings, dates without a time and any
  // malformed value; it only admits the UTC offset spelling alongside `Z`.
  firstSeenAt: z.iso.datetime({ offset: true }),
  lastSeenAt: z.iso.datetime({ offset: true }),
  rawMetadata: z.unknown().nullable(),
});

export type CompanyStage = (typeof COMPANY_STAGES)[number];
