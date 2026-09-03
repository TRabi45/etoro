import { z } from "zod";
import { ALTERNATIVE_ROUTES, RECOMMENDATION_STATES, SCORABLE_PATHS } from "@/src/config/taxonomy";

/**
 * Runtime schemas for the deterministic scoring engine, and the TypeScript types
 * derived from them.
 *
 * Types are derived from the schemas rather than declared alongside them, so a
 * validated value and its compile-time type cannot drift apart.
 */

/** A dimension key is a stable identifier, not a display label. */
const dimensionKeySchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(_[a-z0-9]+)*$/, "dimension keys are lower_snake_case");

export const scoringDimensionSchema = z.object({
  key: dimensionKeySchema,
  label: z.string().min(1),
  weight: z.number().positive().max(100),
  /**
   * Alternative anchor wording for the regulated-access/customer-book subtype.
   * The subtype reinterprets what a dimension means; it never changes its
   * weight, which is why this is only a label.
   */
  regulatedAccessLabel: z.string().min(1).optional(),
});

export const scoringConfigurationSchema = z
  .object({
    version: z.string().min(1),
    path: z.enum(SCORABLE_PATHS),
    dimensions: z.array(scoringDimensionSchema).min(1),
    /** Dimension used for the Acquire strategic-fit floor. */
    strategicFitDimension: dimensionKeySchema,
    /** Dimension used for the Acquire acquisition-plausibility floor. */
    acquisitionPlausibilityDimension: dimensionKeySchema,
  })
  .superRefine((config, ctx) => {
    const keys = config.dimensions.map((dimension) => dimension.key);
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
    if (duplicates.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: `duplicate scoring dimensions: ${[...new Set(duplicates)].join(", ")}`,
      });
    }

    // Weights are a percentage split of one scorecard. Anything else means the
    // configuration was edited without recalculating the model.
    const total = config.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
    if (Math.abs(total - 100) > 1e-9) {
      ctx.addIssue({ code: "custom", message: `dimension weights must total 100, got ${total}` });
    }

    for (const named of [config.strategicFitDimension, config.acquisitionPlausibilityDimension]) {
      if (!keys.includes(named)) {
        ctx.addIssue({ code: "custom", message: `unknown dimension referenced: ${named}` });
      }
    }
  });

export const riskComponentDefinitionSchema = z.object({
  key: dimensionKeySchema,
  label: z.string().min(1),
  max: z.number().positive(),
});

export const evidenceBandSchema = z.object({
  minCoverage: z.number().min(0).max(1),
  maxCoverage: z.number().min(0).max(1),
  minPenalty: z.number().min(0),
  maxPenalty: z.number().min(0),
});

export const hardGateDefinitionSchema = z.object({
  key: dimensionKeySchema,
  label: z.string().min(1),
  /** A triggered permanent gate rules out Acquire. */
  permanent: z.boolean(),
  /** An unresolved critical gate forces Research only. */
  critical: z.boolean(),
});

export const scoringThresholdsSchema = z.object({
  researchOnlyCoverageFloor: z.number().min(0).max(1),
  acquireMinFinalScore: z.number().min(0).max(100),
  acquireMinStrategicFit: z.number().min(0).max(5),
  acquireMinCoverage: z.number().min(0).max(1),
  acquireMinAcquisitionPlausibility: z.number().min(0).max(5),
  monitorMinFinalScore: z.number().min(0).max(100),
});

export const scoringPolicySchema = z
  .object({
    riskComponents: z.array(riskComponentDefinitionSchema).min(1),
    riskPenaltyCap: z.number().positive(),
    evidenceBands: z.array(evidenceBandSchema).min(1),
    hardGates: z.array(hardGateDefinitionSchema).min(1),
    thresholds: scoringThresholdsSchema,
  })
  .superRefine((policy, ctx) => {
    const riskKeys = policy.riskComponents.map((component) => component.key);
    if (new Set(riskKeys).size !== riskKeys.length) {
      ctx.addIssue({ code: "custom", message: "duplicate risk components" });
    }

    const gateKeys = policy.hardGates.map((gate) => gate.key);
    if (new Set(gateKeys).size !== gateKeys.length) {
      ctx.addIssue({ code: "custom", message: "duplicate hard gates" });
    }

    for (const band of policy.evidenceBands) {
      if (band.maxCoverage < band.minCoverage) {
        ctx.addIssue({ code: "custom", message: "evidence band coverage range is inverted" });
      }
      if (band.maxPenalty < band.minPenalty) {
        ctx.addIssue({ code: "custom", message: "evidence band penalty range is inverted" });
      }
    }
  });

/**
 * A dimension is scored, unknown, or not applicable.
 *
 * `unknown` stays in the applicable-weight denominator but contributes nothing
 * to the numerator: a missing fact lowers confidence without being punished as
 * if it were a zero. `not_applicable` leaves both sides of the calculation and
 * therefore requires an explicit reason, so it cannot be used to quietly delete
 * an inconvenient dimension.
 */
export const dimensionInputSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("scored"),
    score: z.number().min(0).max(5),
    reason: z.string().optional(),
  }),
  z.object({
    status: z.literal("unknown"),
    reason: z.string().optional(),
  }),
  z.object({
    status: z.literal("not_applicable"),
    reason: z.string().min(1, "not_applicable requires an explicit reason"),
  }),
]);

export const riskComponentInputSchema = z.object({
  value: z.number().min(0),
  reason: z.string().optional(),
});

export const hardGateInputSchema = z.object({
  state: z.enum(["clear", "triggered", "unresolved"]),
  evidence: z.string().optional(),
  reason: z.string().optional(),
});

export const resolutionStatusSchema = z.object({
  /** Which legal entity is actually being acquired. */
  legalIdentity: z.enum(["resolved", "unresolved"]),
  /** Whether the target is already spoken for, in a process, or independent. */
  maStatus: z.enum(["resolved", "unresolved"]),
  /** Which permissions travel with the transaction. */
  regulatoryPerimeter: z.enum(["resolved", "unresolved"]),
});

export const routeScoreSchema = z.object({
  score: z.number().min(0).max(5),
  reason: z.string().optional(),
});

/**
 * How acquisition compares with the alternatives. Acquire requires control to
 * beat every other route outright, which is what stops a high fit score from
 * being read as an instruction to buy.
 */
export const routeAssessmentSchema = z.object({
  acquire: routeScoreSchema,
  build: routeScoreSchema,
  partner: routeScoreSchema,
  invest: routeScoreSchema,
  monitor: routeScoreSchema,
});

export const scoringInputSchema = z.object({
  path: z.enum(SCORABLE_PATHS),
  /**
   * The regulated-access/customer-book subtype. It re-anchors the Tuck-in
   * dimensions and never applies to a Platform scorecard.
   */
  subtype: z.literal("regulated_access").nullish(),
  dimensions: z.record(z.string(), dimensionInputSchema),
  risk: z.record(z.string(), riskComponentInputSchema),
  /** Supplied, then validated against the band the coverage actually earns. */
  evidencePenalty: z.number().min(0),
  hardGates: z.record(z.string(), hardGateInputSchema),
  resolution: resolutionStatusSchema,
  routeAssessment: routeAssessmentSchema,
  /** Explanatory only. Excluded from the input hash. */
  notes: z.string().optional(),
});

export const scoreBreakdownEntrySchema = z.object({
  key: z.string(),
  label: z.string(),
  weight: z.number(),
  status: z.enum(["scored", "unknown", "not_applicable"]),
  score: z.number().nullable(),
  weightedContribution: z.number().nullable(),
});

export const scoringResultSchema = z.object({
  modelVersion: z.string(),
  path: z.enum(SCORABLE_PATHS),
  subtype: z.literal("regulated_access").nullable(),
  positiveNormalized: z.number().nullable(),
  weightedCoverage: z.number(),
  riskPenalty: z.number(),
  evidencePenalty: z.number(),
  finalScore: z.number().nullable(),
  scoreState: z.enum(["scored", "research_only"]),
  recommendation: z.enum(RECOMMENDATION_STATES),
  acquireEligible: z.boolean(),
  /** Human-readable list of every Acquire condition that failed. */
  acquireBlockers: z.array(z.string()),
  triggeredPermanentGates: z.array(z.string()),
  unresolvedCriticalGates: z.array(z.string()),
  breakdown: z.array(scoreBreakdownEntrySchema),
  inputHash: z.string(),
});

export type ScoringDimension = z.infer<typeof scoringDimensionSchema>;
export type ScoringConfiguration = z.input<typeof scoringConfigurationSchema>;
export type ScoringPolicy = z.input<typeof scoringPolicySchema>;
export type RiskComponentDefinition = z.infer<typeof riskComponentDefinitionSchema>;
export type EvidenceBand = z.infer<typeof evidenceBandSchema>;
export type HardGateDefinition = z.infer<typeof hardGateDefinitionSchema>;
export type ScoringThresholds = z.infer<typeof scoringThresholdsSchema>;
export type DimensionInput = z.infer<typeof dimensionInputSchema>;
export type RiskComponentInput = z.infer<typeof riskComponentInputSchema>;
export type HardGateInput = z.infer<typeof hardGateInputSchema>;
export type ResolutionStatus = z.infer<typeof resolutionStatusSchema>;
export type RouteAssessment = z.infer<typeof routeAssessmentSchema>;
export type ScoringInput = z.infer<typeof scoringInputSchema>;
export type ScoreBreakdownEntry = z.infer<typeof scoreBreakdownEntrySchema>;
export type ScoringResult = z.infer<typeof scoringResultSchema>;
export type AlternativeRouteName = (typeof ALTERNATIVE_ROUTES)[number];
