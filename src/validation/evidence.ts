import { z } from "zod";
import {
  CLAIM_KINDS,
  CLAIM_SOURCE_RELATIONS,
  CONFIDENCE_LEVELS,
  DEAL_STATUSES,
  SOURCE_TRUST_TIERS,
  SOURCE_TYPES,
  VALUE_STATUSES,
  VERIFICATION_STATUSES,
} from "@/src/config/taxonomy";

/**
 * Evidence schemas: sources, claims, the link between them, and transaction
 * status.
 *
 * Three rules shape everything here:
 *
 *   1. Dates are never collapsed. When a source was published, when a fact was
 *      true, when an event happened, and when we looked are four facts.
 *   2. Source trust and extraction confidence are different properties, stored
 *      on different records. A primary regulator page read badly is not a
 *      high-confidence claim.
 *   3. A missing number stays missing. `unknown` and `not_applicable` both mean
 *      "no value", and the schema refuses to let either carry a figure.
 */

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected an ISO date (YYYY-MM-DD)");

export const sourceSchema = z.object({
  url: z.string().regex(/^https?:\/\//, "sources must be fetched over HTTP(S)"),
  /** Deduplication key: the same page reached two ways is one source. */
  urlNormalized: z.string().min(1),
  title: z.string().nullable(),
  publisher: z.string().nullable(),
  sourceType: z.enum(SOURCE_TYPES),
  /** A property of the publisher, not of the extraction. */
  trustTier: z.enum(SOURCE_TRUST_TIERS),
  publishedAt: isoDateSchema.nullable(),
  accessedAt: z.string().min(1),
  contentHash: z.string().nullable(),
});

export const citationSchema = z.object({
  sourceId: z.uuid(),
  url: z.string().regex(/^https?:\/\//),
  title: z.string().nullable(),
  publisher: z.string().nullable(),
  /** Publication date and fact date are deliberately both present. */
  publishedAt: isoDateSchema.nullable(),
  asOfDate: isoDateSchema.nullable(),
  accessedAt: z.string().min(1),
  excerpt: z.string().nullable(),
});

export const claimSchema = z
  .object({
    subject: z.string().min(1),
    predicate: z.string().min(1),
    valueText: z.string().nullable(),
    valueNumeric: z.number().nullable(),
    valueUnit: z.string().nullable(),
    valueCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    valueStatus: z.enum(VALUE_STATUSES),
    /** The date the fact is true for. Not the publication date. */
    asOfDate: isoDateSchema.nullable(),
    claimKind: z.enum(CLAIM_KINDS),
    /** Confidence of the extraction. Source trust lives on the source. */
    aiConfidence: z.enum(CONFIDENCE_LEVELS).nullable(),
    verificationStatus: z.enum(VERIFICATION_STATUSES),
    /** Contradictory claims share a group instead of overwriting each other. */
    conflictGroup: z.uuid().nullable(),
    unknownReason: z.string().nullable(),
  })
  .superRefine((claim, ctx) => {
    // Analysis is judgement. It cannot be promoted to a verified fact, however
    // well argued it is.
    if (claim.claimKind === "analysis" && claim.verificationStatus === "verified") {
      ctx.addIssue({ code: "custom", message: "analysis can never be marked verified" });
    }
    if (
      (claim.valueStatus === "unknown" || claim.valueStatus === "not_applicable") &&
      claim.valueNumeric !== null
    ) {
      ctx.addIssue({
        code: "custom",
        message: `a ${claim.valueStatus} value must not carry a number`,
      });
    }
    if (
      (claim.valueStatus === "disclosed" || claim.valueStatus === "estimated") &&
      claim.valueNumeric === null &&
      claim.valueText === null
    ) {
      ctx.addIssue({
        code: "custom",
        message: "a disclosed or estimated value needs a numeric or textual value",
      });
    }
  });

export const claimSourceSchema = z.object({
  claimId: z.uuid(),
  sourceId: z.uuid(),
  /** Support and contradiction are both first-class. */
  relation: z.enum(CLAIM_SOURCE_RELATIONS),
  excerpt: z.string().nullable(),
});

/**
 * Transaction status.
 *
 * `expectedCloseDate` and `closedDate` are separate fields and the refinement
 * below refuses to call a transaction closed without an actual close date. eToro
 * announced TradeZero in August 2026 with an expected close in H1 2027: that is
 * a pending transaction, and no passage of time turns it into a completed one.
 */
export const transactionStatusSchema = z
  .object({
    status: z.enum(DEAL_STATUSES),
    announcedDate: isoDateSchema.nullable(),
    signedDate: isoDateSchema.nullable(),
    expectedCloseDate: isoDateSchema.nullable(),
    closedDate: isoDateSchema.nullable(),
    terminatedDate: isoDateSchema.nullable(),
  })
  .superRefine((transaction, ctx) => {
    if (
      (transaction.status === "closed" || transaction.status === "integrated") &&
      transaction.closedDate === null
    ) {
      ctx.addIssue({
        code: "custom",
        message: "a closed transaction requires an actual close date, not an expected one",
      });
    }
    if (transaction.status === "terminated" && transaction.terminatedDate === null) {
      ctx.addIssue({ code: "custom", message: "a terminated transaction requires a date" });
    }
  });

export type Source = z.infer<typeof sourceSchema>;
export type Citation = z.infer<typeof citationSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type ClaimSource = z.infer<typeof claimSourceSchema>;
export type TransactionStatus = z.infer<typeof transactionStatusSchema>;
