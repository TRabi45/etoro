import { hashScoringInput } from "@/src/domain/scoring/canonical-hash";
import { ScoringConfigurationError, ScoringInputError } from "@/src/domain/scoring/errors";
import {
  scoringConfigurationSchema,
  scoringInputSchema,
  scoringPolicySchema,
  type GateOutcome,
  type RecommendationLabel,
  type RouteName,
  type ScoreBreakdownEntry,
  type ScoringConfiguration,
  type ScoringInput,
  type ScoringPolicy,
  type ScoringResult,
  type SubMetricBreakdownEntry,
} from "@/src/domain/scoring/types";

/**
 * The deterministic scoring engine.
 *
 * This module is pure: same inputs, same outputs, no I/O, no clock, no model
 * call. A language model may propose the structured inputs and may write the
 * narrative afterwards, but the number itself is produced here and nowhere else.
 *
 * Version 0.3 implements section 26 of `docs/ACQUISITION_THESIS.md`:
 *
 *   contribution(s)  = weight(dimension) * share(s) * score(s) / 5
 *   normalized       = Σ contribution(scored) / Σ weight(scored) * 100
 *   coverage         = Σ weight(scored) / Σ weight(applicable)
 *   lower_bound      = Σ contribution(scored)              // unknowns score 0
 *   upper_bound      = Σ contribution(scored) + Σ weight(unknown)   // unknowns score 5
 *
 * Normalising over *scored* weight rather than total weight is the whole point:
 * a private company that never published its revenue is not scored as though its
 * revenue were zero. What that costs is reported next to the score as coverage
 * and as the width of the range - never subtracted from the score itself, which
 * mandatory principle 5 forbids in as many words.
 *
 * `not_applicable` leaves both sides of the ratio. A measure that does not apply
 * to a business model is not a gap in the evidence about that company, and
 * charging it as one would penalise a wallet for having no assets under
 * management.
 *
 * Rounding convention: all arithmetic runs at full double precision and is
 * rounded only on the way out - scores to two decimal places, coverage to four -
 * using half-up rounding.
 */

const SCORE_DECIMALS = 2;
const COVERAGE_DECIMALS = 4;
const MAX_SUB_METRIC_SCORE = 5;

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

function parseConfiguration(config: ScoringConfiguration): ScoringConfiguration {
  const parsed = scoringConfigurationSchema.safeParse(config);
  if (!parsed.success) {
    throw new ScoringConfigurationError(`invalid scoring configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}

function parsePolicy(policy: ScoringPolicy): ScoringPolicy {
  const parsed = scoringPolicySchema.safeParse(policy);
  if (!parsed.success) {
    throw new ScoringConfigurationError(`invalid scoring policy: ${parsed.error.message}`);
  }
  return parsed.data;
}

function parseInput(input: ScoringInput): ScoringInput {
  const parsed = scoringInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ScoringInputError(`invalid scoring input: ${parsed.error.message}`);
  }
  return parsed.data;
}

/**
 * Section 23, made a precondition rather than a suggestion.
 *
 * "The agent must always present the second-best route. If there is no
 * alternative, the thesis may be defined too narrowly or research may be
 * incomplete." Ties resolve to the earlier entry in a fixed order so two
 * identical inputs always rank identically.
 */
const ROUTE_ORDER: readonly RouteName[] = ["build", "partner", "buy", "invest", "watch"];

function rankRoutes(input: ScoringInput): { best: RouteName; second: RouteName } {
  const ranked = [...ROUTE_ORDER].sort((left, right) => {
    const difference = (input.routes[right]?.score ?? 0) - (input.routes[left]?.score ?? 0);
    if (difference !== 0) {
      return difference;
    }
    return ROUTE_ORDER.indexOf(left) - ROUTE_ORDER.indexOf(right);
  });
  return { best: ranked[0], second: ranked[1] };
}

interface DimensionTotals {
  breakdown: ScoreBreakdownEntry[];
  scoredWeight: number;
  applicableWeight: number;
  unknownWeight: number;
  contribution: number;
}

function computeDimensions(config: ScoringConfiguration, input: ScoringInput): DimensionTotals {
  const breakdown: ScoreBreakdownEntry[] = [];
  let scoredWeight = 0;
  let applicableWeight = 0;
  let unknownWeight = 0;
  let contribution = 0;

  for (const dimension of config.dimensions) {
    const subMetrics: SubMetricBreakdownEntry[] = [];
    let dimensionScoredWeight = 0;
    let dimensionApplicableWeight = 0;
    let dimensionContribution = 0;
    let anyUnknown = false;

    for (const subMetric of dimension.subMetrics) {
      const supplied = input.subMetrics[subMetric.key];
      if (!supplied) {
        throw new ScoringInputError(`no input supplied for sub-metric "${subMetric.key}"`);
      }

      const weight = dimension.weight * subMetric.share;

      if (supplied.status === "not_applicable") {
        subMetrics.push({
          key: subMetric.key,
          label: subMetric.label,
          weight,
          status: "not_applicable",
          score: null,
          contribution: null,
        });
        continue;
      }

      dimensionApplicableWeight += weight;
      applicableWeight += weight;

      if (supplied.status === "unknown") {
        anyUnknown = true;
        unknownWeight += weight;
        subMetrics.push({
          key: subMetric.key,
          label: subMetric.label,
          weight,
          status: "unknown",
          score: null,
          contribution: null,
        });
        continue;
      }

      // `score` is present because the input schema refuses a scored sub-metric
      // without one; the assertion is for the type system, not for safety.
      const score = supplied.score as number;
      const subContribution = (weight * score) / MAX_SUB_METRIC_SCORE;

      dimensionScoredWeight += weight;
      dimensionContribution += subContribution;
      scoredWeight += weight;
      contribution += subContribution;

      subMetrics.push({
        key: subMetric.key,
        label: subMetric.label,
        weight,
        status: "scored",
        score,
        contribution: roundHalfUp(subContribution, SCORE_DECIMALS),
      });
    }

    const status: ScoreBreakdownEntry["status"] =
      dimensionApplicableWeight === 0
        ? "not_applicable"
        : dimensionScoredWeight === 0
          ? "unknown"
          : anyUnknown
            ? "partially_scored"
            : "scored";

    breakdown.push({
      key: dimension.key,
      label: dimension.label,
      weight: dimension.weight,
      status,
      // Reported back on the 0-5 anchor scale the analyst supplied, so a
      // dimension row reads the same way it was scored.
      score:
        dimensionScoredWeight === 0
          ? null
          : roundHalfUp(
              (dimensionContribution / dimensionScoredWeight) * MAX_SUB_METRIC_SCORE,
              SCORE_DECIMALS,
            ),
      contribution:
        dimensionScoredWeight === 0 ? null : roundHalfUp(dimensionContribution, SCORE_DECIMALS),
      subMetrics,
    });
  }

  return { breakdown, scoredWeight, applicableWeight, unknownWeight, contribution };
}

/**
 * Section 28 and section 34, as one decision.
 *
 * The order matters and is the document's, not a convenience. A triggered gate
 * blocks whatever the score says - DeltaCustody in section 35 is 74 points of
 * good wallet fit and still `blocked`. An *unresolved* gate does not block; it
 * denies Priority and leaves the target on a shortlist pending review, which is
 * exactly BetaOptions. Only then do the score bands apply.
 */
export interface RecommendationArgs {
  normalizedScore: number | null;
  coverage: number;
  policy: ScoringPolicy;
  triggeredGates: readonly string[];
  unresolvedGates: readonly string[];
  bestRoute: RouteName;
}

/**
 * Exported so section 35's five calibration companies can be checked directly.
 *
 * Those examples give a score, a coverage figure, a gate state and the verdict
 * each must produce - and the document is explicit that they "demonstrate
 * correct model behavior", not correct arithmetic. Testing them through a
 * constructed set of dimension scores would test the construction; testing them
 * here tests the decision the business actually specified.
 *
 * The order of the checks below is the document's, not a convenience:
 *
 * 1. A *triggered* gate blocks whatever the score says. DeltaCustody is 74
 *    points of good wallet fit and still blocked.
 * 2. A low score stops the target regardless of which route looks best. There is
 *    no route worth taking into a company that does not fit.
 * 3. **The route outranks the score band.** Section 23 and mandatory principle 8
 *    require buy to be compared against build, partner, invest and watch, and
 *    "a company should not be recommended for acquisition when the same
 *    capability can be obtained faster or more efficiently through internal
 *    development or partnership". A strong fit that partnering serves better is
 *    a partnership, not a shortlisted acquisition - however high it scores.
 * 4. Only then do section 26's bands apply. An *unresolved* gate does not block;
 *    it denies Priority and leaves the target on a shortlist pending review,
 *    which is exactly BetaOptions. The coverage gate is the one exception:
 *    section 28 gives it its own consequence, "Research only; no shortlist".
 */
export function decideRecommendation(args: RecommendationArgs): RecommendationLabel {
  const { normalizedScore, coverage, policy, triggeredGates, unresolvedGates, bestRoute } = args;

  if (triggeredGates.length > 0) {
    return "blocked";
  }

  if (normalizedScore === null) {
    // Nothing was scored at all. Section 38: a research gap is a manageable
    // output "provided it is not hidden inside a score".
    return "watch";
  }

  if (normalizedScore < policy.thresholds.conditionalWatchlistMinScore) {
    return "do_not_advance";
  }

  if (bestRoute !== "buy") {
    // Build, invest and watch all mean "not an acquisition now", and section 34
    // has no label for the first two. Partner is a route the analyst can act on,
    // so it keeps its own label.
    return bestRoute === "partner" ? "partner" : "watch";
  }

  if (normalizedScore < policy.thresholds.shortlistMinScore) {
    // Section 26's 50-64 band: a conditional watchlist, never a shortlist.
    return "watch";
  }

  const priorityEligible =
    normalizedScore >= policy.thresholds.priorityMinScore &&
    coverage >= policy.thresholds.priorityMinCoverage &&
    unresolvedGates.length === 0;

  if (priorityEligible) {
    return "priority_diligence";
  }

  if (unresolvedGates.includes("coverage")) {
    // Section 28's coverage gate: "Research only; no shortlist." Thin evidence
    // does not become a shortlist by scoring well on the little that is known.
    return "watch";
  }

  return "shortlist";
}

/**
 * Scores one target against one model.
 *
 * Throws on a malformed configuration or input rather than returning a
 * degraded score. A number nobody can reproduce is worse than no number.
 */
export function scoreTarget({ config, policy, input }: ScoreTargetArgs): ScoringResult {
  const scoringConfig = parseConfiguration(config);
  const scoringPolicy = parsePolicy(policy);
  const scoringInput = parseInput(input);

  // Section 28 orders the entity gate ahead of the score: "Stop; resolve entity
  // before scoring." Checked first, and separately, because everything below
  // this line describes a company whose identity is settled.
  const gates: GateOutcome[] = [];
  const triggeredGates: string[] = [];
  const unresolvedGates: string[] = [];

  for (const gate of scoringPolicy.hardGates) {
    const supplied = scoringInput.hardGates[gate.key];
    if (!supplied) {
      throw new ScoringInputError(`no state supplied for hard gate "${gate.key}"`);
    }
    gates.push({ key: gate.key, label: gate.label, state: supplied.state, action: gate.action });

    if (supplied.state === "triggered") {
      triggeredGates.push(gate.key);
    }
    if (supplied.state === "unresolved") {
      unresolvedGates.push(gate.key);
    }

    if (gate.resolveBeforeScoring && supplied.state !== "clear") {
      const routes = rankRoutes(scoringInput);
      return {
        modelVersion: scoringConfig.version,
        normalizedScore: null,
        coverage: 0,
        lowerBound: null,
        upperBound: null,
        recommendation: "blocked",
        bestRoute: routes.best,
        secondBestRoute: routes.second,
        buyBeatsAlternatives: false,
        gates,
        blockingGates: [gate.key],
        breakdown: [],
        inputHash: hashScoringInput(scoringInput),
      };
    }
  }

  const totals = computeDimensions(scoringConfig, scoringInput);

  if (totals.applicableWeight === 0) {
    throw new ScoringInputError(
      "every dimension is marked not applicable, which leaves nothing to score",
    );
  }

  const coverage = roundHalfUp(totals.scoredWeight / totals.applicableWeight, COVERAGE_DECIMALS);
  const normalizedScore =
    totals.scoredWeight === 0
      ? null
      : roundHalfUp((totals.contribution / totals.scoredWeight) * 100, SCORE_DECIMALS);

  // Section 26: "Range: lower if missing=0; upper if missing=5." The bounds are
  // absolute points out of 100, not a normalisation - that is what makes the
  // width of the range read as the size of the unanswered question.
  const lowerBound = roundHalfUp(totals.contribution, SCORE_DECIMALS);
  const upperBound = roundHalfUp(totals.contribution + totals.unknownWeight, SCORE_DECIMALS);

  const belowCoverageGate = coverage < scoringPolicy.thresholds.coverageGateFloor;
  if (belowCoverageGate && !unresolvedGates.includes("coverage")) {
    // The coverage gate is the one gate the engine can evaluate itself, because
    // coverage is something it computes rather than something research reports.
    unresolvedGates.push("coverage");
    const outcome = gates.find((gate) => gate.key === "coverage");
    if (outcome) {
      outcome.state = "unresolved";
    }
  }

  const routes = rankRoutes(scoringInput);
  const buyScore = scoringInput.routes.buy?.score ?? 0;
  const bestAlternativeScore = Math.max(
    ...ROUTE_ORDER.filter((route) => route !== "buy").map(
      (route) => scoringInput.routes[route]?.score ?? 0,
    ),
  );

  return {
    modelVersion: scoringConfig.version,
    normalizedScore,
    coverage,
    lowerBound,
    upperBound,
    recommendation: decideRecommendation({
      normalizedScore,
      coverage,
      policy: scoringPolicy,
      triggeredGates,
      unresolvedGates,
      bestRoute: routes.best,
    }),
    bestRoute: routes.best,
    secondBestRoute: routes.second,
    // Strict domination. An equal score is not a reason to take control, and
    // section 23 asks for the second-best route precisely so that ties are
    // visible rather than resolved in favour of buying.
    buyBeatsAlternatives: buyScore > bestAlternativeScore,
    gates,
    blockingGates: [...triggeredGates],
    breakdown: totals.breakdown,
    inputHash: hashScoringInput(scoringInput),
  };
}
