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
  firstSeenAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  rawMetadata: z.unknown().nullable(),
});

export type CompanyStage = (typeof COMPANY_STAGES)[number];
