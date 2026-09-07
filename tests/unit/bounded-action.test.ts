import { describe, expect, it } from "vitest";
import { classifyFailure, unreachableFailure } from "@/components/shell/bounded-action";

/**
 * How a refused expensive action is reported.
 *
 * These tests exist because the first implementation got it wrong in a way that
 * only showed up in the running product: it branched on 401/403 for "the
 * operator secret is not configured", but `authorizeOperatorRequest` returns
 * **503** for that case. The unconfigured deployment therefore fell through to
 * the generic 5xx branch and was offered a "Try again" button that could never
 * succeed.
 *
 * The property worth protecting is narrow and testable: a refusal caused by
 * server configuration must never be retryable.
 */

function response(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

describe("classifyFailure", () => {
  it("treats an unconfigured operator secret as a permission fact, not a retryable error", () => {
    // The regression. This arrives as 503, not 4xx.
    const refusal = classifyFailure(
      response(503),
      {
        error: {
          code: "operator_secret_unconfigured",
          message: "Monitoring execution is disabled.",
        },
      },
      "run",
    );

    expect(refusal.retryable).toBe(false);
    expect(refusal.title).toMatch(/disabled on this deployment/i);
    // The server's own wording is preserved rather than replaced.
    expect(refusal.message).toBe("Monitoring execution is disabled.");
  });

  it("treats a missing model provider the same way, though it shares the 503 status", () => {
    const refusal = classifyFailure(response(503), { error: { code: "ai_not_configured" } }, "run");

    expect(refusal.retryable).toBe(false);
    expect(refusal.title).toMatch(/no model is configured/i);
  });

  it("does not offer a retry for an unauthorised caller", () => {
    const refusal = classifyFailure(
      response(401),
      { error: { code: "operator_unauthorized" } },
      "refresh",
    );
    expect(refusal.retryable).toBe(false);
  });

  it("withholds the retry while rate limited and states the wait instead", () => {
    const refusal = classifyFailure(
      response(429, { "retry-after": "600" }),
      { error: { code: "rate_limited" } },
      "run",
    );

    expect(refusal.retryable).toBe(false);
    expect(refusal.message).toContain("10 minutes");
  });

  it("rounds a sub-minute wait up to one minute rather than saying zero", () => {
    const refusal = classifyFailure(response(429, { "retry-after": "20" }), null, "run");
    expect(refusal.message).toContain("1 minute");
    expect(refusal.message).not.toContain("0 minutes");
  });

  it("does not retry a rejected request, which is a defect rather than a blip", () => {
    const refusal = classifyFailure(
      response(400),
      { error: { code: "invalid_request", message: "maxSources must be an integer." } },
      "run",
    );
    expect(refusal.retryable).toBe(false);
  });

  it("offers a retry only for a genuine server failure", () => {
    const refusal = classifyFailure(
      response(500),
      { error: { code: "run_failed", message: "The monitoring run could not start." } },
      "run",
    );
    expect(refusal.retryable).toBe(true);
  });

  it("still classifies a response that carries no parseable body", () => {
    // A proxy or a crash can return 503 with no JSON at all. Falling back to
    // the status is right here, and a 5xx with no code may genuinely be
    // transient.
    const refusal = classifyFailure(response(503), null, "run");
    expect(refusal.title).toBeTruthy();
    expect(refusal.message).toBeTruthy();
    expect(refusal.retryable).toBe(true);
  });

  it("words the refusal for the control that raised it", () => {
    const run = classifyFailure(response(429, { "retry-after": "60" }), null, "run");
    const refresh = classifyFailure(response(429, { "retry-after": "60" }), null, "refresh");

    expect(run.title).toMatch(/run/i);
    expect(refresh.title).toMatch(/research pass/i);
  });
});

describe("unreachableFailure", () => {
  it("is retryable, and refuses to claim nothing was fetched", () => {
    // The request never completed, so whether work started is genuinely
    // unknown - saying "nothing happened" would be a guess.
    const refusal = unreachableFailure("run");
    expect(refusal.retryable).toBe(true);
    expect(refusal.message).toMatch(/unknown whether/i);
  });
});
