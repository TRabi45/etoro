import type { TypedSupabaseClient } from "@/src/db/client";
import { toJson } from "@/src/db/json";
import type { RepositoryResult } from "@/src/db/repositories/result";
import { RepositoryWriteError } from "@/src/db/repositories/result";
import {
  canonicalJson,
  type CanonicalObject,
  type CanonicalValue,
} from "@/src/domain/canonical-json";
import type { ScoringConfiguration, ScoringPolicy } from "@/src/domain/scoring/types";

/**
 * Scoring-model persistence.
 *
 * A stored score points at the exact configuration row that produced it, and the
 * database locks that row the first time it is used. This module is the guard on
 * the other side of that lock: it will publish a configuration that is not yet
 * in the database, and it will return one that already matches, but it will
 * never quietly reconcile a difference.
 *
 * If the configuration in code has drifted from the stored row, that is a real
 * problem - every score already calculated under that version would silently
 * stop being reproducible - so it fails loudly and tells the operator to publish
 * a new version instead.
 */

export interface EnsureScoringModelInput {
  config: ScoringConfiguration;
  policy: ScoringPolicy;
  /** Section 27's weight governance: versioned with date, owner and rationale. */
  governance: { owner: string; rationale: string; thesisVersion: string };
}

/**
 * The parts of a configuration that must never change once a score has been
 * written against it, gathered into a comparable shape.
 *
 * The gates are in here as of v0.3. Section 28 makes a gate part of the model
 * rather than part of the code - "a high score with a hard gate remains
 * blocked" - so silently redefining one would change what a stored
 * recommendation meant.
 */
function shapeOf(input: EnsureScoringModelInput): CanonicalObject {
  return {
    dimensions: toCanonical(input.config.dimensions),
    hardGates: toCanonical(input.policy.hardGates),
    thresholds: toCanonical(input.policy.thresholds),
  };
}

/**
 * Normalises a typed configuration object into plain JSON data, matching what a
 * jsonb round trip returns, so stored and in-code configuration are compared
 * like for like.
 */
function toCanonical(value: unknown): CanonicalValue {
  return JSON.parse(JSON.stringify(value)) as CanonicalValue;
}

/**
 * Returns the id of the stored model for this path and version, publishing it
 * first if it does not exist yet.
 */
export async function ensureScoringModel(
  client: TypedSupabaseClient,
  input: EnsureScoringModelInput,
): Promise<string> {
  const version = input.config.version;
  const shape = shapeOf(input);

  const existing = await client
    .from("scoring_models")
    .select("id, dimensions, hard_gates, thresholds")
    .is("path", null)
    .eq("version", version)
    .maybeSingle();

  if (existing.error) {
    throw new RepositoryWriteError(`could not read scoring model: ${existing.error.message}`);
  }

  if (existing.data) {
    const storedShape: CanonicalObject = {
      dimensions: existing.data.dimensions as CanonicalValue,
      hardGates: existing.data.hard_gates as CanonicalValue,
      thresholds: existing.data.thresholds as CanonicalValue,
    };

    // Key order differs freely between a JS object and a jsonb round-trip, so
    // the comparison is made on a canonical form rather than raw JSON text.
    if (canonicalJson(storedShape) !== canonicalJson(shape)) {
      throw new RepositoryWriteError(
        `scoring model ${version} in the database differs from the configuration in code. ` +
          `Scores already calculated under this version would stop being reproducible. ` +
          `Publish a new version rather than editing this one.`,
      );
    }
    return existing.data.id;
  }

  // Only one global configuration may be active, so any predecessor is stood
  // down first. Deactivating a locked model is allowed; changing its weights is
  // not.
  const { error: deactivateError } = await client
    .from("scoring_models")
    .update({ is_active: false })
    .is("path", null)
    .eq("is_active", true);

  if (deactivateError) {
    throw new RepositoryWriteError(
      `could not deactivate the previous scoring model: ${deactivateError.message}`,
    );
  }

  const { data, error } = await client
    .from("scoring_models")
    .insert({
      // v0.3 is one global model; `path` belonged to the two-scorecard design.
      path: null,
      version,
      dimensions: toJson(shape.dimensions),
      hard_gates: toJson(shape.hardGates),
      thresholds: toJson(shape.thresholds),
      owner: input.governance.owner,
      rationale: input.governance.rationale,
      thesis_version: input.governance.thesisVersion,
      is_active: true,
      activated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new RepositoryWriteError(
      `could not publish scoring model ${version}: ${error?.message ?? "no row returned"}`,
    );
  }
  return data.id;
}

/**
 * The id of the currently active global scoring model, or `null` when none has
 * been published yet (a database where nothing has been scored at all).
 *
 * Every reader of "the score" has to go through this rather than sorting by
 * `calculated_at` alone. Timestamp order is not model order: a row scored under
 * a superseded model is still the newest by clock time for as long as nothing
 * has been re-scored under the version that replaced it, which is exactly how a
 * stale v0.2 row could win a "latest score" query that only orders by date.
 *
 * `path` stays null here rather than becoming a parameter - v0.3 is one global
 * model (section 26), and the per-path scorecards that would have needed one
 * are the design this replaced.
 */
export async function getActiveScoringModelId(
  client: TypedSupabaseClient,
): Promise<RepositoryResult<string | null>> {
  const { data, error } = await client
    .from("scoring_models")
    .select("id")
    .is("path", null)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return { ok: false, problem: { kind: "database", message: error.message } };
  }
  return { ok: true, data: data?.id ?? null };
}
