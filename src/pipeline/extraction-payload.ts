import { z } from "zod";
import {
  CLAIM_KINDS,
  CLAIM_SOURCE_RELATIONS,
  CONFIDENCE_LEVELS,
  FUNDAMENTAL_ARCHETYPES,
  SOURCE_TRUST_TIERS,
  SOURCE_TYPES,
  TARGET_PATHS,
  VALUE_STATUSES,
  VERIFICATION_STATUSES,
} from "@/src/config/taxonomy";
import { scoringInputSchema } from "@/src/domain/scoring/types";

/**
 * The extraction payload contract.
 *
 * This is the shape the pipeline accepts, whatever produced it. In this
 * milestone it is satisfied by a hand-written stub; from Milestone 3 it will be
 * satisfied by the Claude provider adapter. Defining it now, and validating
 * every payload against it before a single row is written, is what stops
 * malformed model output from reaching the database later - the LLM will have to
 * meet a contract that already exists rather than one written around whatever it
 * happens to emit.
 *
 * Sources and claims are addressed by caller-chosen string keys rather than
 * database ids, because an extractor has no way to know the ids. The pipeline
 * resolves keys to real rows as it inserts them.
 */

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected an ISO date (YYYY-MM-DD)");
const payloadKeySchema = z.string().min(1).max(120);

export const payloadSourceSchema = z.object({
  key: payloadKeySchema,
  url: z.string().regex(/^https?:\/\//, "sources must be http(s)"),
  urlNormalized: z.string().min(1),
  title: z.string().nullable(),
  publisher: z.string().nullable(),
  sourceType: z.enum(SOURCE_TYPES),
  trustTier: z.enum(SOURCE_TRUST_TIERS),
  publishedAt: isoDateSchema.nullable(),
});

export const payloadClaimSourceSchema = z.object({
  sourceKey: payloadKeySchema,
  relation: z.enum(CLAIM_SOURCE_RELATIONS),
  excerpt: z.string().nullable(),
});

export const payloadClaimSchema = z
  .object({
    key: payloadKeySchema,
    subject: z.string().min(1),
    predicate: z.string().min(1),
    valueText: z.string().nullable().optional(),
    valueNumeric: z.number().nullable().optional(),
    valueUnit: z.string().nullable().optional(),
    valueCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable()
      .optional(),
    valueStatus: z.enum(VALUE_STATUSES),
    asOfDate: isoDateSchema.nullable(),
    claimKind: z.enum(CLAIM_KINDS),
    aiConfidence: z.enum(CONFIDENCE_LEVELS).nullable().optional(),
    verificationStatus: z.enum(VERIFICATION_STATUSES).optional(),
    /** Claims that disagree share a group key; neither replaces the other. */
    conflictGroup: payloadKeySchema.nullable().optional(),
    unknownReason: z.string().nullable().optional(),
    /** Enforced here as well as at the repository: no fact without a source. */
    sources: z.array(payloadClaimSourceSchema).min(1, "every claim needs at least one source"),
  })
  .superRefine((claim, ctx) => {
    if (
      (claim.valueStatus === "unknown" || claim.valueStatus === "not_applicable") &&
      claim.valueNumeric !== null &&
      claim.valueNumeric !== undefined
    ) {
      ctx.addIssue({
        code: "custom",
        message: `a ${claim.valueStatus} claim must not carry a number`,
      });
    }
    if (claim.claimKind === "analysis" && claim.verificationStatus === "verified") {
      ctx.addIssue({ code: "custom", message: "analysis can never be marked verified" });
    }
  });

export const payloadMetricSchema = z.object({
  metricType: z.string().min(1),
  valueNumeric: z.number().nullable(),
  valueUnit: z.string().nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable()
    .optional(),
  valueStatus: z.enum(VALUE_STATUSES),
  periodStart: isoDateSchema.nullable().optional(),
  periodEnd: isoDateSchema.nullable().optional(),
  asOfDate: isoDateSchema.nullable(),
  /** The claim this observation came from, so the metric inherits its sources. */
  claimKey: payloadKeySchema.nullable(),
  confidence: z.enum(CONFIDENCE_LEVELS).nullable().optional(),
});

export const payloadFundamentalsSchema = z.object({
  archetype: z.enum(FUNDAMENTAL_ARCHETYPES),
  revenueQuality: z.string().nullable(),
  growthAssessment: z.string().nullable(),
  marginAssessment: z.string().nullable(),
  burnRunway: z.string().nullable(),
  concentration: z.string().nullable(),
  derivedRatios: z.record(z.string(), z.unknown()).optional(),
  unknowns: z.array(z.string()),
  claimLinks: z.array(z.object({ claimKey: payloadKeySchema, field: z.string().min(1) })),
});

export const payloadAssessmentSchema = z.object({
  thesisVersion: z.string().min(1),
  path: z.enum(TARGET_PATHS),
  strategicFitSummary: z.string().nullable(),
  gapClosed: z.string().nullable(),
  whyNow: z.string().nullable(),
  synergies: z.string().nullable(),
  risks: z.string().nullable(),
  counterThesis: z.string().nullable(),
  unknowns: z.array(z.string()),
  claimLinks: z.array(z.object({ claimKey: payloadKeySchema, role: z.string().min(1) })),
});

export const extractionPayloadSchema = z
  .object({
    companySlug: z.string().min(1),
    /**
     * Marks payloads that did not come from real retrieval. The pipeline
     * propagates it so a stub run can never be mistaken for agent research.
     */
    provenance: z.enum(["stub", "pipeline"]),
    sources: z.array(payloadSourceSchema).min(1),
    claims: z.array(payloadClaimSchema).min(1),
    metrics: z.array(payloadMetricSchema),
    fundamentals: payloadFundamentalsSchema,
    assessment: payloadAssessmentSchema,
    /** Structured inputs for the deterministic engine. Never a score itself. */
    scoring: scoringInputSchema,
  })
  .superRefine((payload, ctx) => {
    const sourceKeys = new Set(payload.sources.map((source) => source.key));
    const claimKeys = new Set(payload.claims.map((claim) => claim.key));

    if (sourceKeys.size !== payload.sources.length) {
      ctx.addIssue({ code: "custom", message: "duplicate source keys" });
    }
    if (claimKeys.size !== payload.claims.length) {
      ctx.addIssue({ code: "custom", message: "duplicate claim keys" });
    }

    // Every reference has to resolve, or the pipeline would write a dangling
    // link and the UI would render a fact with a citation pointing at nothing.
    for (const claim of payload.claims) {
      for (const link of claim.sources) {
        if (!sourceKeys.has(link.sourceKey)) {
          ctx.addIssue({
            code: "custom",
            message: `claim "${claim.key}" cites unknown source "${link.sourceKey}"`,
          });
        }
      }
    }
    for (const metric of payload.metrics) {
      if (metric.claimKey !== null && !claimKeys.has(metric.claimKey)) {
        ctx.addIssue({
          code: "custom",
          message: `metric "${metric.metricType}" references unknown claim "${metric.claimKey}"`,
        });
      }
    }
    for (const link of payload.fundamentals.claimLinks) {
      if (!claimKeys.has(link.claimKey)) {
        ctx.addIssue({
          code: "custom",
          message: `fundamentals field "${link.field}" references unknown claim "${link.claimKey}"`,
        });
      }
    }
    for (const link of payload.assessment.claimLinks) {
      if (!claimKeys.has(link.claimKey)) {
        ctx.addIssue({
          code: "custom",
          message: `assessment role "${link.role}" references unknown claim "${link.claimKey}"`,
        });
      }
    }
  });

export type PayloadSource = z.infer<typeof payloadSourceSchema>;
export type PayloadClaim = z.infer<typeof payloadClaimSchema>;
export type PayloadMetric = z.infer<typeof payloadMetricSchema>;
export type ExtractionPayload = z.infer<typeof extractionPayloadSchema>;
