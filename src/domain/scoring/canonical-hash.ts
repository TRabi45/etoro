import { createHash } from "node:crypto";
import { canonicalize, type CanonicalObject } from "@/src/domain/canonical-json";
import type { ScoringInput } from "@/src/domain/scoring/types";

/**
 * A stable fingerprint of the inputs a score was calculated from.
 *
 * Two jobs. A stored score must be reproducible, and the system must be able to
 * tell whether a recalculation used different inputs or merely ran again - which
 * is what keeps `scores` from filling with identical rows every time the
 * pipeline touches a company.
 *
 * ## What is hashed
 *
 * Every value that changes the arithmetic: each sub-metric's status and, when
 * scored, its score; each hard gate's state; each route's score. Nothing else.
 *
 * ## What is not, and why
 *
 * All free text - the reason behind a sub-metric score, the evidence behind a
 * gate, the rationale for a route, the analyst's notes. Rewording a
 * justification does not change the number, so it must not create a new score
 * row. Changing a number or a state does, so it must.
 *
 * Timestamps are excluded for the same reason: when a score was calculated is a
 * fact about the run, not about the inputs.
 *
 * Object key order is normalised before hashing, so two payloads that differ
 * only in how they were assembled produce the same digest.
 */
export function hashScoringInput(input: ScoringInput): string {
  const subMetrics: CanonicalObject = {};
  for (const key of Object.keys(input.subMetrics).sort()) {
    const supplied = input.subMetrics[key];
    subMetrics[key] =
      supplied.status === "scored"
        ? { status: supplied.status, score: supplied.score ?? null }
        : { status: supplied.status };
  }

  const hardGates: CanonicalObject = {};
  for (const key of Object.keys(input.hardGates).sort()) {
    hardGates[key] = { state: input.hardGates[key].state };
  }

  const routes: CanonicalObject = {};
  for (const key of Object.keys(input.routes).sort()) {
    const route = input.routes[key as keyof typeof input.routes];
    if (route) {
      routes[key] = { score: route.score };
    }
  }

  const payload = canonicalize({ subMetrics, hardGates, routes });
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
