import { describe, expect, it } from "vitest";
import {
  guardTool,
  repositoryProblemToError,
  toolEmpty,
  toolFailure,
  toolSuccess,
} from "@/src/ai/tools/envelope";

/**
 * The envelope is the mechanism that keeps the agent honest. These tests pin the
 * distinctions it exists to make: found versus empty versus failed, and the
 * guarantee that a thrown exception never escapes to kill a streamed answer.
 */
describe("tool envelope", () => {
  it("marks a successful lookup and carries its citations", () => {
    const result = toolSuccess({ value: 1 }, { confidence: "high", asOf: "2026-09-03" });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ value: 1 });
    expect(result.confidence).toBe("high");
    expect(result.asOf).toBe("2026-09-03");
    expect(result.error).toBeUndefined();
  });

  it("treats an empty result as a successful answer, not a failure", () => {
    // "Nothing is recorded" is a true statement about the world. Marking it
    // ok:false would invite the agent to treat it as a glitch and fall back on
    // its own recollection.
    const result = toolEmpty("No companies match those filters.");
    expect(result.ok).toBe(true);
    expect(result.data).toBeNull();
    expect(result.warnings).toContain("No companies match those filters.");
    expect(result.error).toBeUndefined();
  });

  it("returns a failure as data rather than throwing", () => {
    const result = toolFailure({
      code: "database_unavailable",
      message: "connection refused",
      retryable: true,
    });
    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error?.retryable).toBe(true);
    expect(result.confidence).toBe("low");
  });

  it("converts a thrown exception into an error envelope", async () => {
    // Without this, one failed query would reject the whole streamed response
    // and the user would see nothing at all.
    const result = await guardTool("explain_score", async () => {
      throw new Error("relation does not exist");
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("tool_execution_failed");
    expect(result.error?.message).toContain("explain_score");
    expect(result.error?.message).toContain("relation does not exist");
    expect(result.error?.retryable).toBe(true);
  });

  it("passes a normal result through the guard untouched", async () => {
    const result = await guardTool("get_market_map", async () => toolSuccess({ total: 6 }));
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ total: 6 });
  });

  it("marks configuration problems as not retryable and database problems as retryable", () => {
    // Retrying an unset environment variable fails identically, so the agent
    // should report misconfiguration rather than offering to try again.
    expect(
      repositoryProblemToError({ kind: "configuration", message: "missing key" }),
    ).toMatchObject({ code: "not_configured", retryable: false });

    expect(repositoryProblemToError({ kind: "database", message: "timeout" })).toMatchObject({
      code: "database_unavailable",
      retryable: true,
    });
  });
});
