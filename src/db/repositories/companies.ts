import { createPublicClient, type ConfigurationProblem } from "@/src/db/client";
import type { EnablingLayer, RecordOrigin, StrategicTheme } from "@/src/config/taxonomy";

/**
 * Company repository.
 *
 * All persistence access for companies goes through this module. UI components
 * call these functions; they never construct a client, write SQL, or know which
 * table a field came from. That boundary is what makes the storage layer
 * replaceable and the pages testable.
 *
 * Failures are returned, not thrown. The dashboard has to distinguish "not
 * configured" from "database unreachable" from "configured, connected, empty",
 * and each of those is a different thing to tell the user.
 */

/** What the company list needs, and deliberately nothing more. */
export interface CompanyListItem {
  id: string;
  canonicalName: string;
  slug: string;
  legalEntityName: string | null;
  primaryDomain: string | null;
  themeTags: StrategicTheme[];
  enablingLayers: EnablingLayer[];
  recordOrigin: RecordOrigin;
  /**
   * True when this row is seed identity with no research attached yet. The UI
   * uses it to label the row honestly instead of implying a profile exists.
   */
  isResearchPending: boolean;
  updatedAt: string;
}

export interface DatabaseProblem {
  kind: "database";
  message: string;
}

export type RepositoryResult<T> =
  { ok: true; data: T } | { ok: false; problem: ConfigurationProblem | DatabaseProblem };

/**
 * Lists companies for the dashboard.
 *
 * Only identity-level columns are selected. There is no score, assessment or
 * profile to read yet, and selecting columns that do not exist in the current
 * milestone would hide that fact.
 */
export async function listCompanies(): Promise<RepositoryResult<CompanyListItem[]>> {
  const connection = createPublicClient();
  if (!connection.ok) {
    return { ok: false, problem: connection.problem };
  }

  const { data, error } = await connection.client
    .from("companies")
    .select(
      "id, canonical_name, slug, legal_entity_name, primary_domain, theme_tags, enabling_layers, record_origin, lifecycle_status, updated_at",
    )
    .order("canonical_name", { ascending: true });

  if (error) {
    // The message is safe to show: it comes from PostgREST, not from a secret.
    return {
      ok: false,
      problem: { kind: "database", message: error.message },
    };
  }

  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      id: row.id,
      canonicalName: row.canonical_name,
      slug: row.slug,
      legalEntityName: row.legal_entity_name,
      primaryDomain: row.primary_domain,
      themeTags: row.theme_tags ?? [],
      enablingLayers: row.enabling_layers ?? [],
      recordOrigin: row.record_origin,
      isResearchPending:
        row.record_origin === "bootstrap_identity" && row.lifecycle_status === "research_pending",
      updatedAt: row.updated_at,
    })),
  };
}
