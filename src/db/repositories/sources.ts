import type { TypedSupabaseClient } from "@/src/db/client";
import { RepositoryWriteError } from "@/src/db/repositories/result";
import type { SourceTrustTier, SourceType } from "@/src/config/taxonomy";

/**
 * Source persistence.
 *
 * Sources are deduplicated on their normalized URL, so the same article reached
 * through two different tracking links is one row with one identity - which is
 * what stops a single report from looking like independent corroboration.
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
  agentRunId: string;
}

/**
 * Inserts a source, or returns the existing row if this URL has been seen
 * before. Re-running the pipeline must not multiply sources.
 */
export async function upsertSource(
  client: TypedSupabaseClient,
  input: UpsertSourceInput,
): Promise<string> {
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
