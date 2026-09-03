/**
 * Canonical JSON: a stable serialisation where key order carries no meaning.
 *
 * Two places need this and must agree: the scoring input hash, which decides
 * whether a recalculation counts as a new score, and the scoring-model
 * comparison, which decides whether stored configuration still matches the
 * configuration in code. Both are correctness-critical, so the sorting lives in
 * one place rather than being written twice.
 */

export type CanonicalValue = string | number | boolean | null | CanonicalValue[] | CanonicalObject;

export interface CanonicalObject {
  [key: string]: CanonicalValue;
}

/** Recursively sorts object keys. Arrays keep their order, which is meaningful. */
export function canonicalize(value: CanonicalValue): CanonicalValue {
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

/** Serialises to a string that is identical for any key ordering. */
export function canonicalJson(value: CanonicalValue): string {
  return JSON.stringify(canonicalize(value));
}
