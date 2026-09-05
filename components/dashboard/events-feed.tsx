import type { EventSummary } from "@/src/db/repositories/events";

/**
 * The "what changed" feed.
 *
 * Everything on screen came out of a fetched document through the extractor, so
 * every row carries its source link. A change feed without an attributable
 * source is a rumour mill, and this one is meant to be read before an investment
 * committee conversation.
 *
 * Two display rules follow from how the data is produced:
 *
 *   - The subtype is shown only when one exists. The extractor records the
 *     coarse category it can justify from a single article; showing "regulatory"
 *     is honest, and inventing "licence suspension" to fill the space would not
 *     be.
 *   - eToro relevance is shown only when the extractor wrote one. Most events
 *     have none, and an empty row is the correct rendering of "no specific
 *     relevance was established" - far better than a generic sentence that makes
 *     every event look strategically interesting.
 */

const MATERIALITY_STYLES: Record<string, string> = {
  high: "bg-red-50 text-red-800 border-red-200",
  medium: "bg-amber-50 text-amber-900 border-amber-200",
  low: "bg-slate-50 text-slate-600 border-slate-200",
};

export function EventsFeed({ events }: { events: EventSummary[] }) {
  return (
    <ul className="space-y-3">
      {events.map((event) => (
        <li key={event.id} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-700">
              {event.eventCategory.replace(/_/g, " ")}
            </span>
            {event.eventType ? (
              <span className="rounded border border-slate-200 px-2 py-0.5 font-mono text-xs text-slate-500">
                {event.eventType.replace(/_/g, " ")}
              </span>
            ) : null}
            {event.materiality ? (
              <span
                className={`rounded border px-2 py-0.5 text-xs font-medium ${
                  MATERIALITY_STYLES[event.materiality] ?? MATERIALITY_STYLES.low
                }`}
              >
                {event.materiality} materiality
              </span>
            ) : null}
            {event.companyName ? (
              <span className="text-xs font-medium text-slate-900">{event.companyName}</span>
            ) : (
              <span className="text-xs text-slate-400">not attributed to a tracked company</span>
            )}
          </div>

          <p className="mt-2 text-sm leading-relaxed text-slate-800">{event.summary}</p>

          {event.etoroRelevance ? (
            <p className="mt-2 rounded bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">
              <span className="font-semibold">Relevance to eToro: </span>
              {event.etoroRelevance}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {event.eventDate ? (
              <span>occurred {event.eventDate}</span>
            ) : (
              <span>date not stated</span>
            )}
            {event.publishedAt ? <span>published {event.publishedAt}</span> : null}
            {event.source ? (
              <a
                href={event.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-blue-700 hover:underline"
              >
                {event.source.publisher ?? event.source.title ?? event.source.url}
              </a>
            ) : (
              <span className="text-amber-800">no source attached &mdash; treat as unverified</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
