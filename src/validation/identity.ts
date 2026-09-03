import { z } from "zod";
import {
  ALIAS_KINDS,
  ENABLING_LAYERS,
  LIFECYCLE_STATUSES,
  MA_STATES,
  RECORD_ORIGINS,
  STRATEGIC_THEMES,
  TARGET_PATHS,
} from "@/src/config/taxonomy";

/**
 * Company identity schemas.
 *
 * Identity is where this system is most likely to produce a confidently wrong
 * answer, so the rules are strict: a brand name and an exact legal entity are
 * separate fields, and nothing in this module ever infers one from the other.
 * The assignment brief names `B2C2`, but the transaction eToro actually
 * completed was with `Bit2C` - a different company. Similar strings are not
 * evidence of the same entity.
 */

/** Lower-case, hyphen-separated, URL-safe. Stable across renames of the brand. */
export const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug must be lower-case and hyphen-separated");

export const domainSchema = z
  .string()
  .min(3)
  .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "domain must be a bare host name, without scheme or path");

export const companyIdentitySchema = z.object({
  canonicalName: z.string().min(1),
  slug: slugSchema,
  /**
   * The exact registered entity, when it is known. Null means "not established
   * yet", never "same as the brand".
   */
  legalEntityName: z.string().min(1).nullable(),
  primaryDomain: domainSchema.nullable(),
  recordOrigin: z.enum(RECORD_ORIGINS),
  lifecycleStatus: z.enum(LIFECYCLE_STATUSES),
  themeTags: z.array(z.enum(STRATEGIC_THEMES)),
  enablingLayers: z.array(z.enum(ENABLING_LAYERS)),
  path: z.enum(TARGET_PATHS).nullable(),
  maState: z.enum(MA_STATES).nullable(),
});

export const companyAliasSchema = z.object({
  alias: z.string().min(1),
  aliasKind: z.enum(ALIAS_KINDS),
  /** True only for the exact registered name of a real legal entity. */
  isExactLegalEntity: z.boolean(),
  notes: z.string().optional(),
});

/**
 * A search lead is an instruction for research - "check the FCA register",
 * "look for the Series B" - and never a finding. Keeping leads as labelled
 * rows, rather than sentences inside a profile, is what lets the first
 * monitoring run act on them.
 */
export const searchLeadSchema = z.object({
  label: z.string().min(1),
  query: z.string().min(1).optional(),
});

export type CompanyIdentity = z.infer<typeof companyIdentitySchema>;
export type CompanyAlias = z.infer<typeof companyAliasSchema>;
export type SearchLead = z.infer<typeof searchLeadSchema>;

/**
 * Normalises a name for comparison: case, punctuation and common corporate
 * suffixes are removed so that "DFNS SAS" and "Dfns" can be recognised as the
 * same identity.
 *
 * This is intentionally conservative. It removes noise; it never performs fuzzy
 * or edit-distance matching, because that is exactly how `B2C2` and `Bit2C`
 * would be merged.
 */
export function normalizeEntityName(name: string): string {
  return (
    name
      .toLowerCase()
      // NFKD splits accented characters apart; the final strip below then removes
      // the leftover combining marks along with all other punctuation.
      .normalize("NFKD")
      .replace(
        /\b(inc|llc|ltd|limited|plc|gmbh|sas|sa|spa|spq|bv|nv|ag|corp|corporation|co|company|group|holdings|technologies|technology)\b/g,
        " ",
      )
      .replace(/[^a-z0-9]+/g, "")
      .trim()
  );
}

/**
 * Whether two names refer to the same legal identity.
 *
 * Equality only, after normalisation. `B2C2` and `Bit2C` normalise to `b2c2`
 * and `bit2c`, which are not equal - so this returns false, which is the whole
 * point of the function.
 */
export function isSameEntityName(left: string, right: string): boolean {
  const normalizedLeft = normalizeEntityName(left);
  const normalizedRight = normalizeEntityName(right);
  if (normalizedLeft === "" || normalizedRight === "") {
    return false;
  }
  return normalizedLeft === normalizedRight;
}
