import { describe, expect, it } from "vitest";
import { authorizeOperatorRequest, OPERATOR_SECRET_HEADER } from "@/src/server/operator-auth";

describe("operator execution authorization", () => {
  it("fails closed when the server secret is absent", () => {
    expect(authorizeOperatorRequest(new Request("https://example.test"), {})).toEqual({
      ok: false,
      status: 503,
      code: "operator_secret_unconfigured",
    });
  });

  it("rejects absent or incorrect credentials", () => {
    const env = { MA_OPERATOR_SECRET: "correct-secret" };
    expect(authorizeOperatorRequest(new Request("https://example.test"), env)).toMatchObject({
      ok: false,
      status: 401,
    });
    expect(
      authorizeOperatorRequest(
        new Request("https://example.test", {
          headers: { [OPERATOR_SECRET_HEADER]: "wrong-secret" },
        }),
        env,
      ),
    ).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects a secret of a different length the same way as a wrong one", () => {
    // Regression: comparing raw bytes forces an early length check, which
    // makes the endpoint an oracle for the secret's length.
    expect(
      authorizeOperatorRequest(
        new Request("https://example.test", { headers: { [OPERATOR_SECRET_HEADER]: "short" } }),
        { MA_OPERATOR_SECRET: "a-considerably-longer-secret" },
      ),
    ).toEqual({ ok: false, status: 401, code: "operator_unauthorized" });
  });

  it("accepts the configured internal secret", () => {
    expect(
      authorizeOperatorRequest(
        new Request("https://example.test", {
          headers: { [OPERATOR_SECRET_HEADER]: "correct-secret" },
        }),
        { MA_OPERATOR_SECRET: "correct-secret" },
      ),
    ).toEqual({ ok: true });
  });
});
