import { createHash } from "node:crypto";
import type { ScoringInput } from "@/src/domain/scoring/types";

/**
 * Deterministic input hashing for scores.
 *
 * A stored score must be reproducible, and the system must be able to tell
 * whether a recalculation actually used different inputs. The hash is taken over
 * a canonical form of the *material* inputs only:
 *
 *   - included: path, subtype, every dimension status and score, every risk
 *     component value, the evidence penalty, every hard-gate state, the
 *     resolution flags, and the route-assessment scores;
 *   - excluded: all free text (reasons, evidence notes, analyst notes) and all
 *     timestamps.
 *
 * The split is deliberate. Rewording a justification does not change the
 * arithmetic, so it must not create a new score row; changing a number or a
 * state does, so it must. Object key order is normalised, so two payloads that
 * differ only in how they were assembled hash identically.
 */

type CanonicalValue = string | number | boolean | null | CanonicalValue[] | CanonicalObject;
interface CanonicalObject {
  [key: string]: CanonicalValue;
}

/** Recursively sorts object keys so serialisation is order-independent. */
function canonicalize(value: CanonicalValue): CanonicalValue {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const sorted: CanonicalObject = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = canonicalize(value[key]);
    }
    return sorted;
  }
  return value;
}

/** Strips explanatory text, keeping only what the calculation depends on. */
export function buildCanonicalScoringPayload(input: ScoringInput): CanonicalObject {
  const dimensions: CanonicalObject = {};
  for (const key of Object.keys(input.dimensions).sort()) {
    const dimension = input.dimensions[key];
    dimensions[key] =
      dimension.status === "scored"
        ? { status: dimension.status, score: dimension.score }
        : { status: dimension.status };
  }

  const risk: CanonicalObject = {};
  for (const key of Object.keys(input.risk).sort()) {
    risk[key] = { value: input.risk[key].value };
  }

  const hardGates: CanonicalObject = {};
  for (const key of Object.keys(input.hardGates).sort()) {
    hardGates[key] = { state: input.hardGates[key].state };
  }

  return canonicalize({
    path: input.path,
    subtype: input.subtype ?? null,
    dimensions,
    risk,
    evidencePenalty: input.evidencePenalty,
    hardGates,
    resolution: {
      legalIdentity: input.resolution.legalIdentity,
      maStatus: input.resolution.maStatus,
      regulatoryPerimeter: input.resolution.regulatoryPerimeter,
    },
    routeAssessment: {
      acquire: input.routeAssessment.acquire.score,
      build: input.routeAssessment.build.score,
      partner: input.routeAssessment.partner.score,
      invest: input.routeAssessment.invest.score,
      monitor: input.routeAssessment.monitor.score,
    },
  }) as CanonicalObject;
}

/** SHA-256 of the canonical payload, hex encoded. */
export function hashScoringInput(input: ScoringInput): string {
  const payload = buildCanonicalScoringPayload(input);
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
