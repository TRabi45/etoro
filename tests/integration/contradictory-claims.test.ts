import { config as loadEnv } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient, type TypedSupabaseClient } from "@/src/db/client";
import { startAgentRun } from "@/src/db/repositories/agent-runs";
import { insertClaim } from "@/src/db/repositories/claims";
import { upsertSource } from "@/src/db/repositories/sources";

/**
 * Integration coverage for the evidence rules that only a real database can
 * prove.
 *
 * Requires a running local Supabase (`pnpm db:start && pnpm db:reset &&
 * pnpm db:seed`). Deliberately excluded from `pnpm test` and from CI, both of
 * which must run without Docker.
 *
 * The central question here is the one the whole evidence model rests on: when
 * two sources disagree, does the second write destroy the first? It must not.
 */

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const RUN_TAG = `integration-${Date.now()}`;

let client: TypedSupabaseClient;
let agentRunId: string;
let companyId: string;
const createdClaimIds: string[] = [];
let sourceAId: string;
let sourceBId: string;

beforeAll(async () => {
  const connection = createServiceClient();
  if (!connection.ok) {
    throw new Error(
      `${connection.problem.message} - run pnpm db:start and populate .env.local first`,
    );
  }
  client = connection.client;

  const company = await client.from("companies").select("id").eq("slug", "getquin").maybeSingle();
  if (company.error || !company.data) {
    throw new Error("bootstrap company 'getquin' is missing - run pnpm db:seed first");
  }
  companyId = company.data.id;

  agentRunId = await startAgentRun(client, { purpose: `test_${RUN_TAG}` });

  sourceAId = await upsertSource(client, {
    url: `https://example.com/${RUN_TAG}/source-a`,
    urlNormalized: `example.com/${RUN_TAG}/source-a`,
    title: "Integration test source A",
    publisher: "Example A (STUB SOURCE)",
    sourceType: "trade_press",
    trustTier: "secondary",
    publishedAt: "2026-05-19",
    agentRunId,
  });

  sourceBId = await upsertSource(client, {
    url: `https://example.com/${RUN_TAG}/source-b`,
    urlNormalized: `example.com/${RUN_TAG}/source-b`,
    title: "Integration test source B",
    publisher: "Example B (STUB SOURCE)",
    sourceType: "company_official",
    trustTier: "primary",
    publishedAt: "2026-06-01",
    agentRunId,
  });
});

afterAll(async () => {
  // Leave the database as the suite found it, so a later run of the vertical
  // slice or the dashboard is not looking at test debris.
  if (createdClaimIds.length > 0) {
    await client.from("claim_sources").delete().in("claim_id", createdClaimIds);
    await client.from("claims").delete().in("id", createdClaimIds);
  }
  await client.from("sources").delete().in("id", [sourceAId, sourceBId]);
  await client.from("agent_runs").delete().eq("id", agentRunId);
});

describe("contradictory claims", () => {
  it("keeps both claims when a later source disagrees with an earlier one", async () => {
    const conflictGroup = crypto.randomUUID();
    const predicate = `${RUN_TAG}_registered_users`;

    const firstId = await insertClaim(client, {
      companyId,
      subject: "getquin",
      predicate,
      valueNumeric: 1_200_000,
      valueUnit: "registered users",
      valueStatus: "estimated",
      asOfDate: "2026-05-19",
      claimKind: "estimate",
      aiConfidence: "low",
      conflictGroup,
      agentRunId,
      sources: [{ sourceId: sourceAId, relation: "supports", excerpt: "press figure" }],
    });
    createdClaimIds.push(firstId);

    // A second, contradictory observation of the same predicate.
    const secondId = await insertClaim(client, {
      companyId,
      subject: "getquin",
      predicate,
      valueNumeric: 900_000,
      valueUnit: "registered users",
      valueStatus: "disclosed",
      asOfDate: "2026-06-01",
      claimKind: "company_reported",
      aiConfidence: "medium",
      conflictGroup,
      agentRunId,
      sources: [{ sourceId: sourceBId, relation: "supports", excerpt: "company page figure" }],
    });
    createdClaimIds.push(secondId);

    expect(secondId).not.toBe(firstId);

    const { data, error } = await client
      .from("claims")
      .select("id, value_numeric, claim_kind, as_of_date")
      .eq("conflict_group", conflictGroup)
      .order("value_numeric", { ascending: true });

    expect(error).toBeNull();
    // Both rows survive. The later write did not overwrite, merge, or supersede
    // the earlier one - the disagreement is the record.
    expect(data).toHaveLength(2);
    expect(data?.map((row) => row.value_numeric)).toEqual([900_000, 1_200_000]);
    expect(data?.map((row) => row.claim_kind).sort()).toEqual(["company_reported", "estimate"]);
  });

  it("keeps each claim's own sources attached to it", async () => {
    const { data, error } = await client
      .from("claim_sources")
      .select("claim_id, source_id, relation")
      .in("claim_id", createdClaimIds);

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    // Each claim keeps its own evidence; the two are not pooled.
    const bySource = new Map(data?.map((row) => [row.source_id, row.claim_id]));
    expect(bySource.get(sourceAId)).not.toBe(bySource.get(sourceBId));
  });

  it("refuses to write a claim with no source at all", async () => {
    await expect(
      insertClaim(client, {
        companyId,
        subject: "getquin",
        predicate: `${RUN_TAG}_unsourced`,
        valueText: "This should never be written.",
        valueStatus: "disclosed",
        asOfDate: null,
        claimKind: "company_reported",
        agentRunId,
        sources: [],
      }),
    ).rejects.toThrow(/must cite at least one source/);

    const { data } = await client
      .from("claims")
      .select("id")
      .eq("predicate", `${RUN_TAG}_unsourced`);
    expect(data ?? []).toHaveLength(0);
  });

  it("refuses to store analysis as a verified fact", async () => {
    // Enforced by a CHECK constraint, so it holds even if a caller bypasses the
    // application-level validation.
    await expect(
      insertClaim(client, {
        companyId,
        subject: "getquin",
        predicate: `${RUN_TAG}_analysis`,
        valueText: "Strong strategic fit.",
        valueStatus: "disclosed",
        asOfDate: null,
        claimKind: "analysis",
        verificationStatus: "verified",
        agentRunId,
        sources: [{ sourceId: sourceAId, relation: "supports", excerpt: null }],
      }),
    ).rejects.toThrow();
  });
});
