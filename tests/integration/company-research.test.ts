import { afterEach, describe, expect, it } from "vitest";
import { createServiceClient } from "@/src/db/client";
import { createDiscoveredCompany, slugFromName } from "@/src/research/pipeline/discovery";
import { researchCompany } from "@/src/research/pipeline/company-research";
import { EMPTY_ANALYST_OUTPUT, type AnalystOutput } from "@/src/ai/prompts/v1/analyst";

/**
 * The company-research orchestrator, exercised against a live local database
 * with a fake fetch and a fake analyst - deterministic fixtures, per the
 * milestone's testing requirements, never a live web call or a paid model in
 * this suite. `researchCompany` opens its own service connection internally,
 * so this cannot be a unit test; it is the same tradeoff `runVerticalSlice`
 * and `runMonitoringPass` already make.
 */

function client() {
  const connection = createServiceClient();
  if (!connection.ok) {
    throw new Error(connection.problem.message);
  }
  return connection.client;
}

const createdCompanyIds: string[] = [];

afterEach(async () => {
  const db = client();
  for (const id of createdCompanyIds.splice(0)) {
    await db.from("companies").delete().eq("id", id);
  }
});

async function newAgentRun(): Promise<string> {
  const db = client();
  const { data, error } = await db
    .from("agent_runs")
    .insert({ purpose: "test", status: "running" })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "no row");
  return data.id;
}

/**
 * A page with enough readable text to clear the fetcher's 200-character floor
 * (`fetcher.ts` treats anything shorter as navigation furniture, not
 * evidence). Padded with fixed filler rather than repeating `body` an
 * arbitrary number of times, so the fixture's actual length does not depend
 * on how long a given test's `body` string happens to be.
 */
function fakePage(title: string, body: string): string {
  const filler =
    "This fixture page exists only to satisfy the fetcher's minimum readable-text length for automated testing. ";
  return `<html><head><title>${title}</title></head><body><h1>${title}</h1><p>${body}</p><p>${filler.repeat(3)}</p></body></html>`;
}

/**
 * 192.0.2.0/24 is the RFC 5737 documentation range: it is never assigned to a
 * real host, and it is a literal IP rather than a hostname, so the fetcher's
 * SSRF guard (`assertPublicHost`) never performs a real DNS lookup for it -
 * only the synchronous private-address check. That keeps this suite from
 * depending on live DNS or network access, which the milestone's testing
 * requirements rule out for the automated suite.
 */
const FIXTURE_DOMAIN = "192.0.2.1";

/** Serves a canned page for any path on the fixture domain and fails everything else. */
function fakeFetch(pages: Record<string, string>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const path = new URL(url).pathname;
    const body = pages[path];
    if (body === undefined) {
      return new Response("not found", { status: 404 });
    }
    return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
  }) as typeof fetch;
}

const CLEAR_GATE = {
  state: "clear" as const,
  reason: "Nothing found that blocks.",
  citingClaimIndexes: [],
};
const SCORED = (score: number, claimIndexes: number[]) => ({
  status: "scored" as const,
  score,
  reason: "Evidence-based judgement.",
  citingClaimIndexes: claimIndexes,
});

function baseAnalystOutput(overrides: Partial<AnalystOutput> = {}): AnalystOutput {
  return {
    ...EMPTY_ANALYST_OUTPUT,
    entityResolution: {
      legalEntityConfirmed: "Fixture Co Ltd",
      matchesRecordedIdentity: true,
      note: "Confirmed by the official page.",
    },
    claims: [
      {
        subject: "Fixture Co",
        predicate: "annual revenue",
        valueText: null,
        valueNumeric: 5_000_000,
        valueUnit: null,
        valueCurrency: "USD",
        valueStatus: "disclosed",
        asOfDate: "2026-01-01",
        claimKind: "company_reported",
        documentIndex: 0,
        excerpt: "Fixture Co reported $5,000,000 in annual revenue.",
        conflictGroup: null,
      },
    ],
    dimensions: {
      strategic_fit: SCORED(4, [0]),
      incremental_capability: SCORED(3, [0]),
      market_customers_distribution: SCORED(3, [0]),
      product_technology: SCORED(3, [0]),
      financial_quality: SCORED(3, [0]),
      regulatory_feasibility: SCORED(4, [0]),
      integration_team: SCORED(3, [0]),
      deal_feasibility: SCORED(3, [0]),
    },
    gates: {
      regulatory: CLEAR_GATE,
      client_assets: CLEAR_GATE,
      security: CLEAR_GATE,
      integrity: CLEAR_GATE,
      deal: CLEAR_GATE,
    },
    routes: {
      build: { score: 2, reason: "Would take time." },
      partner: { score: 3, reason: "Plausible." },
      buy: { score: 4, reason: "Clean asset, no scarce blocker." },
      invest: { score: 2, reason: "Less relevant than a full acquisition." },
      watch: { score: 1, reason: "Enough is already known to act." },
    },
    classification: "tuck_in",
    fundamentals: {
      archetype: "b2b_infrastructure_saas",
      revenueQuality: "Recurring, per the official page.",
      growthAssessment: null,
      marginAssessment: null,
      burnRunway: null,
      concentration: null,
      unknowns: ["Customer concentration is not disclosed."],
    },
    assessment: {
      strategicFitSummary: "Fits the fixture pillar.",
      gapClosed: "Closes a fixture gap.",
      whyNow: "A fixture is available now.",
      synergies: "Fixture synergies.",
      risks: "Fixture risk.",
      counterThesis: "Could be built in-house instead.",
      unknowns: [],
    },
    ...overrides,
  };
}

async function createFixtureCompany(canonicalName: string): Promise<string> {
  const db = client();
  const created = await createDiscoveredCompany(db, {
    canonicalName,
    discoveryReason: "Test fixture for the company-research orchestrator.",
    agentRunId: await newAgentRun(),
    entityRole: "operating_company",
  });
  if (!created.ok) throw new Error(created.reason);
  createdCompanyIds.push(created.companyId);

  const { error } = await db
    .from("companies")
    .update({ primary_domain: FIXTURE_DOMAIN, legal_entity_name: "Fixture Co Ltd" })
    .eq("id", created.companyId);
  if (error) throw new Error(error.message);

  return slugFromName(canonicalName);
}

describe("researchCompany", () => {
  it("takes an identity-only company to an evidence-backed, scored profile", async () => {
    const slug = await createFixtureCompany("Fixture Co Happy Path");
    const fetchImpl = fakeFetch({
      "/": fakePage("Fixture Co", "Fixture Co is a B2B infrastructure company."),
    });

    const report = await researchCompany({
      slug,
      trigger: "manual",
      fetchImpl,
      analyzeImpl: async () => ({
        output: baseAnalystOutput(),
        problem: null,
        model: "fixture",
        promptVersion: "analyst/test",
      }),
    });

    expect(report.reused).toBe(false);
    expect(report.sourcesFetched).toBeGreaterThan(0);
    expect(report.claimsWritten).toBeGreaterThan(0);
    expect(report.scored).toBe(true);
    expect(["indexed", "monitored", "deep"]).toContain(report.tier);
    expect(new Date(report.nextRefreshAt).getTime()).toBeGreaterThan(Date.now());

    const db = client();
    const company = await db
      .from("companies")
      .select("research_tier, research_state, last_researched_at, next_refresh_at")
      .eq("slug", slug)
      .single();
    expect(company.data?.research_state).toBe("complete");
    expect(company.data?.last_researched_at).not.toBeNull();

    const scores = await db
      .from("scores")
      .select("positive_normalized, score_state")
      .eq(
        "company_id",
        (await db.from("companies").select("id").eq("slug", slug).single()).data!.id,
      );
    expect(scores.data?.length).toBe(1);
    expect(scores.data?.[0].score_state).toBe("scored");
  });

  it("is idempotent: retrying the same key reuses the run and does not duplicate writes", async () => {
    const slug = await createFixtureCompany("Fixture Co Idempotent");
    const fetchImpl = fakeFetch({
      "/": fakePage("Fixture Co", "Fixture Co is a B2B infrastructure company."),
    });
    const analyzeImpl = async () => ({
      output: baseAnalystOutput(),
      problem: null,
      model: "fixture",
      promptVersion: "analyst/test",
    });
    const idempotencyKey = `test:${slug}`;

    const first = await researchCompany({
      slug,
      trigger: "manual",
      idempotencyKey,
      fetchImpl,
      analyzeImpl,
    });
    const second = await researchCompany({
      slug,
      trigger: "manual",
      idempotencyKey,
      fetchImpl,
      analyzeImpl,
    });

    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.runId).toBe(first.runId);

    const db = client();
    const companyId = (await db.from("companies").select("id").eq("slug", slug).single()).data!.id;
    const scores = await db.from("scores").select("id").eq("company_id", companyId);
    // One research pass, reused once: still exactly one score row, not two.
    expect(scores.data?.length).toBe(1);
  });

  it("stores evidence but writes no numeric score when the entity does not match the record", async () => {
    const slug = await createFixtureCompany("Fixture Co Unresolved Entity");
    const fetchImpl = fakeFetch({
      "/": fakePage(
        "A Different Company",
        "This page turns out to describe a different legal entity.",
      ),
    });

    const report = await researchCompany({
      slug,
      trigger: "manual",
      fetchImpl,
      analyzeImpl: async () => ({
        output: baseAnalystOutput({
          entityResolution: {
            legalEntityConfirmed: "Some Other Entity Ltd",
            matchesRecordedIdentity: false,
            note: "The official page names a different legal entity than the one on record.",
          },
        }),
        problem: null,
        model: "fixture",
        promptVersion: "analyst/test",
      }),
    });

    expect(report.scored).toBe(false);
    expect(report.claimsWritten).toBeGreaterThan(0);

    const db = client();
    const companyId = (await db.from("companies").select("id").eq("slug", slug).single()).data!.id;
    const scores = await db
      .from("scores")
      .select("positive_normalized, score_state, recommendation")
      .eq("company_id", companyId)
      .single();
    // Evidence gathered before the block remains useful: a row exists, but it
    // honestly says nothing was scored - never a fabricated number, and never
    // silently no row at all.
    expect(scores.data?.positive_normalized).toBeNull();
    expect(scores.data?.score_state).toBe("research_only");
    expect(scores.data?.recommendation).toBe("blocked");
  });

  it("preserves both sides of a contradiction rather than picking one", async () => {
    const slug = await createFixtureCompany("Fixture Co Contradiction");
    const fetchImpl = fakeFetch({
      "/": fakePage("Fixture Co", "Fixture Co reported two different revenue figures this year."),
    });

    const report = await researchCompany({
      slug,
      trigger: "manual",
      fetchImpl,
      analyzeImpl: async () => ({
        output: baseAnalystOutput({
          claims: [
            {
              subject: "Fixture Co",
              predicate: "annual revenue",
              valueText: null,
              valueNumeric: 5_000_000,
              valueUnit: null,
              valueCurrency: "USD",
              valueStatus: "disclosed",
              asOfDate: "2026-01-01",
              claimKind: "company_reported",
              documentIndex: 0,
              excerpt: "The press release states $5,000,000.",
              conflictGroup: "revenue_2026",
            },
            {
              subject: "Fixture Co",
              predicate: "annual revenue",
              valueText: null,
              valueNumeric: 5_200_000,
              valueUnit: null,
              valueCurrency: "USD",
              valueStatus: "disclosed",
              asOfDate: "2026-01-01",
              claimKind: "company_reported",
              documentIndex: 0,
              excerpt: "The investor deck states $5,200,000.",
              conflictGroup: "revenue_2026",
            },
          ],
        }),
        problem: null,
        model: "fixture",
        promptVersion: "analyst/test",
      }),
    });

    expect(report.claimsWritten).toBe(2);

    const db = client();
    const companyId = (await db.from("companies").select("id").eq("slug", slug).single()).data!.id;
    const claims = await db
      .from("claims")
      .select("value_numeric, conflict_group")
      .eq("company_id", companyId)
      .not("conflict_group", "is", null);

    expect(claims.data?.length).toBe(2);
    const values = claims.data?.map((c) => c.value_numeric).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(values).toEqual([5_000_000, 5_200_000]);
    // Same conflict group on both sides - neither overwrote the other.
    expect(new Set(claims.data?.map((c) => c.conflict_group)).size).toBe(1);
  });
});
