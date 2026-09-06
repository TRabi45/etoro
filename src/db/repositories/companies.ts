import { createPublicClient } from "@/src/db/client";
import type { RepositoryResult } from "@/src/db/repositories/result";
import type {
  EnablingLayer,
  LifecycleStatus,
  RecordOrigin,
  StrategicTheme,
} from "@/src/config/taxonomy";

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
  lifecycleStatus: LifecycleStatus;
  /**
   * True when this row is still identity with nothing researched behind it.
   *
   * Derived from whether the pipeline has actually written an assessment, not
   * from the row's own lifecycle flag: a bootstrap row keeps `record_origin =
   * bootstrap_identity` for life, because that is how it was created, so the
   * flag alone would keep claiming "research pending" long after research
   * existed.
   */
  isResearchPending: boolean;
  /**
   * How much the monitoring pipeline has gathered about this company.
   *
   * A discovered company has no assessment and no score - news does not
   * establish fundamentals - but it is not empty either. Without these counts
   * the list could only say "research pending", which reads as "nothing is
   * known" for a company the pipeline has already collected a dozen sourced
   * claims about.
   */
  claimCount: number;
  eventCount: number;
  updatedAt: string;
}

/**
 * Reads a PostgREST aggregate count.
 *
 * `claims(count)` comes back as `[{ count: n }]`, or as an empty array when
 * there are none. Typed loosely because the generated types describe the
 * embedded rows rather than the aggregate.
 */
function readCount(value: unknown): number {
  if (Array.isArray(value)) {
    const first = value[0] as { count?: unknown } | undefined;
    return typeof first?.count === "number" ? first.count : 0;
  }
  return 0;
}

/**
 * Lists companies for the dashboard.
 *
 * Selects identity columns plus a marker for whether an assessment exists, so
 * the list can distinguish a seeded identity from a researched company without
 * loading either profile.
 */
export async function listCompanies(): Promise<RepositoryResult<CompanyListItem[]>> {
  const connection = createPublicClient();
  if (!connection.ok) {
    return { ok: false, problem: connection.problem };
  }

  const { data, error } = await connection.client
    .from("companies")
    .select(
      "id, canonical_name, slug, legal_entity_name, primary_domain, theme_tags, enabling_layers, record_origin, lifecycle_status, updated_at, assessments(id), claims(count), events(count)",
    )
    // A screened-out row was never a target - a product, an investor, a
    // duplicate. A precedent is a real company that is not available. Neither
    // belongs in a list of candidates; both stay in the database, queryable by
    // whatever eventually gives precedents their own view (section 20's "a
    // competitor deal is a trigger, not a score" needs them to still exist).
    .not("lifecycle_status", "in", "(screened_out,precedent)")
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
      lifecycleStatus: row.lifecycle_status,
      isResearchPending: (row.assessments ?? []).length === 0,
      claimCount: readCount(row.claims),
      eventCount: readCount(row.events),
      updatedAt: row.updated_at,
    })),
  };
}
