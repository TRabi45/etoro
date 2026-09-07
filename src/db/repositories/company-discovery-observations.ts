import type { TypedSupabaseClient } from "@/src/db/client";
import { toJson } from "@/src/db/json";
import { RepositoryWriteError } from "@/src/db/repositories/result";

/**
 * Discovery observation persistence.
 *
 * An observation records how an entity came to our attention: which source
 * reported it, under what name, when it was first and last seen. It is
 * explicitly not research evidence. Nothing here becomes a claim, a citation, a
 * score input or a verified company fact - not by being stored, and not by
 * later being associated with a company.
 *
 * Two properties shape this module:
 *
 * 1. An observation routinely exists before a canonical company does, so
 *    `companyId` is optional and resolution is an update of the same row. The
 *    provenance of the first sighting survives being resolved.
 * 2. Idempotency is only claimed where a source can actually support it. A
 *    provider that supplies a stable record ID gets de-duplicated on
 *    `(provider, sourceRecordId)`; a provider without one gets a new row per
 *    sighting, which is the honest outcome. This layer never guesses that two
 *    differently-identified records describe the same entity - no fuzzy name
 *    matching, no domain heuristics, no automatic merging.
 */

export interface DiscoveryObservation {
  id: string;
  companyId: string | null;
  provider: string;
  observedName: string;
  observedDomain: string | null;
  observedGeography: string | null;
  sourceRecordId: string | null;
  sourceUrl: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface RecordDiscoveryObservationInput {
  /** Left undefined while the observation is unresolved. */
  companyId?: string | null;
  provider: string;
  observedName: string;
  /** Observed values, never canonical conclusions about the company. */
  observedDomain?: string | null;
  observedGeography?: string | null;
  /** The source's own stable record identity, when it has one. */
  sourceRecordId?: string | null;
  sourceUrl?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Whatever the provider sent. Internal audit data, never user-facing. */
  rawMetadata?: unknown;
  agentRunId?: string | null;
}

/**
 * Records a sighting.
 *
 * With a stable `sourceRecordId` this upserts, so a provider replay updates the
 * existing row instead of accumulating duplicates. Without one it inserts,
 * because there is no honest key to merge on.
 *
 * `company_id` is deliberately left out of the payload when the caller does not
 * supply one. A replaying provider does not know what we later resolved, and
 * sending an explicit null would un-resolve a row that entity resolution had
 * already attached to a company.
 *
 * The seen-window is not clamped here. A database trigger keeps `first_seen_at`
 * at the earliest sighting and advances `last_seen_at`, so the guarantee holds
 * for every writer rather than only for callers who came through this function.
 */
export async function recordDiscoveryObservation(
  client: TypedSupabaseClient,
  input: RecordDiscoveryObservationInput,
): Promise<string> {
  const row = {
    provider: input.provider,
    observed_name: input.observedName,
    observed_domain: input.observedDomain ?? null,
    observed_geography: input.observedGeography ?? null,
    source_record_id: input.sourceRecordId ?? null,
    source_url: input.sourceUrl ?? null,
    first_seen_at: input.firstSeenAt,
    last_seen_at: input.lastSeenAt,
    raw_metadata: input.rawMetadata === undefined ? null : toJson(input.rawMetadata),
    agent_run_id: input.agentRunId ?? null,
    ...(input.companyId === undefined ? {} : { company_id: input.companyId }),
  };

  const written = input.sourceRecordId
    ? await client
        .from("company_discovery_observations")
        .upsert(row, { onConflict: "provider,source_record_id" })
        .select("id")
        .single()
    : await client.from("company_discovery_observations").insert(row).select("id").single();

  if (written.error || !written.data) {
    throw new RepositoryWriteError(
      `could not record discovery observation from ${input.provider}: ${written.error?.message ?? "no row returned"}`,
    );
  }
  return written.data.id;
}

/**
 * Attaches an observation to a canonical company.
 *
 * This is the write side of entity resolution, not the decision itself. Whoever
 * calls it has already decided the two are the same; this only persists that,
 * and it updates the existing row so the discovery provenance is preserved
 * rather than replaced by a resolved copy.
 */
export async function attachObservationToCompany(
  client: TypedSupabaseClient,
  observationId: string,
  companyId: string,
): Promise<void> {
  const { error } = await client
    .from("company_discovery_observations")
    .update({ company_id: companyId })
    .eq("id", observationId);

  if (error) {
    throw new RepositoryWriteError(
      `could not attach observation ${observationId} to company ${companyId}: ${error.message}`,
    );
  }
}

/**
 * Every sighting associated with one canonical company, oldest first.
 *
 * `raw_metadata` is not selected. Callers that need the provider payload for
 * debugging can read the column directly through the service role; it has no
 * place in a shape that could travel towards a page.
 */
export async function listDiscoveryObservationsForCompany(
  client: TypedSupabaseClient,
  companyId: string,
): Promise<DiscoveryObservation[]> {
  const { data, error } = await client
    .from("company_discovery_observations")
    .select(
      "id, company_id, provider, observed_name, observed_domain, observed_geography, source_record_id, source_url, first_seen_at, last_seen_at",
    )
    .eq("company_id", companyId)
    .order("first_seen_at", { ascending: true });

  if (error) {
    throw new RepositoryWriteError(
      `could not list discovery observations for company ${companyId}: ${error.message}`,
    );
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    companyId: row.company_id,
    provider: row.provider,
    observedName: row.observed_name,
    observedDomain: row.observed_domain,
    observedGeography: row.observed_geography,
    sourceRecordId: row.source_record_id,
    sourceUrl: row.source_url,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  }));
}
