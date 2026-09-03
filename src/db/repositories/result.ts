import type { ConfigurationProblem } from "@/src/db/client";

/**
 * Shared result types for the repository layer.
 *
 * Reads return failures as values, because the dashboard has to distinguish
 * "not configured" from "unreachable" from "empty" and render each honestly.
 *
 * Writes throw instead. They only ever run inside a pipeline or a script, where
 * a partial write is worse than a loud stop - a half-written evidence tree would
 * leave claims with no sources or an assessment citing nothing, which is exactly
 * the state the evidence rules exist to prevent.
 */

export interface DatabaseProblem {
  kind: "database";
  message: string;
}

export type RepositoryResult<T> =
  { ok: true; data: T } | { ok: false; problem: ConfigurationProblem | DatabaseProblem };

/** Raised by write-side repository functions when persistence fails. */
export class RepositoryWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryWriteError";
  }
}
