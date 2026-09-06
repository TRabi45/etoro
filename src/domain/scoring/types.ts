import { z } from "zod";

/**
 * Runtime schemas for the deterministic scoring engine, and the TypeScript types
 * derived from them.
 *
 * Types are derived from the schemas rather than declared alongside them, so a
 * validated value and its compile-time type cannot drift apart.
 *
 * The shapes here follow `docs/ACQUISITION_THESIS.md` section 26. Three things
 * that were in v0.2 are deliberately absent, and their absence is the point:
 *
 * - **No risk penalty.** Section 27: a severe issue "is handled by a gate, not
 *   double-counted without policy". Risk lives in the dimension anchors and in
 *   the seven gates.
 * - **No evidence penalty.** Mandatory principle 5: "never hide missing
 *   information inside a score." Coverage is returned beside the score.
 * - **No path.** Section 26 specifies one global weight set; section 27 puts
 *   family variation in sub-metrics.
 */

/** A key is a stable identifier, not a display label. */
const keySchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(_[a-z0-9]+)*$/, "keys are lower_snake_case");

/** Section 27 gives anchor wording for 0-1, 3 and 5. */
export const scoringAnchorsSchema = z.object({
  low: z.string().min(1),
  mid: z.string().min(1),
  high: z.string().min(1),
});

/**
 * A sub-metric: the thing that is actually scored.
 *
 * `share` is the fraction of its dimension's weight that this sub-metric
 * carries, and the shares within a dimension must total 1. That is what lets
 * coverage be finer-grained than the dimension weights - section 35's examples
 * require 88%, 81%, 72% and 76% coverage, none of which a set of weights that
 * are all multiples of five can produce on its own.
 */
export const scoringSubMetricSchema = z.object({
  key: keySchema,
  label: z.string().min(1),
  share: z.number().positive().max(1),
});

export const scoringDimensionSchema = z.object({
  key: keySchema,
  label: z.string().min(1),
  weight: z.number().positive().max(100),
  anchors: scoringAnchorsSchema,
  subMetrics: z.array(scoringSubMetricSchema).min(1),
});

export const scoringConfigurationSchema = z
  .object({
    version: z.string().min(1),
    dimensions: z.array(scoringDimensionSchema).min(1),
  })
  .superRefine((config, ctx) => {
    const dimensionKeys = config.dimensions.map((dimension) => dimension.key);
    const duplicateDimensions = dimensionKeys.filter(
      (key, index) => dimensionKeys.indexOf(key) !== index,
    );
    if (duplicateDimensions.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: `duplicate scoring dimensions: ${[...new Set(duplicateDimensions)].join(", ")}`,
      });
    }

    // Weights are a percentage split of one scorecard. Anything else means the
    // configuration was edited without recalculating the model.
    const total = config.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
    if (Math.abs(total - 100) > 1e-9) {
      ctx.addIssue({ code: "custom", message: `dimension weights must total 100, got ${total}` });
    }

    // A sub-metric key has to be unique across the whole model, not just within
    // its dimension: the input is keyed by sub-metric, so a repeat would make
    // one supplied score silently count twice.
    const subMetricKeys = config.dimensions.flatMap((dimension) =>
      dimension.subMetrics.map((subMetric) => subMetric.key),
    );
    const duplicateSubMetrics = subMetricKeys.filter(
      (key, index) => subMetricKeys.indexOf(key) !== index,
    );
    if (duplicateSubMetrics.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: `duplicate sub-metrics: ${[...new Set(duplicateSubMetrics)].join(", ")}`,
      });
    }

    for (const dimension of config.dimensions) {
      const shareTotal = dimension.subMetrics.reduce((sum, subMetric) => sum + subMetric.share, 0);
      if (Math.abs(shareTotal - 1) > 1e-9) {
        ctx.addIssue({
          code: "custom",
          message: `sub-metric shares for "${dimension.key}" must total 1, got ${shareTotal}`,
        });
      }
    }
  });

/** Section 28. Seven of these; one of them runs before the score exists. */
export const hardGateDefinitionSchema = z.object({
  key: keySchema,
  label: z.string().min(1),
  trigger: z.string().min(1),
  action: z.string().min(1),
  /**
   * The entity gate alone. Section 28: "Stop; resolve entity before scoring."
   * A score computed against an unresolved identity describes nobody.
   */
  resolveBeforeScoring: z.boolean(),
});

export const scoringThresholdsSchema = z
  .object({
    priorityMinScore: z.number().min(0).max(100),
    priorityMinCoverage: z.number().min(0).max(1),
    shortlistMinScore: z.number().min(0).max(100),
    conditionalWatchlistMinScore: z.number().min(0).max(100),
    coverageGateFloor: z.number().min(0).max(1),
  })
  .superRefine((thresholds, ctx) => {
    if (thresholds.priorityMinScore <= thresholds.shortlistMinScore) {
      ctx.addIssue({ code: "custom", message: "priority threshold must sit above shortlist" });
    }
    if (thresholds.shortlistMinScore <= thresholds.conditionalWatchlistMinScore) {
      ctx.addIssue({ code: "custom", message: "shortlist threshold must sit above watchlist" });
    }
    if (thresholds.priorityMinCoverage < thresholds.coverageGateFloor) {
      ctx.addIssue({
        code: "custom",
        message: "the Priority coverage floor cannot sit below the coverage gate",
      });
    }
  });

export const scoringPolicySchema = z.object({
  hardGates: z.array(hardGateDefinitionSchema).min(1),
  thresholds: scoringThresholdsSchema,
});

/**
 * Section 30's design rule, as three states rather than two.
 *
 * "null means unknown. Zero means examined and weak. They are never
 * interchangeable." `not_applicable` is a third state the source document folds
 * into unknown, and separating them is deliberate: a measure that does not apply
 * to a business model should not count against that company's evidence coverage
 * the way a fact nobody has published does.
 */
export const subMetricInputSchema = z
  .object({
    status: z.enum(["scored", "unknown", "not_applicable"]),
    score: z.number().int().min(0).max(5).nullish(),
    /** Required when scored or not applicable; the anchor justification. */
    reason: z.string().min(1).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.status === "scored" && (input.score === null || input.score === undefined)) {
      ctx.addIssue({ code: "custom", message: "a scored sub-metric needs a score" });
    }
    if (input.status !== "scored" && input.score !== null && input.score !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "an unknown or not-applicable sub-metric must not carry a score",
      });
    }
    if (input.status === "not_applicable" && !input.reason?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "not_applicable needs a reason, or it is indistinguishable from a gap",
      });
    }
  });

export const hardGateInputSchema = z.object({
  state: z.enum(["clear", "triggered", "unresolved"]),
  evidence: z.string().optional(),
  reason: z.string().optional(),
});

export const routeInputSchema = z.object({
  score: z.number().min(0).max(5),
  reason: z.string().optional(),
});

/** Section 23. Buy is one of five, and the engine makes it compete. */
export const routeNameSchema = z.enum(["build", "partner", "buy", "invest", "watch"]);

/** Section 34. An action to take, distinct from the route it implies. */
export const recommendationLabelSchema = z.enum([
  "priority_diligence",
  "shortlist",
  "partner",
  "watch",
  "do_not_advance",
  "blocked",
]);

export const scoringInputSchema = z.object({
  /** Keyed by sub-metric, because the sub-metric is what carries evidence. */
  subMetrics: z.record(z.string(), subMetricInputSchema),
  hardGates: z.record(z.string(), hardGateInputSchema),
  routes: z.record(routeNameSchema, routeInputSchema),
  /** Explanatory only. Excluded from the input hash. */
  notes: z.string().optional(),
});

export const subMetricBreakdownEntrySchema = z.object({
  key: z.string(),
  label: z.string(),
  /** Absolute weight, not the share: `dimension.weight * share`. */
  weight: z.number(),
  status: z.enum(["scored", "unknown", "not_applicable"]),
  score: z.number().nullable(),
  contribution: z.number().nullable(),
});

export const scoreBreakdownEntrySchema = z.object({
  key: z.string(),
  label: z.string(),
  weight: z.number(),
  /** A dimension is scored when any of its sub-metrics is. */
  status: z.enum(["scored", "partially_scored", "unknown", "not_applicable"]),
  /** The 0-5 equivalent of the dimension's weighted contribution, or null. */
  score: z.number().nullable(),
  contribution: z.number().nullable(),
  subMetrics: z.array(subMetricBreakdownEntrySchema),
});

export const gateOutcomeSchema = z.object({
  key: z.string(),
  label: z.string(),
  state: z.enum(["clear", "triggered", "unresolved"]),
  action: z.string(),
});

export const scoringResultSchema = z.object({
  modelVersion: z.string(),
  /**
   * Section 26, and the three numbers it insists travel together: "A normalized
   * 82 at 55% coverage with a 45-90 range is not '82/100.'"
   */
  normalizedScore: z.number().min(0).max(100).nullable(),
  coverage: z.number().min(0).max(1),
  lowerBound: z.number().min(0).max(100).nullable(),
  upperBound: z.number().min(0).max(100).nullable(),
  recommendation: recommendationLabelSchema,
  /** The route the recorded assessment supports, and its runner-up. */
  bestRoute: routeNameSchema,
  secondBestRoute: routeNameSchema,
  /** Section 23: control has to beat every alternative, not merely score well. */
  buyBeatsAlternatives: z.boolean(),
  /** Every gate's state, so an answer can show pass/fail/unknown for all seven. */
  gates: z.array(gateOutcomeSchema),
  /** Gate keys that block advancement, in definition order. */
  blockingGates: z.array(z.string()),
  breakdown: z.array(scoreBreakdownEntrySchema),
  inputHash: z.string(),
});

export type ScoringAnchors = z.infer<typeof scoringAnchorsSchema>;
export type ScoringSubMetric = z.infer<typeof scoringSubMetricSchema>;
export type ScoringDimension = z.infer<typeof scoringDimensionSchema>;
export type ScoringConfiguration = z.infer<typeof scoringConfigurationSchema>;
export type HardGateDefinition = z.infer<typeof hardGateDefinitionSchema>;
export type ScoringThresholds = z.infer<typeof scoringThresholdsSchema>;
export type ScoringPolicy = z.infer<typeof scoringPolicySchema>;
export type SubMetricInput = z.infer<typeof subMetricInputSchema>;
export type HardGateInput = z.infer<typeof hardGateInputSchema>;
export type RouteInput = z.infer<typeof routeInputSchema>;
export type RouteName = z.infer<typeof routeNameSchema>;
export type RecommendationLabel = z.infer<typeof recommendationLabelSchema>;
export type ScoringInput = z.infer<typeof scoringInputSchema>;
export type SubMetricBreakdownEntry = z.infer<typeof subMetricBreakdownEntrySchema>;
export type ScoreBreakdownEntry = z.infer<typeof scoreBreakdownEntrySchema>;
export type GateOutcome = z.infer<typeof gateOutcomeSchema>;
export type ScoringResult = z.infer<typeof scoringResultSchema>;

/** Section 29's four source-quality levels, as configuration. */
export interface EvidenceLevel {
  level: "A" | "B" | "C" | "D";
  label: string;
  permittedUse: string;
  discoveryOnly: boolean;
}
