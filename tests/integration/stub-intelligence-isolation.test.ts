import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { executeExplainScore, executeSearchTargets } from "@/src/ai/tools/executors";
import { createServiceClient } from "@/src/db/client";
import { getMorningBrief } from "@/src/db/repositories/briefing";
import { getCompanyProfileWithEvidence } from "@/src/db/repositories/company-profile";
import { getCompanyResearchContext } from "@/src/db/repositories/company-research-context";
import { getActiveScoringModelId } from "@/src/db/repositories/scoring-models";
import { upsertSource } from "@/src/db/repositories/sources";
import { searchTargets } from "@/src/db/repositories/targets";
import type { Database } from "@/src/db/types.generated";

/**
 * Production/demo separation is a database boundary, so these checks exercise
 * the live local stack with both privilege levels. The service client is the
 * deliberate test/demo opt-in; repositories and agent tools use the anon view.
 */

function serviceClient() {
  const connection = createServiceClient();
  if (!connection.ok) {
    throw new Error(connection.problem.message);
  }
  return connection.client;
}

function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
  }
  return createClient<Database>(url, key);
}

const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const stubSlug = `stub-isolation-${suffix}`;
const realSlug = `real-isolation-${suffix}`;
let stubCompanyId: string;
let realCompanyId: string;
let stubRunId: string;
let realRunId: string;
const sourceIds: string[] = [];

async function createRun(isStub: boolean): Promise<string> {
  const { data, error } = await serviceClient()
    .from("agent_runs")
    .insert({ purpose: "stub-isolation-integration-test", status: "success", is_stub: isStub })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "no agent run returned");
  return data.id;
}

async function createBootstrapIdentity(slug: string): Promise<string> {
  const { data, error } = await serviceClient()
    .from("companies")
    .insert({
      slug,
      canonical_name: slug,
      record_origin: "bootstrap_identity",
      entity_role: "operating_company",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "no company returned");
  return data.id;
}

async function createAssessmentAndScore(input: {
  companyId: string;
  runId: string;
  score: number;
  inputHash: string;
}): Promise<void> {
  const db = serviceClient();
  const activeModel = await getActiveScoringModelId(db);
  if (!activeModel.ok) throw new Error(activeModel.problem.message);
  if (!activeModel.data) throw new Error("no active scoring model");

  const assessment = await db.from("assessments").insert({
    company_id: input.companyId,
    thesis_version: "stub-isolation-test",
    path: "tuck_in",
    strategic_fit_summary: "Integration fixture assessment.",
    agent_run_id: input.runId,
  });
  if (assessment.error) throw new Error(assessment.error.message);

  const score = await db.from("scores").insert({
    company_id: input.companyId,
    scoring_model_id: activeModel.data,
    model_version: "0.3",
    path: null,
    input_snapshot: {},
    input_hash: input.inputHash,
    positive_normalized: input.score,
    final_score: input.score,
    lower_bound: input.score - 5,
    upper_bound: 100,
    weighted_coverage: 0.9,
    score_state: "scored",
    recommendation: "acquire",
    agent_run_id: input.runId,
  });
  if (score.error) throw new Error(score.error.message);
}

async function createEvidence(input: {
  companyId: string;
  runId: string;
  label: "stub" | "real";
}): Promise<string> {
  const db = serviceClient();
  const url = `https://${input.label}-${suffix}.test/evidence`;
  const source = await db
    .from("sources")
    .insert({
      url,
      url_normalized: `${input.label}-${suffix}.test/evidence`,
      source_type: "company_official",
      trust_tier: "primary",
      research_company_id: input.companyId,
      agent_run_id: input.runId,
    })
    .select("id")
    .single();
  if (source.error || !source.data) throw new Error(source.error?.message ?? "no source returned");
  sourceIds.push(source.data.id);

  const claim = await db
    .from("claims")
    .insert({
      company_id: input.companyId,
      subject: input.label,
      predicate: "fixture_provenance",
      value_text: input.label,
      claim_kind: "company_reported",
      agent_run_id: input.runId,
    })
    .select("id")
    .single();
  if (claim.error || !claim.data) throw new Error(claim.error?.message ?? "no claim returned");

  const link = await db.from("claim_sources").insert({
    claim_id: claim.data.id,
    source_id: source.data.id,
    relation: "supports",
  });
  if (link.error) throw new Error(link.error.message);
  return url;
}

beforeAll(async () => {
  stubRunId = await createRun(true);
  realRunId = await createRun(false);
  stubCompanyId = await createBootstrapIdentity(stubSlug);
  realCompanyId = await createBootstrapIdentity(realSlug);

  await createAssessmentAndScore({
    companyId: stubCompanyId,
    runId: stubRunId,
    score: 99,
    inputHash: `stub-${suffix}`,
  });
  await createAssessmentAndScore({
    companyId: realCompanyId,
    runId: realRunId,
    score: 87,
    inputHash: `real-${suffix}`,
  });

  await createEvidence({ companyId: realCompanyId, runId: stubRunId, label: "stub" });
  await createEvidence({ companyId: realCompanyId, runId: realRunId, label: "real" });
});

afterAll(async () => {
  const db = serviceClient();
  await db.from("companies").delete().in("id", [stubCompanyId, realCompanyId]);
  await db.from("sources").delete().in("id", sourceIds);
  await db.from("agent_runs").delete().in("id", [stubRunId, realRunId]);
});

describe("stub intelligence isolation", () => {
  it("A: excludes a stub score from normal target ranking", async () => {
    const result = await searchTargets({ limit: 500 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stub = result.data.find((target) => target.slug === stubSlug);
    expect(stub).toMatchObject({ normalizedScore: null, recommendation: null });
  });

  it("B: keeps a real score visible through the same reader", async () => {
    const result = await searchTargets({ limit: 500 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const real = result.data.find((target) => target.slug === realSlug);
    expect(real).toMatchObject({
      normalizedScore: 87,
      recommendation: "acquire",
      hasResearch: true,
    });
  });

  it("C: treats a bootstrap identity with only stub analysis as unresearched", async () => {
    const result = await getCompanyProfileWithEvidence(stubSlug);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.data) return;

    expect(result.data.company.slug).toBe(stubSlug);
    expect(result.data.hasResearch).toBe(false);
    expect(result.data.score).toBeNull();
    expect(result.data.assessment).toBeNull();
    expect(result.data.evidence.facts).toEqual([]);
  });

  it("D: cannot promote stub intelligence into briefing opportunities", async () => {
    const briefing = await getMorningBrief();
    expect(briefing.topOpportunities.map((target) => target.slug)).not.toContain(stubSlug);
    expect(briefing.needsAttention.map((item) => item.target?.slug)).not.toContain(stubSlug);
  });

  it("E: keeps stub scores out of agent-facing tools", async () => {
    const [ranking, explanation] = await Promise.all([
      executeSearchTargets({ limit: 50 }),
      executeExplainScore({ slug: stubSlug }),
    ]);

    expect(ranking.ok).toBe(true);
    expect(
      (
        ranking.data as { matches: { slug: string; normalizedScore: number | null }[] }
      ).matches.find((target) => target.slug === stubSlug)?.normalizedScore,
    ).toBeNull();
    expect(explanation.ok).toBe(true);
    expect(explanation.data).toBeNull();
    expect(JSON.stringify(explanation)).not.toContain("99");
  });

  it("F: preserves deliberate service-role access to synthetic fixtures", async () => {
    const serviceView = await serviceClient()
      .from("scores")
      .select("final_score, agent_runs(is_stub)")
      .eq("company_id", stubCompanyId)
      .single();
    const publicView = await anonClient()
      .from("scores")
      .select("final_score")
      .eq("company_id", stubCompanyId);

    expect(serviceView.error).toBeNull();
    expect(serviceView.data).toMatchObject({ final_score: 99, agent_runs: { is_stub: true } });
    expect(publicView.error).toBeNull();
    expect(publicView.data).toEqual([]);
  });

  it("does not let stub evidence contaminate a real research pass", async () => {
    const context = await getCompanyResearchContext(serviceClient(), realCompanyId);

    expect(context.existingEvidenceUrls).toContain(`https://real-${suffix}.test/evidence`);
    expect(context.existingEvidenceUrls).not.toContain(`https://stub-${suffix}.test/evidence`);
  });

  it("promotes a de-duplicated stub source only after a real retrieval", async () => {
    const db = serviceClient();
    const normalizedUrl = `promotion-${suffix}.test/evidence`;
    const common = {
      url: `https://${normalizedUrl}`,
      urlNormalized: normalizedUrl,
      publisher: "Fixture publisher",
      sourceType: "company_official" as const,
      trustTier: "primary" as const,
      publishedAt: null,
      contentHash: `promotion-${suffix}`,
      researchCompanyId: realCompanyId,
    };

    const stubSourceId = await upsertSource(db, {
      ...common,
      title: "Synthetic title",
      agentRunId: stubRunId,
    });
    sourceIds.push(stubSourceId);
    const reusedSourceId = await upsertSource(db, {
      ...common,
      title: "Retrieved title",
      agentRunId: realRunId,
    });

    const serviceView = await db
      .from("sources")
      .select("title, agent_run_id, agent_runs(is_stub)")
      .eq("id", stubSourceId)
      .single();
    const publicView = await anonClient().from("sources").select("id").eq("id", stubSourceId);

    expect(reusedSourceId).toBe(stubSourceId);
    expect(serviceView.data).toMatchObject({
      title: "Retrieved title",
      agent_run_id: realRunId,
      agent_runs: { is_stub: false },
    });
    expect(publicView.data).toEqual([{ id: stubSourceId }]);
  });
});
