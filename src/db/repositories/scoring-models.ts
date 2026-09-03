import type { TypedSupabaseClient } from "@/src/db/client";
import { toJson } from "@/src/db/json";
import { RepositoryWriteError } from "@/src/db/repositories/result";
import {
  canonicalJson,
  type CanonicalObject,
  type CanonicalValue,
} from "@/src/domain/canonical-json";
import type { ScorablePath } from "@/src/config/taxonomy";
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
}

/**
 * The four parts of a configuration that must never change once a score has
 * been written against it, gathered into a comparable shape.
 */
function shapeOf(input: EnsureScoringModelInput): CanonicalObject {
  return {
    dimensions: toCanonical(input.config.dimensions),
    riskComponents: toCanonical(input.policy.riskComponents),
    evidenceBands: toCanonical(input.policy.evidenceBands),
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
  const path: ScorablePath = input.config.path;
  const version = input.config.version;
  const shape = shapeOf(input);

  const existing = await client
    .from("scoring_models")
    .select("id, dimensions, risk_components, evidence_bands, thresholds")
    .eq("path", path)
    .eq("version", version)
    .maybeSingle();

  if (existing.error) {
    throw new RepositoryWriteError(`could not read scoring model: ${existing.error.message}`);
  }

  if (existing.data) {
    const storedShape: CanonicalObject = {
      dimensions: existing.data.dimensions as CanonicalValue,
      riskComponents: existing.data.risk_components as CanonicalValue,
      evidenceBands: existing.data.evidence_bands as CanonicalValue,
      thresholds: existing.data.thresholds as CanonicalValue,
    };

    // Key order differs freely between a JS object and a jsonb round-trip, so
    // the comparison is made on a canonical form rather than raw JSON text.
    if (canonicalJson(storedShape) !== canonicalJson(shape)) {
      throw new RepositoryWriteError(
        `scoring model ${path}/${version} in the database differs from the configuration in code. ` +
          `Scores already calculated under this version would stop being reproducible. ` +
          `Publish a new version rather than editing this one.`,
      );
    }
    return existing.data.id;
  }

  // Only one configuration per path may be active, so any predecessor is stood
  // down first. Deactivating a locked model is allowed; changing its weights is
  // not.
  const { error: deactivateError } = await client
    .from("scoring_models")
    .update({ is_active: false })
    .eq("path", path)
    .eq("is_active", true);

  if (deactivateError) {
    throw new RepositoryWriteError(
      `could not deactivate the previous scoring model: ${deactivateError.message}`,
    );
  }

  const { data, error } = await client
    .from("scoring_models")
    .insert({
      path,
      version,
      dimensions: toJson(shape.dimensions),
      risk_components: toJson(shape.riskComponents),
      evidence_bands: toJson(shape.evidenceBands),
      thresholds: toJson(shape.thresholds),
      is_active: true,
      activated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new RepositoryWriteError(
      `could not publish scoring model ${path}/${version}: ${error?.message ?? "no row returned"}`,
    );
  }
  return data.id;
}
