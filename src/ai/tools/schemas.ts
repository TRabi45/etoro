import { z } from "zod";
import { EVENT_TYPES, MA_STATES, STRATEGIC_THEMES, TARGET_PATHS } from "@/src/config/taxonomy";

/**
 * Tool input schemas.
 *
 * These are the contract between the model and the database. Every one is
 * validated before a query runs, so a hallucinated argument - an invented theme,
 * a five-company comparison, a negative score floor - is rejected at the
 * boundary rather than silently producing a misleading empty result.
 *
 * Enums come from the controlled taxonomy rather than being restated here, so
 * the values the model is offered can never drift from the values the database
 * actually stores.
 */

const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug must be lower-case and hyphen-separated")
  .describe("The company's slug identifier, for example 'getquin'.");

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected an ISO date (YYYY-MM-DD)");

export const searchTargetsInputSchema = z.object({
  geography: z
    .string()
    .min(1)
    .optional()
    .describe("Country or region to filter by, for example 'Germany'."),
  category: z.enum(STRATEGIC_THEMES).optional().describe("Strategic theme to filter by."),
  stage: z.enum(MA_STATES).optional().describe("Current M&A state of the company."),
  path: z.enum(TARGET_PATHS).optional().describe("Platform, tuck-in or hybrid."),
  minimum_score: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe("Only return companies whose final score is at least this value."),
  limit: z.number().int().min(1).max(50).default(10),
});

export const getCompanyProfileInputSchema = z.object({
  slug: slugSchema,
});

export const getCompanyFundamentalsInputSchema = z.object({
  slug: slugSchema,
  periods: z
    .array(z.string().min(1))
    .optional()
    .describe("Optional period labels to filter observations by."),
  metrics: z
    .array(z.string().min(1))
    .optional()
    .describe("Optional metric names to restrict the response to."),
});

export const compareCompaniesInputSchema = z.object({
  // Two to four: fewer is not a comparison, and more stops being legible in a
  // single answer.
  slugs: z.array(slugSchema).min(2).max(4),
  dimensions: z
    .array(z.string().min(1))
    .optional()
    .describe("Optional dimensions to compare, for example 'final_score'."),
});

export const getRecentEventsInputSchema = z.object({
  since_date: isoDateSchema.describe("Only return events on or after this date."),
  company: slugSchema.optional(),
  competitor: z.string().min(1).optional().describe("Competitor name to filter events by."),
  event_types: z.array(z.enum(EVENT_TYPES)).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const explainScoreInputSchema = z.object({
  slug: slugSchema,
  model_version: z
    .string()
    .min(1)
    .optional()
    .describe("Optional scoring model version, for example '0.2'."),
});

export const getMarketMapInputSchema = z.object({
  geography: z.string().min(1).optional(),
  category: z.enum(STRATEGIC_THEMES).optional(),
});

export const refreshCompanyInputSchema = z.object({
  slug: slugSchema,
  source_limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .default(5)
    .describe("Maximum number of sources the refresh may fetch."),
});

export const runMonitoringQuickInputSchema = z.object({
  topic: z.string().min(1).optional().describe("Optional topic to focus the run on."),
  strict_limits: z
    .boolean()
    .default(true)
    .describe("Whether to apply strict source and time limits."),
});

export type SearchTargetsInput = z.infer<typeof searchTargetsInputSchema>;
export type GetCompanyProfileInput = z.infer<typeof getCompanyProfileInputSchema>;
export type GetCompanyFundamentalsInput = z.infer<typeof getCompanyFundamentalsInputSchema>;
export type CompareCompaniesInput = z.infer<typeof compareCompaniesInputSchema>;
export type GetRecentEventsInput = z.infer<typeof getRecentEventsInputSchema>;
export type ExplainScoreInput = z.infer<typeof explainScoreInputSchema>;
export type GetMarketMapInput = z.infer<typeof getMarketMapInputSchema>;
export type RefreshCompanyInput = z.infer<typeof refreshCompanyInputSchema>;
export type RunMonitoringQuickInput = z.infer<typeof runMonitoringQuickInputSchema>;
