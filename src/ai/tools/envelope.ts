import { neutralizeCitations } from "@/src/ai/tools/untrusted";
import type { PacketCitation } from "@/src/validation/evidence-packet";
import type { ConfidenceLevel } from "@/src/config/taxonomy";

/**
 * The tool envelope.
 *
 * Every tool the model can call returns this shape, and that uniformity is what
 * makes the hallucination rules enforceable rather than merely stated in a
 * prompt:
 *
 *   - `data` is null whenever there is nothing to report, so "no data" is a
 *     value the model receives rather than a silence it has to interpret;
 *   - `citations` travel with the data, so the model never has to invent a
 *     source to attribute a fact to;
 *   - `error` is returned *inside* a successful response rather than thrown,
 *     so a failing tool lets the agent apologise and explain instead of
 *     crashing the request;
 *   - `confidence` and `asOf` are computed from the records themselves, not
 *     asserted by the model.
 *
 * A prompt asking a model to be honest is a request. Handing it an envelope
 * that has nowhere to put an unsourced fact is a constraint.
 */

export type Citation = PacketCitation;

export interface ToolError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ToolResult<T> {
  ok: boolean;
  data: T | null;
  citations: Citation[];
  /** When the underlying data was last true, or when it was read. */
  asOf: string;
  confidence: ConfidenceLevel;
  warnings: string[];
  error?: ToolError;
}

export interface SuccessOptions {
  citations?: Citation[];
  asOf?: string | null;
  confidence?: ConfidenceLevel;
  warnings?: string[];
}

/**
 * A tool call that found what it was asked for.
 *
 * Citations are neutralised on the way out rather than at each call site, so a
 * tool added later cannot forget to do it: externally-authored text reaches the
 * model delimited, or it does not reach the model at all.
 */
export function toolSuccess<T>(data: T, options: SuccessOptions = {}): ToolResult<T> {
  return {
    ok: true,
    data,
    citations: neutralizeCitations(options.citations ?? []),
    asOf: options.asOf ?? new Date().toISOString(),
    confidence: options.confidence ?? "medium",
    warnings: options.warnings ?? [],
  };
}

/**
 * A tool call that completed but found nothing.
 *
 * Deliberately `ok: true` with null data: an empty result is a legitimate answer
 * about the world, not a malfunction. The warning explains *why* it is empty, so
 * the agent can tell the user "nothing is recorded" rather than guessing whether
 * something broke.
 */
export function toolEmpty<T>(reason: string, options: SuccessOptions = {}): ToolResult<T> {
  return {
    ok: true,
    data: null,
    citations: [],
    asOf: options.asOf ?? new Date().toISOString(),
    confidence: "high",
    warnings: [reason, ...(options.warnings ?? [])],
  };
}

/**
 * A tool call that failed.
 *
 * Returned to the model rather than thrown. The model is expected to tell the
 * user the lookup failed - never to fill the gap from its own memory.
 */
export function toolFailure<T>(error: ToolError, warnings: string[] = []): ToolResult<T> {
  return {
    ok: false,
    data: null,
    citations: [],
    asOf: new Date().toISOString(),
    confidence: "low",
    warnings,
    error,
  };
}

/**
 * Wraps a tool body so that an unexpected throw becomes a returned error.
 *
 * Without this, one bad query would reject the whole streamed response and the
 * user would see nothing at all. With it, the agent keeps talking and can say
 * what failed.
 */
export async function guardTool<T>(
  toolName: string,
  run: () => Promise<ToolResult<T>>,
): Promise<ToolResult<T>> {
  try {
    return await run();
  } catch (cause) {
    return toolFailure<T>({
      code: "tool_execution_failed",
      message: `${toolName} failed: ${cause instanceof Error ? cause.message : "unknown error"}`,
      // A thrown exception is usually transient (a dropped connection), so the
      // agent may reasonably offer to try again.
      retryable: true,
    });
  }
}

/**
 * Turns a repository failure into a tool error.
 *
 * Configuration problems are not retryable - retrying an unset environment
 * variable will fail identically - so the agent should say the system is
 * misconfigured rather than offering to try again.
 */
export function repositoryProblemToError(problem: {
  kind: "configuration" | "database";
  message: string;
}): ToolError {
  return {
    code: problem.kind === "configuration" ? "not_configured" : "database_unavailable",
    message: problem.message,
    retryable: problem.kind === "database",
  };
}
