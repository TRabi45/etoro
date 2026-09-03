/**
 * Scoring failures are separated by cause, because the two need different
 * handling: a bad configuration is a deployment problem, while a bad input is a
 * data problem the pipeline should record against the run and move past.
 */

/** The scoring model or shared policy is malformed. */
export class ScoringConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScoringConfigurationError";
  }
}

/** The supplied scoring inputs are invalid or inconsistent with the model. */
export class ScoringInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScoringInputError";
  }
}
