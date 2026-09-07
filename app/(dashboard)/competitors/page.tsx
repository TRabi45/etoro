import Link from "next/link";
import { connection } from "next/server";
import { effectiveDealDate, listDeals, type DealSummary } from "@/src/db/repositories/deals";
import { getRecentEvents } from "@/src/db/repositories/events";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Value } from "@/components/ui/value";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { UnknownValue } from "@/components/ui/unknown-value";
import { Icon } from "@/components/ui/icon";
import { formatDate, humanizeToken } from "@/components/ui/format";

/**
 * Competitor transactions and capability moves.
 *
 * The column that matters is relevance to eToro, not the article summary - and
 * because the pipeline records that separately from a deal's rationale, this
 * page shows when it is missing rather than substituting the acquirer's own
 * stated reasoning. "Why they said they bought it" and "what it means for us"
 * are different claims, and letting one stand in for the other is how a
 * competitor's press release ends up in an internal strategy note.
 *
 * Deal status is read from the stored enum, never inferred from dates. The
 * database will not let a deal be closed without a close date, so an expected
 * closing date cannot become a completion anywhere in this view.
 */

const STATUS_PRESENTATION: Record<string, { tone: BadgeTone; hint: string }> = {
  rumored: {
    tone: "muted",
    hint: "Reported but not confirmed by either party. The weakest form of this record.",
  },
  announced: { tone: "info", hint: "Publicly announced by a party to the transaction." },
  signed: { tone: "info", hint: "Definitive agreement signed. Not yet closed." },
  regulatory_review: {
    tone: "warning",
    hint: "Awaiting regulatory clearance, which can change or end the deal.",
  },
  closed: { tone: "brand", hint: "Completed, with an actual close date on record." },
  integrated: { tone: "brand", hint: "Closed and integrated into the acquirer." },
  divested: { tone: "neutral", hint: "Subsequently sold on by the acquirer." },
  terminated: { tone: "danger", hint: "Abandoned or blocked. It did not happen." },
};

/** The lookback window, computed outside the component body. See Monitoring. */
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export default async function CompetitorsPage() {
  await connection();

  const [dealsResult, eventsResult] = await Promise.all([
    listDeals(100),
    // Acquisition-category events are the second signal: a capability move that
    // has not yet been resolved into a structured deal row still matters.
    getRecentEvents({
      sinceDate: daysAgoIso(365),
      eventCategories: ["acquisition"],
      limit: 25,
    }),
  ]);

  if (!dealsResult.ok) {
    return (
      <PageShell>
        <ErrorState
          title="Competitor transactions could not be read"
          impact={
            <>
              Nothing is shown rather than a partial list, so this page never implies competitors
              have been quiet when the truth is that the record could not be reached.
            </>
          }
          detail={dealsResult.problem.message}
        />
      </PageShell>
    );
  }

  const deals = dealsResult.data;
  const events = eventsResult.ok ? eventsResult.data : [];

  return (
    <PageShell>
      <div className="flex flex-col gap-5">
        {!eventsResult.ok ? (
          <ErrorState
            tone="partial"
            title="The event feed could not be read"
            impact={
              <>
                Structured transactions are shown below. Capability moves that exist only as events
                are missing from this page until the feed is reachable.
              </>
            }
            detail={eventsResult.problem.message}
          />
        ) : null}

        <section aria-labelledby="deals-heading">
          <h2 id="deals-heading" className="text-section font-semibold text-primary">
            Transactions
          </h2>

          <div className="mt-3 overflow-hidden rounded-card border border-border bg-surface">
            {deals.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon="competitors"
                  title="No competitor transaction has been recorded"
                  nextStep={
                    <>
                      Transactions appear here once a research or monitoring pass extracts one from
                      a source and resolves at least one side of it. An empty table means nothing
                      has been <em>recorded</em>, not that the market has been quiet.
                    </>
                  }
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[60rem] border-collapse text-table">
                  <thead>
                    <tr className="border-b border-border text-left">
                      {[
                        "Competitor",
                        "Target",
                        "Capability gained",
                        "Relevance to eToro",
                        "Consideration",
                        "Deal status",
                        "Date",
                      ].map((heading) => (
                        <th key={heading} scope="col" className="px-4 py-2.5 font-medium text-secondary">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {deals.map((deal) => (
                      <DealRow key={deal.id} deal={deal} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="moves-heading">
          <h2 id="moves-heading" className="text-section font-semibold text-primary">
            Capability moves
          </h2>
          <p className="mt-1 max-w-prose text-body text-secondary">
            Acquisition-category events from the last year that have not been resolved into a
            structured transaction. A competitor&rsquo;s move is a trigger to re-examine a thesis,
            never a score in itself.
          </p>

          <div className="mt-3 overflow-hidden rounded-card border border-border bg-surface">
            {events.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon="monitoring"
                  title="No acquisition events in the last year"
                  nextStep={
                    <>
                      Events appear here once a monitoring run extracts one from a fetched source.
                      Run intelligence to check for anything newer than the last pass.
                    </>
                  }
                />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {events.map((event) => (
                  <li key={event.id} className="px-5 py-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">
                        {humanizeToken(event.eventType ?? event.eventCategory)}
                      </Badge>
                      {event.companySlug && event.companyName ? (
                        <Link
                          href={`/companies/${event.companySlug}`}
                          className="text-caption font-medium text-primary hover:underline"
                        >
                          {event.companyName}
                        </Link>
                      ) : (
                        <span className="text-caption text-tertiary">Unattributed</span>
                      )}
                      <span className="tabular text-caption text-tertiary">
                        {formatDate(event.eventDate ?? event.publishedAt) ?? "Undated"}
                      </span>
                    </div>
                    <p className="mt-1.5 text-body leading-relaxed text-primary">{event.summary}</p>
                    <p className="mt-1 text-body leading-relaxed text-secondary">
                      <span className="font-medium text-primary">Relevance to eToro: </span>
                      {event.etoroRelevance ?? (
                        <span className="text-tertiary">
                          Not assessed. The implication for eToro has not been recorded, so this is
                          a fact about the market rather than a conclusion about us.
                        </span>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function DealRow({ deal }: { deal: DealSummary }) {
  const presentation = STATUS_PRESENTATION[deal.status] ?? { tone: "neutral" as BadgeTone, hint: "" };
  const date = effectiveDealDate(deal);

  return (
    <tr className="border-b border-border last:border-b-0 align-top">
      <td className="px-4 py-3">
        {deal.acquirerSlug ? (
          <Link
            href={`/companies/${deal.acquirerSlug}`}
            className="font-medium text-primary hover:underline"
          >
            {deal.acquirerName}
          </Link>
        ) : (
          <span className="font-medium text-primary">{deal.acquirerName}</span>
        )}
      </td>

      <td className="px-4 py-3">
        {deal.targetSlug ? (
          <Link href={`/companies/${deal.targetSlug}`} className="text-primary hover:underline">
            {deal.targetName}
          </Link>
        ) : (
          <span className="text-primary">{deal.targetName}</span>
        )}
        {deal.dealType ? (
          <span className="mt-0.5 block text-caption text-tertiary">
            {humanizeToken(deal.dealType)}
          </span>
        ) : null}
      </td>

      <td className="max-w-[16rem] px-4 py-3 text-secondary">
        {deal.rationale ?? (
          <UnknownValue
            kind="unknown"
            reason="No source established what capability this transaction bought."
          />
        )}
      </td>

      <td className="max-w-[16rem] px-4 py-3 text-secondary">
        {/*
         * Deliberately not filled from the rationale. What an acquirer says it
         * bought and what that means for eToro are different claims.
         */}
        <span className="text-tertiary">
          Not assessed for eToro relevance
          <Icon name="help" size={13} className="ml-1 inline align-text-bottom" />
        </span>
      </td>

      <td className="px-4 py-3">
        <Value
          status={deal.considerationStatus}
          value={deal.considerationAmount}
          currency={deal.considerationCurrency}
        />
      </td>

      <td className="px-4 py-3">
        <Badge tone={presentation.tone} title={presentation.hint}>
          {humanizeToken(deal.status)}
        </Badge>
      </td>

      <td className="tabular px-4 py-3 text-secondary">
        {formatDate(date) ?? <span className="text-tertiary">Undated</span>}
        {deal.expectedCloseDate && !deal.closedDate ? (
          <span
            className="mt-0.5 block text-caption text-tertiary"
            title="An expectation, never evidence of completion."
          >
            expected {formatDate(deal.expectedCloseDate)}
          </span>
        ) : null}
      </td>
    </tr>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6">
      <div>
        <h1 className="text-page font-semibold text-primary">Competitors</h1>
        <p className="mt-1 max-w-prose text-body text-secondary">
          What competitors have bought and what it gained them. Rumour, announced, signed,
          regulatory review, closed and terminated are kept distinct - a deal is only closed when an
          actual close date exists.
        </p>
      </div>
      {children}
    </div>
  );
}
