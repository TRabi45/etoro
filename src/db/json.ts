import type { Json } from "@/src/db/types.generated";

/**
 * Converts a typed value into the `Json` shape the database columns accept.
 *
 * Structured domain objects - a route assessment, a set of derived ratios - are
 * genuinely JSON data once they reach a jsonb column, but TypeScript will not
 * assign an interface to `Json` because an interface has no index signature.
 *
 * The round trip is deliberate rather than a cast: it also strips `undefined`
 * properties, which `JSON.stringify` would drop anyway once the value reached
 * the wire. Doing it here means what gets typed as `Json` is genuinely what gets
 * stored, instead of asserting a shape and hoping.
 */
export function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? null)) as Json;
}
