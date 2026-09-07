import type { TypedSupabaseClient } from "@/src/db/client";
import { RepositoryWriteError } from "@/src/db/repositories/result";
import type { SourceTrustTier, SourceType } from "@/src/config/taxonomy";

/**
 * Source persistence.
 *
 * Sources are deduplicated by their normalized URL - a single article reached
 * through a tracking link or a mirror must not look like independent
 * corroboration merely because it has a second spelling - and, within one
 * company's research, by retrieved content hash as well.
 *
 * Content-hash de-duplication is deliberately *not* global. The hash is taken
 * over extracted page text, so two unrelated companies publishing identical
 * boilerplate would otherwise collapse into one row and the second company's
 * evidence would silently attach to the first company's source.
 */

export interface UpsertSourceInput {
  url: string;
  urlNormalized: string;
  title: string | null;
  publisher: string | null;
  sourceType: SourceType;
  /** A property of the publisher, never of the extraction. */
  trustTier: SourceTrustTier;
  /** When the source was published - distinct from when a fact is true. */
  publishedAt: string | null;
  contentHash?: string | null;
  /**
   * The company this document was fetched *for* during a company-specific
   * research pass. Left undefined by the feed pipeline, whose articles are
   * shared across whichever companies they turn out to mention.
   */
  researchCompanyId?: string | null;
  agentRunId: string;
}

/**
 * Inserts a source, or returns the existing row if this URL - or, within the
 * same company's research, this exact body - has been seen before. Re-running
 * the pipeline must not multiply sources.
 */
export async function upsertSource(
  client: TypedSupabaseClient,
  input: UpsertSourceInput,
): Promise<string> {
  async function reuseExisting(existing: {
    id: string;
    agent_runs: { is_stub: boolean } | null;
  }): Promise<string> {
    if (existing.agent_runs?.is_stub === false) {
      return existing.id;
    }

    const incomingRun = await client
      .from("agent_runs")
      .select("is_stub")
      .eq("id", input.agentRunId)
      .single();
    if (incomingRun.error || !incomingRun.data) {
      throw new RepositoryWriteError(
        `could not verify source run provenance: ${incomingRun.error?.message ?? "no row returned"}`,
      );
    }
    if (incomingRun.data.is_stub) {
      return existing.id;
    }

    // URL/content de-duplication can find a source that was first introduced
    // by a synthetic fixture. A real retrieval establishes the source for
    // production use, so refresh its metadata and provenance in place. Stub
    // runs never take the reverse path and can never replace a real source.
    const promoted = await client
      .from("sources")
      .update({
        url: input.url,
        url_normalized: input.urlNormalized,
        title: input.title,
        publisher: input.publisher,
        source_type: input.sourceType,
        trust_tier: input.trustTier,
        published_at: input.publishedAt,
        accessed_at: new Date().toISOString(),
        content_hash: input.contentHash ?? null,
        research_company_id: input.researchCompanyId ?? null,
        agent_run_id: input.agentRunId,
      })
      .eq("id", existing.id);
    if (promoted.error) {
      throw new RepositoryWriteError(
        `could not promote source ${input.urlNormalized}: ${promoted.error.message}`,
      );
    }
    return existing.id;
  }

  if (input.contentHash && input.researchCompanyId) {
    const byContent = await client
      .from("sources")
      .select("id, agent_runs(is_stub)")
      .eq("content_hash", input.contentHash)
      .eq("research_company_id", input.researchCompanyId)
      .maybeSingle();

    if (byContent.error) {
      throw new RepositoryWriteError(
        `could not read source content hash: ${byContent.error.message}`,
      );
    }
    if (byContent.data) {
      return reuseExisting(byContent.data);
    }
  }

  const existing = await client
    .from("sources")
    .select("id, agent_runs(is_stub)")
    .eq("url_normalized", input.urlNormalized)
    .maybeSingle();

  if (existing.error) {
    throw new RepositoryWriteError(`could not read source: ${existing.error.message}`);
  }
  if (existing.data) {
    return reuseExisting(existing.data);
  }

  const { data, error } = await client
    .from("sources")
    .insert({
      url: input.url,
      url_normalized: input.urlNormalized,
      title: input.title,
      publisher: input.publisher,
      source_type: input.sourceType,
      trust_tier: input.trustTier,
      published_at: input.publishedAt,
      content_hash: input.contentHash ?? null,
      research_company_id: input.researchCompanyId ?? null,
      agent_run_id: input.agentRunId,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new RepositoryWriteError(
      `could not insert source ${input.urlNormalized}: ${error?.message ?? "no row returned"}`,
    );
  }
  return data.id;
}
