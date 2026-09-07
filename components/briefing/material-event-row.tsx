import Link from "next/link";
import type { EventSummary } from "@/src/db/repositories/events";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { formatRelative, humanizeToken } from "@/components/ui/format";

/**
 * One entry in the chronological change feed.
 *
 * Deliberately quieter than an attention row: this is the record of what was
 * observed, not a call to act. It carries the two labels that decide how much
 * weight a reader should give it - the event's materiality and whether a source
 * established a date - and it links to the source so a claim can be checked in
 * one click rather than being taken on trust.
 *
 * The subtype is shown when a source established one and the category alone
 * when it did not. "Regulatory" and "Licence granted" are different amounts of
 * knowledge, and flattening them would overstate what the pipeline found.
 */

const MATERIALITY_TONE: Record<string, BadgeTone> = {
  high: "warning",
  medium: "neutral",
  low: "muted",
};

export function MaterialEventRow({ event }: { event: EventSummary }) {
  const date = event.eventDate ?? event.publishedAt ?? null;
  const relative = formatRelative(date);
  const label = humanizeToken(event.eventType ?? event.eventCategory);

  return (
    <li className="flex gap-3 border-b border-border px-5 py-3.5 last:border-b-0">
      {/* A timeline rule rather than an icon per row: two dozen coloured glyphs
          down a feed becomes texture, not information. */}
      <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-border-strong" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {label ? <Badge tone="neutral">{label}</Badge> : null}
          {event.materiality ? (
            <Badge
              tone={MATERIALITY_TONE[event.materiality] ?? "neutral"}
              title="How consequential the pipeline judged this event to be."
            >
              {humanizeToken(event.materiality)} materiality
            </Badge>
          ) : (
            <Badge tone="muted" title="No materiality was recorded for this event.">
              Materiality unrated
            </Badge>
          )}
          {event.companySlug && event.companyName ? (
            <Link
              href={`/companies/${event.companySlug}`}
              className="rounded text-caption font-medium text-primary hover:underline"
            >
              {event.companyName}
            </Link>
          ) : (
            <span
              className="text-caption text-tertiary"
              title="This event has not been attributed to a company in the universe."
            >
              Unattributed
            </span>
          )}
          <span className="tabular text-caption text-tertiary">{relative ?? "Undated"}</span>
        </div>

        <p className="mt-1.5 text-body leading-relaxed text-primary">{event.summary}</p>

        {event.etoroRelevance ? (
          <p className="mt-1 text-body leading-relaxed text-secondary">
            <span className="font-medium text-primary">Relevance to eToro: </span>
            {event.etoroRelevance}
          </p>
        ) : null}

        {event.source ? (
          <a
            href={event.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex max-w-full items-center gap-1 text-caption text-info hover:underline"
          >
            <span className="truncate">
              {event.source.publisher ?? event.source.title ?? event.source.url}
            </span>
            <Icon name="external-link" size={12} />
          </a>
        ) : (
          <span className="mt-1.5 block text-caption text-tertiary">No source recorded</span>
        )}
      </div>
    </li>
  );
}
