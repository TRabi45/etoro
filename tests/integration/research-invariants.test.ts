import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/src/db/client";
import { getCompanyProfileWithEvidence } from "@/src/db/repositories/company-profile";
import { getActiveScoringModelId } from "@/src/db/repositories/scoring-models";
import { upsertSource } from "@/src/db/repositories/sources";
import type { Database } from "@/src/db/types.generated";

/**
 * The invariants Milestone 5 promises but that no single feature test proves:
 * that a superseded score cannot win on timestamp alone, that the public role
 * cannot start or fake server-side research, and that one company's evidence
 * cannot be attributed to another.
 *
 * These run against the live local stack because every one of them is about a
 * database rule rather than an application branch - which is the point. An
 * invariant that only holds because the application happens to ask the right
 * question is not an invariant.
 */

function serviceClient() {
  const connection = createServiceClient();
  if (!connection.ok) {
    throw new Error(connection.problem.message);
  }
  return connection.client;
}

/** The browser's view: the anon key, exactly what a public dashboard visitor holds. */
function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
  }
  return createClient<Database>(url, key);
}

const createdCompanyIds: string[] = [];
const createdSourceIds: string[] = [];

afterEach(async () => {
  const db = serviceClient();
  for (const id of createdSourceIds.splice(0)) {
    await db.from("sources").delete().eq("id", id);
  }
  for (const id of createdCompanyIds.splice(0)) {
    await db.from("companies").delete().eq("id", id);
  }
});

async function newAgentRun(): Promise<string> {
  const db = serviceClient();
  const { data, error } = await db
    .from("agent_runs")
    .insert({ purpose: "test", status: "running" })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "no row");
  return data.id;
}

async function newCompany(slug: string): Promise<string> {
  const db = serviceClient();
  const { data, error } = await db
    .from("companies")
    .insert({
      slug,
      canonical_name: slug,
      record_origin: "agent_generated",
      entity_role: "operating_company",
      // companies_agent_rows_have_provenance: an agent-generated row without a
      // run it can be traced back to is exactly what the schema forbids.
      agent_run_id: await newAgentRun(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "no row");
  createdCompanyIds.push(data.id);
  return data.id;
}

describe("active scoring-model selection", () => {
  let v02ModelId: string;

  beforeAll(async () => {
    const db = serviceClient();
    // A superseded model row, standing in for the v0.2 configuration that
    // scored companies before the thesis model replaced it. `is_active` false
    // is what makes it historical; the row itself stays, because the scores
    // written under it must remain reproducible.
    const existing = await db
      .from("scoring_models")
      .select("id")
      .eq("version", "0.2-historical-fixture")
      .maybeSingle();
    if (existing.data) {
      v02ModelId = existing.data.id;
      return;
    }
    const { data, error } = await db
      .from("scoring_models")
      .insert({
        path: null,
        version: "0.2-historical-fixture",
        dimensions: [],
        hard_gates: [],
        thresholds: {},
        owner: "test",
        rationale: "Historical model fixture for active-selection tests.",
        thesis_version: "thesis/v0.2",
        is_active: false,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "no row");
    v02ModelId = data.id;
  });

  it("does not let a newer historical score displace the active v0.3 model", async () => {
    const db = serviceClient();
    const companyId = await newCompany(`active-model-fixture-${Date.now()}`);
    const agentRunId = await newAgentRun();

    const activeModel = await getActiveScoringModelId(db);
    expect(activeModel.ok).toBe(true);
    const activeModelId = activeModel.ok ? activeModel.data : null;
    expect(activeModelId).not.toBeNull();
    expect(activeModelId).not.toBe(v02ModelId);

    // The v0.3 row is written first; the superseded row gets a *later*
    // timestamp. Any reader ordering by `calculated_at` alone would pick the
    // wrong one - which is precisely the failure this guards.
    const activeInsert = await db.from("scores").insert({
      company_id: companyId,
      scoring_model_id: activeModelId as string,
      model_version: "0.3",
      input_snapshot: {},
      input_hash: `active-${companyId}`,
      weighted_coverage: 0.8,
      positive_normalized: 70,
      final_score: 70,
      lower_bound: 60,
      upper_bound: 80,
      score_state: "scored",
      recommendation: "acquire",
      calculated_at: "2026-01-01T00:00:00.000Z",
      agent_run_id: agentRunId,
    });
    const historicalInsert = await db.from("scores").insert({
      company_id: companyId,
      scoring_model_id: v02ModelId,
      model_version: "0.2-historical-fixture",
      input_snapshot: {},
      input_hash: `historical-${companyId}`,
      weighted_coverage: 0.9,
      positive_normalized: 95,
      final_score: 95,
      lower_bound: 90,
      upper_bound: 99,
      score_state: "scored",
      recommendation: "acquire",
      calculated_at: "2026-06-01T00:00:00.000Z",
      agent_run_id: agentRunId,
    });

    expect(activeInsert.error).toBeNull();
    expect(historicalInsert.error).toBeNull();

    const profile = await getCompanyProfileWithEvidence(
      (await db.from("companies").select("slug").eq("id", companyId).single()).data!.slug,
    );

    expect(profile.ok).toBe(true);
    if (!profile.ok || !profile.data) throw new Error("profile missing");
    expect(profile.data.score?.modelVersion).toBe("0.3");
    expect(profile.data.score?.normalizedScore).toBe(70);
  });

  it("keeps a written score immutable", async () => {
    const db = serviceClient();
    const companyId = await newCompany(`immutable-score-fixture-${Date.now()}`);
    const activeModel = await getActiveScoringModelId(db);
    const activeModelId = activeModel.ok ? activeModel.data : null;

    const inserted = await db
      .from("scores")
      .insert({
        company_id: companyId,
        scoring_model_id: activeModelId as string,
        model_version: "0.3",
        input_snapshot: {},
        input_hash: `immutable-${companyId}`,
        weighted_coverage: 0.5,
        positive_normalized: 50,
        final_score: 50,
        lower_bound: 40,
        upper_bound: 60,
        score_state: "scored",
        recommendation: "watch",
        calculated_at: new Date().toISOString(),
        agent_run_id: await newAgentRun(),
      })
      .select("id")
      .single();
    expect(inserted.error).toBeNull();

    const update = await db.from("scores").update({ final_score: 99 }).eq("id", inserted.data!.id);

    expect(update.error).not.toBeNull();
    expect(update.error?.message).toMatch(/immutable/i);
  });

  it("refuses a score that sits outside its own uncertainty range", async () => {
    const db = serviceClient();
    const companyId = await newCompany(`bounds-fixture-${Date.now()}`);
    const activeModel = await getActiveScoringModelId(db);

    const result = await db.from("scores").insert({
      company_id: companyId,
      scoring_model_id: (activeModel.ok ? activeModel.data : null) as string,
      model_version: "0.3",
      input_snapshot: {},
      input_hash: `bounds-${companyId}`,
      weighted_coverage: 0.5,
      positive_normalized: 95,
      final_score: 95,
      lower_bound: 10,
      upper_bound: 40,
      score_state: "scored",
      recommendation: "watch",
      calculated_at: new Date().toISOString(),
      agent_run_id: await newAgentRun(),
    });

    expect(result.error).not.toBeNull();
    expect(result.error?.message).toMatch(/scores_bounds_contain_score/i);
  });
});

describe("public role isolation", () => {
  it("cannot read the research ledger the agent writes", async () => {
    // company_research_runs and company_tier_transitions carry operational
    // provenance - what was attempted, what failed, what it cost. They are not
    // dashboard resources and no public read policy is granted.
    const anon = anonClient();

    const runs = await anon.from("company_research_runs").select("id").limit(1);
    const transitions = await anon.from("company_tier_transitions").select("id").limit(1);

    // RLS with no matching policy returns an empty set rather than an error.
    expect(runs.error === null ? runs.data : []).toEqual([]);
    expect(transitions.error === null ? transitions.data : []).toEqual([]);
  });

  it("cannot start a research run or move a company's tier", async () => {
    const companyId = await newCompany(`anon-write-fixture-${Date.now()}`);
    const anon = anonClient();

    const startRun = await anon
      .from("company_research_runs")
      .insert({
        company_id: companyId,
        trigger: "manual",
        idempotency_key: `anon-attempt-${companyId}`,
        status: "running",
      })
      .select("id");

    const moveTier = await anon
      .from("companies")
      .update({ research_tier: "deep" })
      .eq("id", companyId)
      .select("id");

    expect(startRun.error === null && (startRun.data?.length ?? 0) > 0).toBe(false);
    expect(moveTier.error === null && (moveTier.data?.length ?? 0) > 0).toBe(false);

    // And the company is untouched.
    const db = serviceClient();
    const after = await db.from("companies").select("research_tier").eq("id", companyId).single();
    expect(after.data?.research_tier).not.toBe("deep");
  });
});

describe("cross-company source attribution", () => {
  it("does not merge two companies' sources because their text is identical", async () => {
    // The realistic case: two portfolio companies serving the same boilerplate
    // legal page. Identical extracted text, different owners. Merging them
    // would attach the second company's evidence to the first company's row.
    const db = serviceClient();
    const companyA = await newCompany(`hash-collision-a-${Date.now()}`);
    const companyB = await newCompany(`hash-collision-b-${Date.now()}`);
    const agentRunId = await newAgentRun();
    const sharedHash = `shared-boilerplate-${Date.now()}`;

    const sourceA = await upsertSource(db, {
      url: "https://company-a.test/legal",
      urlNormalized: "company-a.test/legal",
      title: "Legal",
      publisher: null,
      sourceType: "company_official",
      trustTier: "primary",
      publishedAt: null,
      contentHash: sharedHash,
      researchCompanyId: companyA,
      agentRunId,
    });
    createdSourceIds.push(sourceA);

    const sourceB = await upsertSource(db, {
      url: "https://company-b.test/legal",
      urlNormalized: "company-b.test/legal",
      title: "Legal",
      publisher: null,
      sourceType: "company_official",
      trustTier: "primary",
      publishedAt: null,
      contentHash: sharedHash,
      researchCompanyId: companyB,
      agentRunId,
    });
    createdSourceIds.push(sourceB);

    expect(sourceB).not.toBe(sourceA);

    const rows = await db
      .from("sources")
      .select("id, research_company_id")
      .eq("content_hash", sharedHash);
    expect(rows.data).toHaveLength(2);
  });

  it("still stores one row when the same company retrieves the same body twice", async () => {
    const db = serviceClient();
    const companyId = await newCompany(`hash-dedupe-${Date.now()}`);
    const agentRunId = await newAgentRun();
    const hash = `same-body-${Date.now()}`;

    const first = await upsertSource(db, {
      url: "https://company.test/investors",
      urlNormalized: "company.test/investors",
      title: "Investors",
      publisher: null,
      sourceType: "company_official",
      trustTier: "primary",
      publishedAt: null,
      contentHash: hash,
      researchCompanyId: companyId,
      agentRunId,
    });
    createdSourceIds.push(first);

    // The same document reached through a second address - a mirror, or a
    // tracking link. One evidence item, not corroboration.
    const second = await upsertSource(db, {
      url: "https://company.test/investor-relations?utm_source=x",
      urlNormalized: "company.test/investor-relations",
      title: "Investor Relations",
      publisher: null,
      sourceType: "company_official",
      trustTier: "primary",
      publishedAt: null,
      contentHash: hash,
      researchCompanyId: companyId,
      agentRunId,
    });

    expect(second).toBe(first);
  });
});
