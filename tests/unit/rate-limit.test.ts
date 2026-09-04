import { beforeEach, describe, expect, it } from "vitest";
import {
  checkRateLimit,
  clientAddress,
  resetRateLimits,
  type RateLimitRule,
} from "@/src/server/rate-limit";

const RULE: RateLimitRule = { limit: 3, windowMs: 60_000 };

beforeEach(() => {
  resetRateLimits();
});

describe("checkRateLimit", () => {
  it("allows requests up to the limit and then refuses", () => {
    const start = 1_000_000;
    expect(checkRateLimit("k", RULE, start).allowed).toBe(true);
    expect(checkRateLimit("k", RULE, start + 1).allowed).toBe(true);
    expect(checkRateLimit("k", RULE, start + 2).allowed).toBe(true);

    const blocked = checkRateLimit("k", RULE, start + 3);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("says how long to wait, measured from the oldest request in the window", () => {
    const start = 1_000_000;
    for (let index = 0; index < RULE.limit; index += 1) {
      checkRateLimit("k", RULE, start);
    }

    // 30s into a 60s window, the oldest hit leaves in another 30s.
    const blocked = checkRateLimit("k", RULE, start + 30_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(30);
  });

  it("lets the caller through again once the window has passed", () => {
    const start = 1_000_000;
    for (let index = 0; index < RULE.limit; index += 1) {
      checkRateLimit("k", RULE, start);
    }
    expect(checkRateLimit("k", RULE, start + 1).allowed).toBe(false);
    expect(checkRateLimit("k", RULE, start + RULE.windowMs + 1).allowed).toBe(true);
  });

  it("counts each key separately", () => {
    const start = 1_000_000;
    for (let index = 0; index < RULE.limit; index += 1) {
      checkRateLimit("noisy", RULE, start);
    }
    // One client exhausting its budget must not lock out everyone else.
    expect(checkRateLimit("noisy", RULE, start).allowed).toBe(false);
    expect(checkRateLimit("quiet", RULE, start).allowed).toBe(true);
  });

  it("never reports a retry-after of zero while blocked", () => {
    const start = 1_000_000;
    for (let index = 0; index < RULE.limit; index += 1) {
      checkRateLimit("k", RULE, start);
    }
    // At the very end of the window the remaining wait rounds towards nothing;
    // a Retry-After of 0 would invite an immediate retry that fails again.
    const blocked = checkRateLimit("k", RULE, start + RULE.windowMs - 1);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});

describe("clientAddress", () => {
  it("takes the first hop of x-forwarded-for", () => {
    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "203.0.113.7, 70.41.3.18" },
    });
    expect(clientAddress(request)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then to a constant", () => {
    expect(
      clientAddress(
        new Request("https://example.com", { headers: { "x-real-ip": "198.51.100.4" } }),
      ),
    ).toBe("198.51.100.4");
    expect(clientAddress(new Request("https://example.com"))).toBe("unknown");
  });
});
