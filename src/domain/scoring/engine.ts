import { ALTERNATIVE_ROUTES } from "@/src/config/taxonomy";
import { hashScoringInput } from "@/src/domain/scoring/canonical-hash";
import { ScoringConfigurationError, ScoringInputError } from "@/src/domain/scoring/errors";
import {
  scoringConfigurationSchema,
  scoringInputSchema,
  scoringPolicySchema,
  type AlternativeRouteName,
  type ScoreBreakdownEntry,
  type ScoringConfiguration,
  type ScoringInput,
  type ScoringPolicy,
  type ScoringResult,
} from "@/src/domain/scoring/types";
import type { RecommendationState } from "@/src/config/taxonomy";

/**
 * The deterministic scoring engine.
 *
 * This module is pure: same inputs, same outputs, no I/O, no clock, no model
 * call. A language model may propose the structured inputs and may write the
 * narrative afterwards, but the number itself is produced here and nowhere else.
 *
 * Version 0.2 operations:
 *
 *   positive_normalized = 100 * Σ((score / 5) * weight) / Σ(scored applicable weights)
 *   weighted_coverage   = Σ(scored applicable weights) / Σ(all applicable weights)
 *   final_score         = max(0, positive_normalized - risk_penalty - evidence_penalty)
 *
 * Normalising over *scored* weight rather than total weight is the point of the
 * formula: a private company that never published its revenue is not scored as
 * though its revenue were zero. The cost of that missing evidence is charged
 * separately and visibly, through weighted coverage and the evidence penalty.
 *
 * Rounding convention: all arithmetic runs at full double precision and is
 * rounded only on the way out - scores to two decimal places, coverage to four -
 * using half-up rounding. `final_score` is derived from the rounded
 * `positive_normalized` so that the published numbers always reconcile.
 */

const SCORE_DECIMALS = 2;
const COVERAGE_DECIMALS = 4;
const MAX_DIMENSION_SCORE = 5;

/**
 * Half-up rounding. Every value passed here is non-negative by construction,
 * which keeps the epsilon correction sound.
 */
function roundHalfUp(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export interface ScoreTargetArgs {
  config: ScoringConfiguration;
  policy: ScoringPolicy;
  input: ScoringInput;
}

function parseConfiguration(config: ScoringConfiguration) {
  const parsed = scoringConfigurationSchema.safeParse(config);
  if (!parsed.success) {
    throw new ScoringConfigurationError(
      `invalid scoring configuration: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  }
  return parsed.data;
}

function parsePolicy(policy: ScoringPolicy) {
  const parsed = scoringPolicySchema.safeParse(policy);
  if (!parsed.success) {
    throw new ScoringConfigurationError(
      `invalid scoring policy: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  }
  return parsed.data;
}

function parseInput(input: ScoringInput) {
  const parsed = scoringInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ScoringInputError(
      `invalid scoring input: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  }
  return parsed.data;
}

/** Every key in the model must be supplied exactly once, and nothing extra. */
function assertKeysMatch(expected: string[], provided: string[], label: string): void {
  const missing = expected.filter((key) => !provided.includes(key));
  const unexpected = provided.filter((key) => !expected.includes(key));
  if (missing.length > 0) {
    throw new ScoringInputError(`missing ${label}: ${missing.join(", ")}`);
  }
  if (unexpected.length > 0) {
    throw new ScoringInputError(`unknown ${label}: ${unexpected.join(", ")}`);
  }
}

/** Returns the highest-scoring alternative to acquisition, deterministically. */
function bestAlternativeRoute(input: ScoringInput): {
  route: AlternativeRouteName;
  score: number;
} {
  let best: { route: AlternativeRouteName; score: number } = {
    route: ALTERNATIVE_ROUTES[0],
    score: input.routeAssessment[ALTERNATIVE_ROUTES[0]].score,
  };
  // Iterating the frozen route order makes ties resolve the same way every run.
  for (const route of ALTERNATIVE_ROUTES) {
    const score = input.routeAssessment[route].score;
    if (score > best.score) {
      best = { route, score };
    }
  }
  return best;
}

export function scoreTarget({ config, policy, input }: ScoreTargetArgs): ScoringResult {
  const model = parseConfiguration(config);
  const rules = parsePolicy(policy);
  const scoringInput = parseInput(input);

  if (scoringInput.path !== model.path) {
    throw new ScoringInputError(
      `input path ${scoringInput.path} does not match model path ${model.path}`,
    );
  }

  // The regulated-access subtype re-anchors Tuck-in dimensions. It has no
  // meaning for a Platform scorecard.
  const subtype = scoringInput.subtype ?? null;
  if (subtype === "regulated_access" && model.path !== "tuck_in") {
    throw new ScoringInputError("the regulated_access subtype applies to Tuck-in targets only");
  }

  const dimensionKeys = model.dimensions.map((dimension) => dimension.key);
  assertKeysMatch(dimensionKeys, Object.keys(scoringInput.dimensions), "scoring dimensions");
  assertKeysMatch(
    rules.riskComponents.map((component) => component.key),
    Object.keys(scoringInput.risk),
    "risk components",
  );
  assertKeysMatch(
    rules.hardGates.map((gate) => gate.key),
    Object.keys(scoringInput.hardGates),
    "hard gates",
  );

  // --- Risk ---------------------------------------------------------------
  let riskTotal = 0;
  for (const component of rules.riskComponents) {
    const supplied = scoringInput.risk[component.key];
    if (supplied.value > component.max) {
      throw new ScoringInputError(
        `risk component ${component.key} is ${supplied.value}, above its maximum of ${component.max}`,
      );
    }
    // A deduction without a stated reason is not reviewable, so it is rejected
    // rather than quietly accepted.
    if (supplied.value > 0 && (supplied.reason === undefined || supplied.reason.trim() === "")) {
      throw new ScoringInputError(`risk component ${component.key} is non-zero but has no reason`);
    }
    riskTotal += supplied.value;
  }
  if (riskTotal > rules.riskPenaltyCap) {
    riskTotal = rules.riskPenaltyCap;
  }
  const riskPenalty = roundHalfUp(riskTotal, SCORE_DECIMALS);

  // --- Coverage and positive score ---------------------------------------
  let applicableWeight = 0;
  let scoredWeight = 0;
  let weightedScoreSum = 0;
  const breakdown: ScoreBreakdownEntry[] = [];

  for (const dimension of model.dimensions) {
    const supplied = scoringInput.dimensions[dimension.key];
    const label =
      subtype === "regulated_access" && dimension.regulatedAccessLabel
        ? dimension.regulatedAccessLabel
        : dimension.label;

    if (supplied.status === "not_applicable") {
      // Leaves both the numerator and the denominator entirely.
      breakdown.push({
        key: dimension.key,
        label,
        weight: dimension.weight,
        status: supplied.status,
        score: null,
        weightedContribution: null,
      });
      continue;
    }

    applicableWeight += dimension.weight;

    if (supplied.status === "unknown") {
      // Stays in the denominator, contributes nothing to the numerator.
      breakdown.push({
        key: dimension.key,
        label,
        weight: dimension.weight,
        status: supplied.status,
        score: null,
        weightedContribution: null,
      });
      continue;
    }

    scoredWeight += dimension.weight;
    const contribution = (supplied.score / MAX_DIMENSION_SCORE) * dimension.weight;
    weightedScoreSum += contribution;
    breakdown.push({
      key: dimension.key,
      label,
      weight: dimension.weight,
      status: supplied.status,
      score: supplied.score,
      weightedContribution: roundHalfUp(contribution, SCORE_DECIMALS),
    });
  }

  if (applicableWeight === 0) {
    throw new ScoringInputError("every dimension is marked not_applicable, so nothing is scorable");
  }

  const rawCoverage = scoredWeight / applicableWeight;
  const weightedCoverage = roundHalfUp(rawCoverage, COVERAGE_DECIMALS);
  const rawPositive = scoredWeight === 0 ? null : (100 * weightedScoreSum) / scoredWeight;
  const positiveNormalized = rawPositive === null ? null : roundHalfUp(rawPositive, SCORE_DECIMALS);

  // --- Hard gates ---------------------------------------------------------
  const triggeredGates: string[] = [];
  const triggeredPermanentGates: string[] = [];
  const unresolvedCriticalGates: string[] = [];
  const unresolvedGates: string[] = [];

  for (const gate of rules.hardGates) {
    const supplied = scoringInput.hardGates[gate.key];
    if (supplied.state === "triggered") {
      triggeredGates.push(gate.key);
      if (gate.permanent) {
        triggeredPermanentGates.push(gate.key);
      }
    }
    if (supplied.state === "unresolved") {
      unresolvedGates.push(gate.key);
      // Only a *critical* unresolved gate suppresses the score entirely. The
      // rest still have to block Acquire - see the blocker below.
      if (gate.critical) {
        unresolvedCriticalGates.push(gate.key);
      }
    }
  }

  // --- Evidence penalty ---------------------------------------------------
  const belowCoverageFloor = weightedCoverage < rules.thresholds.researchOnlyCoverageFloor;
  const band = rules.evidenceBands.find(
    (candidate) =>
      weightedCoverage >= candidate.minCoverage &&
      (weightedCoverage < candidate.maxCoverage || candidate.maxCoverage >= 1),
  );

  if (!belowCoverageFloor) {
    if (!band) {
      throw new ScoringConfigurationError(
        `no evidence band covers a weighted coverage of ${weightedCoverage}`,
      );
    }
    // The penalty is supplied, not guessed - but it must belong to the band the
    // evidence actually earned, or the deduction is not defensible.
    if (
      scoringInput.evidencePenalty < band.minPenalty ||
      scoringInput.evidencePenalty > band.maxPenalty
    ) {
      throw new ScoringInputError(
        `evidence penalty ${scoringInput.evidencePenalty} is outside the ${band.minPenalty}-${band.maxPenalty} band for coverage ${weightedCoverage}`,
      );
    }
  }
  const evidencePenalty = roundHalfUp(scoringInput.evidencePenalty, SCORE_DECIMALS);

  // --- State --------------------------------------------------------------
  // Sparse evidence or an unresolved critical gate means there is no decision
  // score to publish. Research only is an answer, not a low score.
  const researchOnly =
    belowCoverageFloor || unresolvedCriticalGates.length > 0 || positiveNormalized === null;

  const finalScore = researchOnly
    ? null
    : roundHalfUp(
        Math.max(0, (positiveNormalized as number) - riskPenalty - evidencePenalty),
        SCORE_DECIMALS,
      );

  // --- Acquire eligibility ------------------------------------------------
  const strategicFit = scoringInput.dimensions[model.strategicFitDimension];
  const plausibility = scoringInput.dimensions[model.acquisitionPlausibilityDimension];
  const alternative = bestAlternativeRoute(scoringInput);
  const acquireBlockers: string[] = [];

  if (researchOnly) {
    acquireBlockers.push("no decision score: research only");
  }
  if (triggeredGates.length > 0) {
    acquireBlockers.push(`hard gate triggered: ${triggeredGates.join(", ")}`);
  }
  // An unresolved gate is an open question, and an open question is not a pass.
  // Only critical gates force Research only, so before this check a non-critical
  // unresolved gate - `strategic_contradiction` is the one in v0.2 - was counted
  // neither as triggered nor as critical and therefore vanished: "we have not
  // established whether this contradicts the strategy" was treated exactly like
  // "it does not". Acquire is the one recommendation that cannot be walked back
  // cheaply, so it has to clear every gate explicitly.
  if (unresolvedGates.length > 0) {
    acquireBlockers.push(`hard gate unresolved: ${unresolvedGates.join(", ")}`);
  }
  if (finalScore !== null && finalScore < rules.thresholds.acquireMinFinalScore) {
    acquireBlockers.push(
      `final score ${finalScore} is below ${rules.thresholds.acquireMinFinalScore}`,
    );
  }
  if (strategicFit.status !== "scored") {
    acquireBlockers.push(`strategic fit is ${strategicFit.status}`);
  } else if (strategicFit.score < rules.thresholds.acquireMinStrategicFit) {
    acquireBlockers.push(
      `strategic fit ${strategicFit.score} is below ${rules.thresholds.acquireMinStrategicFit}`,
    );
  }
  if (weightedCoverage < rules.thresholds.acquireMinCoverage) {
    acquireBlockers.push(
      `weighted coverage ${weightedCoverage} is below ${rules.thresholds.acquireMinCoverage}`,
    );
  }
  if (plausibility.status !== "scored") {
    acquireBlockers.push(`acquisition plausibility is ${plausibility.status}`);
  } else if (plausibility.score < rules.thresholds.acquireMinAcquisitionPlausibility) {
    acquireBlockers.push(
      `acquisition plausibility ${plausibility.score} is below ${rules.thresholds.acquireMinAcquisitionPlausibility}`,
    );
  }
  const unresolved = Object.entries(scoringInput.resolution)
    .filter(([, state]) => state === "unresolved")
    .map(([field]) => field);
  if (unresolved.length > 0) {
    acquireBlockers.push(`unresolved: ${unresolved.join(", ")}`);
  }
  // Control has to win on its merits. A high fit score is not a mandate to buy.
  if (scoringInput.routeAssessment.acquire.score <= alternative.score) {
    acquireBlockers.push(
      `acquisition does not beat ${alternative.route} on the recorded route assessment`,
    );
  }

  const acquireEligible = acquireBlockers.length === 0;

  // --- Recommendation -----------------------------------------------------
  // Deliberately a separate decision from the score. The order below is the
  // decision table: gates, then permanent disqualifiers, then Acquire, then the
  // strongest remaining route.
  let recommendation: RecommendationState;
  if (researchOnly) {
    recommendation = "research_only";
  } else if (triggeredPermanentGates.length > 0) {
    recommendation = "pass";
  } else if (strategicFit.status === "scored" && strategicFit.score < 3) {
    recommendation = "pass";
  } else if (acquireEligible) {
    recommendation = "acquire";
  } else if (
    finalScore !== null &&
    finalScore < rules.thresholds.monitorMinFinalScore &&
    alternative.score < 3
  ) {
    recommendation = "pass";
  } else {
    recommendation = alternative.route;
  }

  return {
    modelVersion: model.version,
    path: model.path,
    subtype,
    positiveNormalized: researchOnly ? null : positiveNormalized,
    weightedCoverage,
    riskPenalty,
    evidencePenalty,
    finalScore,
    scoreState: researchOnly ? "research_only" : "scored",
    recommendation,
    acquireEligible,
    acquireBlockers,
    triggeredPermanentGates,
    unresolvedCriticalGates,
    breakdown,
    inputHash: hashScoringInput(scoringInput),
  };
}

/**
 * Genuine Hybrid targets are scored twice and both results are kept.
 *
 * Averaging them would destroy the very thing the dual score exists to show.
 * Gatsby is the historical proof: its Tuck-in view scored more than ten points
 * above its Platform view, because what eToro actually bought was options
 * technology and speed to market, not a standalone franchise. An average would
 * have hidden that.
 */
export function scoreHybridTarget(args: { platform: ScoreTargetArgs; tuckIn: ScoreTargetArgs }): {
  platform: ScoringResult;
  tuckIn: ScoringResult;
} {
  if (args.platform.input.path !== "platform" || args.tuckIn.input.path !== "tuck_in") {
    throw new ScoringInputError(
      "a hybrid assessment requires one platform input and one tuck_in input",
    );
  }
  return {
    platform: scoreTarget(args.platform),
    tuckIn: scoreTarget(args.tuckIn),
  };
}
