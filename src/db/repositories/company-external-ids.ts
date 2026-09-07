import type { TypedSupabaseClient } from "@/src/db/client";
import { RepositoryWriteError } from "@/src/db/repositories/result";

/**
 * External identifier persistence.
 *
 * An external identifier answers "which record in someone else's registry is
 * this company" - a Wikidata QID, an LEI, a companies-house number. The
 * provider namespace is open text on purpose, because Universe expansion will
 * add registries this module was never told about.
 *
 * One rule dominates the API: a provider identity resolves to at most one
 * canonical company, and this layer will never move it. `upsert` here means
 * "record it once, idempotently", not "overwrite whoever holds it". A blind
 * `ON CONFLICT DO UPDATE` would silently reassign an identity from one company
 * to another and look exactly like a successful write, which is how two
 * different companies quietly become one. Merging companies is an entity
 * resolution decision; it is not something a write helper gets to do.
 */

export interface CompanyExternalId {
  id: string;
  companyId: string;
  provider: string;
  externalId: string;
}

export interface UpsertCompanyExternalIdInput {
  companyId: string;
  provider: string;
  externalId: string;
  /** Run provenance, when a pipeline rather than a seed recorded this. */
  agentRunId?: string | null;
}

/**
 * Records an external identifier, or returns the existing row when the same
 * company already holds it. Re-running a provider pass must not multiply rows.
 *
 * Throws when the identity is already held by a *different* company. The
 * read-then-insert below is not a lock, and it does not need to be: the unique
 * index on `(provider, external_id)` is the actual guarantee, so a concurrent
 * writer loses with a constraint violation rather than by overwriting.
 */
export async function upsertCompanyExternalId(
  client: TypedSupabaseClient,
  input: UpsertCompanyExternalIdInput,
): Promise<string> {
  const existing = await client
    .from("company_external_ids")
    .select("id, company_id")
    .eq("provider", input.provider)
    .eq("external_id", input.externalId)
    .maybeSingle();

  if (existing.error) {
    throw new RepositoryWriteError(
      `could not read external identifier ${input.provider}:${input.externalId}: ${existing.error.message}`,
    );
  }

  if (existing.data) {
    if (existing.data.company_id !== input.companyId) {
      throw new RepositoryWriteError(
        `external identifier ${input.provider}:${input.externalId} already resolves to company ${existing.data.company_id}; refusing to reassign it to ${input.companyId}`,
      );
    }
    return existing.data.id;
  }

  const { data, error } = await client
    .from("company_external_ids")
    .insert({
      company_id: input.companyId,
      provider: input.provider,
      external_id: input.externalId,
      agent_run_id: input.agentRunId ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new RepositoryWriteError(
      `could not insert external identifier ${input.provider}:${input.externalId}: ${error?.message ?? "no row returned"}`,
    );
  }
  return data.id;
}

/** Every external identity recorded for one canonical company. */
export async function listCompanyExternalIds(
  client: TypedSupabaseClient,
  companyId: string,
): Promise<CompanyExternalId[]> {
  const { data, error } = await client
    .from("company_external_ids")
    .select("id, company_id, provider, external_id")
    .eq("company_id", companyId)
    .order("provider", { ascending: true })
    .order("external_id", { ascending: true });

  if (error) {
    throw new RepositoryWriteError(
      `could not list external identifiers for company ${companyId}: ${error.message}`,
    );
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    companyId: row.company_id,
    provider: row.provider,
    externalId: row.external_id,
  }));
}

/**
 * Resolves a canonical company from a provider identity, or null when nothing
 * has claimed it. Null is a real answer - it is what an unresolved provider
 * record looks like - and callers must not read it as "create a company".
 */
export async function findCompanyIdByExternalId(
  client: TypedSupabaseClient,
  provider: string,
  externalId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("company_external_ids")
    .select("company_id")
    .eq("provider", provider)
    .eq("external_id", externalId)
    .maybeSingle();

  if (error) {
    throw new RepositoryWriteError(
      `could not resolve external identifier ${provider}:${externalId}: ${error.message}`,
    );
  }
  return data?.company_id ?? null;
}
