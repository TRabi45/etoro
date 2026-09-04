/**
 * A small in-process rate limiter for the chat endpoint.
 *
 * The endpoint spends money on every call: each request can run up to eight
 * model round trips against a paid API. Without a limit, anyone who can reach
 * the deployment can drain the account, and a single runaway client can do it by
 * accident.
 *
 * Deliberately in-memory. A shared store (Redis, Upstash) survives restarts and
 * coordinates across instances, and this does neither - on a multi-instance
 * deployment the effective limit is the configured limit times the number of
 * instances. That is a real weakness and it is still the right trade here: the
 * MVP runs as a single instance, an in-memory counter has no new infrastructure,
 * no new failure mode and no new secret, and it turns "unlimited" into "bounded",
 * which is the whole difference that matters. Swapping the store later means
 * replacing this file, not the call sites.
 */

export interface RateLimitRule {
  /** How many requests are allowed inside the window. */
  limit: number;
  windowMs: number;
}

export interface RateLimitVerdict {
  allowed: boolean;
  /** How long the caller should wait, for the `Retry-After` header. */
  retryAfterSeconds: number;
  remaining: number;
}

/** Requests per client address. Generous for a human, useless for a script. */
export const CHAT_IP_RULE: RateLimitRule = { limit: 20, windowMs: 5 * 60 * 1000 };

/** A second, tighter bound per conversation, so one open tab cannot loop. */
export const CHAT_SESSION_RULE: RateLimitRule = { limit: 12, windowMs: 60 * 1000 };

/**
 * The longest question accepted.
 *
 * A very long message is either a mistake or an attempt to push the system
 * prompt out of the model's attention, and neither deserves a paid round trip.
 */
export const MAX_QUESTION_LENGTH = 4000;

const hits = new Map<string, number[]>();

/**
 * Stops the map growing without bound when many keys are seen once each.
 *
 * Called on every check, but only does work once the map is large, so the common
 * path stays cheap.
 */
const MAX_TRACKED_KEYS = 5000;

function evictIfCrowded(now: number): void {
  if (hits.size <= MAX_TRACKED_KEYS) {
    return;
  }
  for (const [key, timestamps] of hits) {
    // A key whose most recent hit is older than the longest window can never
    // block anything again.
    const newest = timestamps[timestamps.length - 1] ?? 0;
    if (now - newest > CHAT_IP_RULE.windowMs) {
      hits.delete(key);
    }
  }
}

/**
 * Records one request and says whether it is allowed.
 *
 * `now` is a parameter so the behaviour at a window boundary can be tested
 * without sleeping.
 */
export function checkRateLimit(
  key: string,
  rule: RateLimitRule,
  now: number = Date.now(),
): RateLimitVerdict {
  evictIfCrowded(now);

  const cutoff = now - rule.windowMs;
  const recent = (hits.get(key) ?? []).filter((timestamp) => timestamp > cutoff);

  if (recent.length >= rule.limit) {
    hits.set(key, recent);
    const oldest = recent[0] ?? now;
    return {
      allowed: false,
      // When the oldest hit leaves the window there is room again.
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000)),
      remaining: 0,
    };
  }

  recent.push(now);
  hits.set(key, recent);
  return { allowed: true, retryAfterSeconds: 0, remaining: rule.limit - recent.length };
}

/** Test seam: forgets every recorded request. */
export function resetRateLimits(): void {
  hits.clear();
}

/**
 * Best-effort client address.
 *
 * `x-forwarded-for` is set by the platform's proxy and can be spoofed when the
 * app is reachable directly, so this identifies a caller rather than
 * authenticating one. It is the correct input for a throttle and would be the
 * wrong input for an access decision.
 */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
