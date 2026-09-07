import { z } from "zod";
import { checkAiConfigured } from "@/src/ai/provider-adapter";
import { researchCompany } from "@/src/research/pipeline/company-research";
import { checkRateLimit, clientAddress, MONITOR_RUN_RULE } from "@/src/server/rate-limit";
import { authorizeOperatorRequest } from "@/src/server/operator-auth";

/**
 * A bounded, company-specific research pass.
 *
 * The profile's refresh action. It follows the same discipline as the
 * monitoring trigger and for the same reason: this is expensive work - a source
 * plan, several fetches and a model call - so it waits for the pipeline and
 * reports what actually happened rather than returning 202 and describing work
 * that may never finish.
 *
 * The one addition over the monitoring route is that a refresh is idempotent
 * per company per day by default. Refreshing the same company twice in an
 * afternoon joins the existing run instead of re-spending the source budget on
 * evidence that has not changed since lunchtime.
 */

export const maxDuration = 300;

const slugSchema = z.string().regex(/^[a-z0-9-]{1,80}$/);

function jsonError(status: number, code: string, message: string, headers?: HeadersInit): Response {
  return Response.json({ error: { code, message } }, { status, headers });
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/companies/[slug]/refresh">,
) {
  const authorization = authorizeOperatorRequest(request);
  if (!authorization.ok) {
    return jsonError(
      authorization.status,
      authorization.code,
      authorization.code === "operator_secret_unconfigured"
        ? "Company refresh is disabled until MA_OPERATOR_SECRET is configured on the server."
        : "This endpoint requires internal operator authorization.",
    );
  }

  const { slug: rawSlug } = await context.params;
  const slug = slugSchema.safeParse(rawSlug);
  if (!slug.success) {
    return jsonError(400, "invalid_slug", "That is not a valid company slug.");
  }

  // Throttled per client, before any work is planned. Refreshing a company is
  // the second most expensive thing this application does.
  const verdict = checkRateLimit(`refresh:${clientAddress(request)}`, MONITOR_RUN_RULE);
  if (!verdict.allowed) {
    return jsonError(429, "rate_limited", "A research pass was started recently.", {
      "retry-after": String(verdict.retryAfterSeconds),
    });
  }

  // Extraction needs a model. Refusing up front beats discovering it per source
  // and returning a report whose every warning says the same thing.
  const aiConfig = checkAiConfigured();
  if (!aiConfig.ok) {
    return jsonError(503, "ai_not_configured", aiConfig.problem.message);
  }

  try {
    const report = await researchCompany({ slug: slug.data, trigger: "manual" });
    // 200 even for a partial pass: the run completed and wrote data. A failure
    // status would suggest nothing was persisted, which is wrong and would
    // invite a retry that re-spends the budget.
    return Response.json(report, { status: 200 });
  } catch (cause) {
    return jsonError(
      500,
      "refresh_failed",
      cause instanceof Error ? cause.message : "The research pass could not start.",
    );
  }
}
