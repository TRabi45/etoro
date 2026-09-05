import { z } from "zod";
import { checkAiConfigured } from "@/src/ai/provider-adapter";
import { DEFAULT_MAX_SOURCES, runMonitoringPass } from "@/src/research/pipeline/runner";
import { checkRateLimit, clientAddress, MONITOR_RUN_RULE } from "@/src/server/rate-limit";

/**
 * Manual monitoring trigger.
 *
 * ## Why this waits instead of replying immediately
 *
 * The tempting shape is to return `202 Accepted` with a run id and continue in
 * the background. On this deployment target that would be a lie: the serverless
 * function is frozen the moment it returns a response, so the "background" work
 * would stop mid-fetch, leaving a `monitoring_runs` row stuck at `running`
 * forever and a dashboard reporting progress that is not happening.
 *
 * So the run is bounded instead of detached. A small number of sources, a
 * per-source timeout, and a response that reports what actually happened. An
 * honest thirty-second wait is worth more than an instant reply describing work
 * that will never finish.
 *
 * The run is idempotent per key, so a double-click or a retried request joins the
 * existing run rather than starting a second one.
 */

export const maxDuration = 300;

const requestSchema = z.object({
  /** Bounded well below the ceiling so a manual run stays interactive. */
  maxSources: z.number().int().min(1).max(DEFAULT_MAX_SOURCES).optional(),
  idempotencyKey: z.string().min(8).max(200).optional(),
});

function jsonError(status: number, code: string, message: string, headers?: HeadersInit): Response {
  return Response.json({ error: { code, message } }, { status, headers });
}

export async function POST(request: Request): Promise<Response> {
  // A monitoring run is the most expensive thing this application does: several
  // fetches plus a model call per document. Throttled hard, and before anything
  // else happens.
  const verdict = checkRateLimit(`monitor:${clientAddress(request)}`, MONITOR_RUN_RULE);
  if (!verdict.allowed) {
    return jsonError(429, "rate_limited", "A monitoring run was started recently.", {
      "retry-after": String(verdict.retryAfterSeconds),
    });
  }

  let body: unknown = {};
  if (request.headers.get("content-length") !== "0") {
    try {
      body = await request.json();
    } catch {
      // An empty or unparseable body means "run with defaults", which is the
      // common case from a button.
      body = {};
    }
  }

  const parsed = requestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return jsonError(400, "invalid_request", parsed.error.issues[0]?.message ?? "Invalid request.");
  }

  // Extraction needs a model. Refusing up front is better than discovering it
  // per source and reporting a run whose every warning says the same thing.
  const aiConfig = checkAiConfigured();
  if (!aiConfig.ok) {
    return jsonError(503, "ai_not_configured", aiConfig.problem.message);
  }

  try {
    const report = await runMonitoringPass({
      trigger: "manual",
      maxSources: parsed.data.maxSources ?? DEFAULT_MAX_SOURCES,
      idempotencyKey: parsed.data.idempotencyKey,
    });

    // 200 even for `partial_success`: the run completed and produced data. A
    // failure status here would suggest nothing was written, which is wrong and
    // would invite a pointless retry.
    return Response.json(report, { status: 200 });
  } catch (cause) {
    return jsonError(
      500,
      "run_failed",
      cause instanceof Error ? cause.message : "The monitoring run could not start.",
    );
  }
}
