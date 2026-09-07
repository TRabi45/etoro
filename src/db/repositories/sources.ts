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
  if (input.contentHash && input.researchCompanyId) {
    const byContent = await client
      .from("sources")
      .select("id")
      .eq("content_hash", input.contentHash)
      .eq("research_company_id", input.researchCompanyId)
      .maybeSingle();

    if (byContent.error) {
      throw new RepositoryWriteError(
        `could not read source content hash: ${byContent.error.message}`,
      );
    }
    if (byContent.data) {
      return byContent.data.id;
    }
  }

  const existing = await client
    .from("sources")
    .select("id")
    .eq("url_normalized", input.urlNormalized)
    .maybeSingle();

  if (existing.error) {
    throw new RepositoryWriteError(`could not read source: ${existing.error.message}`);
  }
  if (existing.data) {
    return existing.data.id;
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
