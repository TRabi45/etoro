import { z } from "zod";
import { ENABLING_LAYERS, STRATEGIC_THEMES } from "@/src/config/taxonomy";
import {
  companyAliasSchema,
  domainSchema,
  searchLeadSchema,
  slugSchema,
} from "@/src/validation/identity";

/**
 * The bootstrap record: the only shape allowed into the database as seed data.
 *
 * Bootstrap exists to give the first monitoring run somewhere to start - who a
 * company is, what it is called, where its site is, roughly which theme it sits
 * in, and which pages to go and read. It is emphatically not research output.
 *
 * The schema is strict, so a well-meaning future edit that adds a score, a
 * funding amount or a paragraph of profile prose fails validation instead of
 * quietly presenting stage-two research as though the agent had discovered it.
 * The same rule is enforced a second time in the database, by a CHECK
 * constraint on `companies`, because this is the invariant the whole
 * bootstrap/benchmark/runtime separation rests on.
 */

/**
 * Field names that must never appear on a bootstrap record. The strict schema
 * already rejects unknown keys; this list exists so the test suite can state the
 * prohibition explicitly rather than relying on that side effect.
 */
export const PROHIBITED_BOOTSTRAP_FIELDS = [
  "description",
  "profile",
  "summary",
  "score",
  "scores",
  "finalScore",
  "positiveScore",
  "coverage",
  "recommendation",
  "action",
  "kpis",
  "metrics",
  "funding",
  "fundingAmount",
  "valuation",
  "licenses",
  "regulator",
  "risk",
  "risks",
  "riskPenalty",
  "evidencePenalty",
  "confidence",
  "ownership",
  "owner",
  "maState",
  "maConclusion",
  "path",
  "whyNow",
  "counterThesis",
  "assessment",
  "fundamentals",
] as const;

export const bootstrapCompanySchema = z.strictObject({
  canonicalName: z.string().min(1),
  slug: slugSchema,
  /**
   * Null is a real answer. Hypernative's parent perimeter is not established in
   * public evidence, and inventing an entity name would be worse than admitting
   * that.
   */
  legalEntityName: z.string().min(1).nullable(),
  primaryDomain: domainSchema,
  aliases: z.array(companyAliasSchema),
  themeTags: z.array(z.enum(STRATEGIC_THEMES)).min(1),
  enablingLayers: z.array(z.enum(ENABLING_LAYERS)).min(1),
  searchLeads: z.array(searchLeadSchema).min(1),
});

export const bootstrapUniverseSchema = z.array(bootstrapCompanySchema);

export type BootstrapCompany = z.infer<typeof bootstrapCompanySchema>;
