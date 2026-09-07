import type { TypedSupabaseClient } from "@/src/db/client";
import { RepositoryWriteError } from "@/src/db/repositories/result";

/**
 * Read-only context a company-research run needs before it can plan sources:
 * the exact identity fields, and what is already on file. Kept separate from
 * `company-profile.ts` (the UI's read model) because this shape is for a
 * planner, not a page - it has no evidence packet, no citations, no shaping.
 */

export interface CompanyResearchIdentity {
  id: string;
  slug: string;
  canonicalName: string;
  legalEntityName: string | null;
  primaryDomain: string | null;
  entityRole: string;
}

export async function getCompanyResearchIdentity(
  client: TypedSupabaseClient,
  slug: string,
): Promise<CompanyResearchIdentity | null> {
  const { data, error } = await client
    .from("companies")
    .select("id, slug, canonical_name, legal_entity_name, primary_domain, entity_role")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new RepositoryWriteError(`could not read company "${slug}": ${error.message}`);
  }
  if (!data) {
    return null;
  }

  return {
    id: data.id,
    slug: data.slug,
    canonicalName: data.canonical_name,
    legalEntityName: data.legal_entity_name,
    primaryDomain: data.primary_domain,
    entityRole: data.entity_role,
  };
}

export interface CompanySearchLeadRow {
  label: string;
  query: string | null;
}

/**
 * URLs/content hashes already linked to a stored claim for this company, and
 * the search leads recorded for it. Content hashes make a fresh retrieval of
 * the same evidence an auditable no-op rather than a duplicate assessment.
 */
export async function getCompanyResearchContext(
  client: TypedSupabaseClient,
  companyId: string,
): Promise<{
  existingEvidenceUrls: string[];
  existingEvidenceContentHashes: string[];
  searchLeads: CompanySearchLeadRow[];
}> {
  const [claimSources, searchLeads] = await Promise.all([
    client
      .from("claims")
      .select("claim_sources(sources(url, content_hash))")
      .eq("company_id", companyId),
    client.from("company_search_leads").select("label, query").eq("company_id", companyId),
  ]);

  if (claimSources.error) {
    throw new RepositoryWriteError(
      `could not read existing evidence for company ${companyId}: ${claimSources.error.message}`,
    );
  }
  if (searchLeads.error) {
    throw new RepositoryWriteError(
      `could not read search leads for company ${companyId}: ${searchLeads.error.message}`,
    );
  }

  const urls = new Set<string>();
  const contentHashes = new Set<string>();
  for (const claim of claimSources.data ?? []) {
    for (const link of claim.claim_sources ?? []) {
      const url = link.sources?.url;
      if (url) {
        urls.add(url);
      }
      const hash = link.sources?.content_hash;
      if (hash) {
        contentHashes.add(hash);
      }
    }
  }

  return {
    existingEvidenceUrls: [...urls],
    existingEvidenceContentHashes: [...contentHashes],
    searchLeads: (searchLeads.data ?? []).map((row) => ({ label: row.label, query: row.query })),
  };
}
