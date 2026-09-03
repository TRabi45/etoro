/**
 * The gold benchmark: eight independently researched companies.
 *
 * This file is evaluation material and must never become an input to the
 * product. It lives outside `src/` and `app/`, an ESLint rule forbids production
 * modules from importing anything under `tests/`, and none of these companies
 * appears in the bootstrap seed. The point of the benchmark is to measure what
 * the production pipeline discovers on its own; if the agent could read these
 * expectations, it would be marking its own exam.
 *
 * The assertions are deliberately ranges and classes rather than exact scores. A
 * fresh run against live sources will not reproduce a stage-two research figure
 * to two decimal places, and demanding that it does would test the wrong thing.
 *
 * These expectations are used from Milestone 6 onwards, when there is a pipeline
 * to evaluate. In this milestone they exist so the bootstrap/gold separation can
 * be asserted by a test.
 */

export interface GoldBenchmarkEntry {
  canonicalName: string;
  expectedPath: "platform" | "tuck_in" | "hybrid";
  /** The action class a correct run should reach, not a single label. */
  expectedActions: readonly string[];
  acceptableFinalScore: { min: number; max: number };
  /** Facts a run must establish, or explicitly report as unknown. */
  mandatoryEvidenceChecks: readonly string[];
}

export const GOLD_BENCHMARK: readonly GoldBenchmarkEntry[] = [
  {
    canonicalName: "PensionBee",
    expectedPath: "platform",
    expectedActions: ["monitor"],
    acceptableFinalScore: { min: 72, max: 82 },
    mandatoryEvidenceChecks: [
      "identifies the listed group rather than the brand",
      "current AUA, customers and revenue are sourced",
      "control plausibility is assessed separately from fit",
    ],
  },
  {
    canonicalName: "Lightyear",
    expectedPath: "platform",
    expectedActions: ["monitor"],
    acceptableFinalScore: { min: 57, max: 69 },
    mandatoryEvidenceChecks: [
      "UK and EU entities and licences are identified separately",
      "no fabricated private economics",
    ],
  },
  {
    canonicalName: "Plum",
    expectedPath: "platform",
    expectedActions: ["monitor"],
    acceptableFinalScore: { min: 59, max: 70 },
    mandatoryEvidenceChecks: [
      "group operating entities are distinguished",
      "the user-count definition is caveated",
      "the valuation source is identified as campaign-reported",
    ],
  },
  {
    canonicalName: "Fintual",
    expectedPath: "platform",
    expectedActions: ["monitor", "acquire"],
    acceptableFinalScore: { min: 65, max: 76 },
    mandatoryEvidenceChecks: [
      "Chile and Mexico entities are mapped",
      "current AUM is reported as unknown when not found",
    ],
  },
  {
    canonicalName: "Archax",
    expectedPath: "hybrid",
    expectedActions: ["monitor", "invest"],
    acceptableFinalScore: { min: 60, max: 72 },
    mandatoryEvidenceChecks: [
      "the FCA-authorised entity is identified",
      "each announced acquisition carries its own status",
      "no assumption that licences transfer on a change of control",
    ],
  },
  {
    canonicalName: "Utila",
    expectedPath: "tuck_in",
    expectedActions: ["acquire"],
    acceptableFinalScore: { min: 81, max: 91 },
    mandatoryEvidenceChecks: [
      "total funding is sourced",
      "an infrastructure provider is distinguished from a regulated custodian",
      "security unknowns are stated",
    ],
  },
  {
    canonicalName: "QuantConnect",
    expectedPath: "tuck_in",
    expectedActions: ["acquire"],
    acceptableFinalScore: { min: 77, max: 88 },
    mandatoryEvidenceChecks: [
      "proprietary assets are separated from open-source ones",
      "market-data licence risk is raised",
    ],
  },
  {
    canonicalName: "AfterHour",
    expectedPath: "tuck_in",
    expectedActions: ["acquire"],
    acceptableFinalScore: { min: 73, max: 84 },
    mandatoryEvidenceChecks: [
      "metrics are labelled company-reported",
      "the not-a-broker-dealer disclosure is captured",
      "conduct and moderation risk is raised",
    ],
  },
];

export const GOLD_BENCHMARK_NAMES: readonly string[] = GOLD_BENCHMARK.map(
  (entry) => entry.canonicalName,
);
