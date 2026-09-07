import { createPublicClient } from "@/src/db/client";
import type { RepositoryResult } from "@/src/db/repositories/result";
import type { DealStatus, TargetObject, ValueStatus } from "@/src/config/taxonomy";

/**
 * Competitor transactions.
 *
 * Backs the "what are they buying" question. Either side of a deal may be a
 * company the universe does not track yet, which is why the schema allows a
 * text identity alongside a resolved foreign key - a competitor's acquisition
 * of a company eToro has never looked at is exactly the kind of move worth
 * knowing about, and refusing to record it until both sides resolve would lose
 * the signal.
 *
 * Status is read straight from the stored enum rather than inferred from dates.
 * The database already enforces the rule that matters - a deal cannot be
 * `closed` without an actual close date - so an expected closing date can never
 * become a completion here.
 */

export interface DealSummary {
  id: string;
  /** Resolved acquirer slug when it is a company in the universe. */
  acquirerSlug: string | null;
  acquirerName: string;
  targetSlug: string | null;
  targetName: string;
  dealType: TargetObject | null;
  status: DealStatus;
  announcedDate: string | null;
  signedDate: string | null;
  expectedCloseDate: string | null;
  closedDate: string | null;
  terminatedDate: string | null;
  considerationAmount: number | null;
  considerationCurrency: string | null;
  considerationStatus: ValueStatus;
  /** Why the acquirer did it, when a source established it. */
  rationale: string | null;
}

interface DealRow {
  id: string;
  acquirer_name_text: string | null;
  target_name_text: string | null;
  deal_type: TargetObject | null;
  status: DealStatus;
  announced_date: string | null;
  signed_date: string | null;
  expected_close_date: string | null;
  closed_date: string | null;
  terminated_date: string | null;
  consideration_amount: number | null;
  consideration_currency: string | null;
  consideration_status: ValueStatus;
  rationale: string | null;
  acquirer: { slug: string; canonical_name: string } | null;
  target: { slug: string; canonical_name: string } | null;
}

/**
 * The most relevant date for ordering, which depends on where a deal stands.
 *
 * A terminated deal is interesting on the day it died, not the day it was
 * announced, so the timeline uses whichever milestone is furthest along rather
 * than always sorting on `announced_date`.
 */
export function effectiveDealDate(deal: DealSummary): string | null {
  return (
    deal.terminatedDate ??
    deal.closedDate ??
    deal.signedDate ??
    deal.announcedDate ??
    deal.expectedCloseDate
  );
}

export async function listDeals(limit = 100): Promise<RepositoryResult<DealSummary[]>> {
  const connection = createPublicClient();
  if (!connection.ok) {
    return { ok: false, problem: connection.problem };
  }

  const { data, error } = await connection.client
    .from("deals")
    .select(
      "id, acquirer_name_text, target_name_text, deal_type, status, announced_date, signed_date, expected_close_date, closed_date, terminated_date, consideration_amount, consideration_currency, consideration_status, rationale, acquirer:companies!deals_acquirer_company_id_fkey(slug, canonical_name), target:companies!deals_target_company_id_fkey(slug, canonical_name)",
    )
    .order("announced_date", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    return { ok: false, problem: { kind: "database", message: error.message } };
  }

  const deals: DealSummary[] = ((data ?? []) as unknown as DealRow[]).map((row) => ({
    id: row.id,
    acquirerSlug: row.acquirer?.slug ?? null,
    // A resolved company's canonical name wins over the free text, which is
    // whatever an article happened to call it.
    acquirerName: row.acquirer?.canonical_name ?? row.acquirer_name_text ?? "Unnamed acquirer",
    targetSlug: row.target?.slug ?? null,
    targetName: row.target?.canonical_name ?? row.target_name_text ?? "Unnamed target",
    dealType: row.deal_type,
    status: row.status,
    announcedDate: row.announced_date,
    signedDate: row.signed_date,
    expectedCloseDate: row.expected_close_date,
    closedDate: row.closed_date,
    terminatedDate: row.terminated_date,
    considerationAmount: row.consideration_amount,
    considerationCurrency: row.consideration_currency,
    considerationStatus: row.consideration_status,
    rationale: row.rationale,
  }));

  return {
    ok: true,
    data: deals.sort((left, right) =>
      (effectiveDealDate(right) ?? "").localeCompare(effectiveDealDate(left) ?? ""),
    ),
  };
}
