import { createPublicClient } from "@/src/db/client";
import type { RepositoryResult } from "@/src/db/repositories/result";
import type { EventCategory, EventType, MaterialityLevel } from "@/src/config/taxonomy";

/**
 * Material events.
 *
 * Backs the "what changed?" question. The monitoring pipeline writes events,
 * but an empty result still means only that nothing has been recorded in the
 * requested window - never that nothing happened in the world.
 */

export interface EventSummary {
  id: string;
  companySlug: string | null;
  companyName: string | null;
  /** The coarse category, always present. */
  eventCategory: EventCategory;
  /** The precise subtype, present only when a source established it. */
  eventType: EventType | null;
  eventDate: string | null;
  publishedAt: string | null;
  summary: string;
  materiality: MaterialityLevel | null;
  etoroRelevance: string | null;
  source: {
    id: string;
    url: string;
    title: string | null;
    publisher: string | null;
    publishedAt: string | null;
    accessedAt: string;
  } | null;
}

export interface RecentEventsFilters {
  sinceDate: string;
  companySlug?: string;
  competitor?: string;
  eventCategories?: EventCategory[];
  eventTypes?: EventType[];
  limit: number;
}

export async function getRecentEvents(
  filters: RecentEventsFilters,
): Promise<RepositoryResult<EventSummary[]>> {
  const connection = createPublicClient();
  if (!connection.ok) {
    return { ok: false, problem: connection.problem };
  }

  let query = connection.client
    .from("events")
    .select(
      "id, event_category, event_type, event_date, published_at, summary, materiality, etoro_relevance, companies(slug, canonical_name), sources(id, url, title, publisher, published_at, accessed_at)",
    )
    // Either date qualifies. Many articles report that something happened
    // without saying when, and filtering on `event_date` alone would hide every
    // one of those from the "what changed?" feed - which is the question this
    // repository exists to answer.
    .or(`event_date.gte.${filters.sinceDate},published_at.gte.${filters.sinceDate}`);

  if (filters.eventCategories && filters.eventCategories.length > 0) {
    query = query.in("event_category", filters.eventCategories);
  }
  if (filters.eventTypes && filters.eventTypes.length > 0) {
    query = query.in("event_type", filters.eventTypes);
  }
  if (filters.competitor) {
    // Competitor events are not tied to a company row in the universe, so they
    // are matched on the summary text until the pipeline resolves identities.
    query = query.ilike("summary", `%${filters.competitor}%`);
  }

  const { data, error } = await query
    .order("event_date", { ascending: false })
    .limit(filters.limit);

  if (error) {
    return { ok: false, problem: { kind: "database", message: error.message } };
  }

  type EventRow = {
    id: string;
    event_category: EventCategory;
    event_type: EventType | null;
    event_date: string | null;
    published_at: string | null;
    summary: string;
    materiality: MaterialityLevel | null;
    etoro_relevance: string | null;
    companies: { slug: string; canonical_name: string } | null;
    sources: {
      id: string;
      url: string;
      title: string | null;
      publisher: string | null;
      published_at: string | null;
      accessed_at: string;
    } | null;
  };

  const rows = (data ?? []) as unknown as EventRow[];
  const events: EventSummary[] = rows
    .filter((row) => !filters.companySlug || row.companies?.slug === filters.companySlug)
    .map((row) => ({
      id: row.id,
      companySlug: row.companies?.slug ?? null,
      companyName: row.companies?.canonical_name ?? null,
      eventCategory: row.event_category,
      eventType: row.event_type,
      eventDate: row.event_date,
      publishedAt: row.published_at,
      summary: row.summary,
      materiality: row.materiality,
      etoroRelevance: row.etoro_relevance,
      source: row.sources
        ? {
            id: row.sources.id,
            url: row.sources.url,
            title: row.sources.title,
            publisher: row.sources.publisher,
            publishedAt: row.sources.published_at,
            accessedAt: row.sources.accessed_at,
          }
        : null,
    }));

  return { ok: true, data: events };
}
