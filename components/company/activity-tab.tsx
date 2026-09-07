import type { EventSummary } from "@/src/db/repositories/events";
import type { ScoreHistoryEntry } from "@/src/db/repositories/scores";
import { RecommendationBadge } from "@/components/ui/recommendation-badge";
import { CoverageBadge } from "@/components/ui/coverage-badge";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { formatDate, formatDateTime, humanizeToken } from "@/components/ui/format";

/**
 * What has happened to this company, and what the system concluded when.
 *
 * Two streams merged into one chronology, because an analyst reading "the
 * recommendation changed in August" immediately wants to know what happened in
 * August. Keeping them in separate lists forces the reader to do that join by
 * eye.
 *
 * Score rows written under a superseded model are shown rather than hidden.
 * They are immutable historical records, and this is the one surface where
 * displaying them is correct - the question here is what happened, and "scored
 * under v0.2, then re-scored under v0.3" is part of the answer. Each row is
 * labelled with its model version, so a superseded score can never be mistaken
 * for the current one.
 */

type TimelineEntry =
  | { kind: "event"; at: string | null; event: EventSummary }
  | { kind: "score"; at: string; score: ScoreHistoryEntry };

export interface ActivityTabProps {
  events: EventSummary[];
  scoreHistory: ScoreHistoryEntry[];
  /** Set when one of the two streams could not be read. */
  problems: string[];
}

export function ActivityTab({ events, scoreHistory, problems }: ActivityTabProps) {
  const entries: TimelineEntry[] = [
    ...events.map((event) => ({
      kind: "event" as const,
      at: event.eventDate ?? event.publishedAt,
      event,
    })),
    ...scoreHistory.map((score) => ({
      kind: "score" as const,
      at: score.calculatedAt,
      score,
    })),
  ].sort((left, right) => {
    // Undated entries sort last rather than being dropped: an event nobody
    // dated still happened.
    if (left.at === null && right.at === null) return 0;
    if (left.at === null) return 1;
    if (right.at === null) return -1;
    return right.at.localeCompare(left.at);
  });

  return (
    <div className="flex flex-col gap-4">
      {problems.length > 0 ? (
        <ErrorState
          tone="partial"
          title="Part of the timeline could not be read"
          impact={
            <>
              What loaded is shown below, so the timeline is incomplete rather than absent. Treat
              gaps as unknown rather than as nothing having happened.
            </>
          }
          detail={problems.join(" | ")}
        />
      ) : null}

      {entries.length === 0 ? (
        <EmptyState
          icon="monitoring"
          title="No recorded activity"
          nextStep={
            <>
              No material event has been extracted for this company and no score has been written.
              Events appear once a monitoring run finds them in a fetched source; scores appear once
              a research pass clears the entity gate.
            </>
          }
        />
      ) : (
        <ol className="flex flex-col">
          {entries.map((entry, index) => (
            <li
              key={entry.kind === "event" ? entry.event.id : entry.score.id}
              className="flex gap-3"
            >
              {/* A continuous rule with a node per entry, so the chronology
                  reads as one sequence rather than two interleaved lists. */}
              <div className="flex flex-col items-center">
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${
                    entry.kind === "score"
                      ? "border-brand bg-surface"
                      : "border-border-strong bg-border-strong"
                  }`}
                />
                {index < entries.length - 1 ? (
                  <span aria-hidden="true" className="w-px flex-1 bg-border" />
                ) : null}
              </div>

              <div className="min-w-0 flex-1 pb-5">
                {entry.kind === "score" ? (
                  <ScoreEntry score={entry.score} />
                ) : (
                  <EventEntry event={entry.event} />
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ScoreEntry({ score }: { score: ScoreHistoryEntry }) {
  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="spark" size={15} className="text-brand" />
        <span className="text-body font-medium text-primary">Scored</span>
        <Badge
          tone={score.isCurrent ? "brand" : "muted"}
          title={
            score.isCurrent
              ? "This is the company's current answer under the active scoring model."
              : "Written under a model that is no longer in force. Kept as an immutable historical record, and never used as the current score."
          }
        >
          {score.isCurrent ? "Current" : "Superseded"}
        </Badge>
        <Badge tone="neutral">Model {score.modelVersion}</Badge>
        <span className="tabular text-caption text-tertiary">
          {formatDateTime(score.calculatedAt)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="tabular text-body font-semibold text-primary">
          {score.normalizedScore === null ? "Not scored" : score.normalizedScore.toFixed(2)}
        </span>
        <CoverageBadge coverage={score.coverage} />
        <RecommendationBadge recommendation={score.recommendation} />
      </div>

      {score.blockingGates.length > 0 ? (
        <p className="mt-2 text-caption leading-relaxed text-warning">
          Blocking gates at the time: {score.blockingGates.join(", ")}.
        </p>
      ) : null}
    </div>
  );
}

function EventEntry({ event }: { event: EventSummary }) {
  const date = event.eventDate ?? event.publishedAt;

  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{humanizeToken(event.eventType ?? event.eventCategory)}</Badge>
        {event.materiality ? (
          <Badge tone={event.materiality === "high" ? "warning" : "muted"}>
            {humanizeToken(event.materiality)} materiality
          </Badge>
        ) : (
          <Badge tone="muted">Materiality unrated</Badge>
        )}
        <span className="tabular text-caption text-tertiary">{formatDate(date) ?? "Undated"}</span>
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
      ) : null}
    </div>
  );
}
