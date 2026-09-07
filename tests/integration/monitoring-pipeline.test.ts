import { afterEach, describe, expect, it } from "vitest";
import { createServiceClient } from "@/src/db/client";
import { resolveEntity } from "@/src/research/pipeline/identity";
import { createDiscoveredCompany, slugFromName } from "@/src/research/pipeline/discovery";
import { runMonitoringPass } from "@/src/research/pipeline/runner";
import { fetchSource } from "@/src/research/sources/fetcher";

/**
 * These run against a live local database. They cover the two properties that
 * cannot be checked without one: that a failing source does not take the run
 * with it, and that identity resolution refuses to merge companies the schema
 * would happily let it merge.
 */

function client() {
  const connection = createServiceClient();
  if (!connection.ok) {
    throw new Error(connection.problem.message);
  }
  return connection.client;
}

const createdCompanyIds: string[] = [];
const createdRunIds: string[] = [];

afterEach(async () => {
  const db = client();
  for (const id of createdCompanyIds.splice(0)) {
    await db.from("companies").delete().eq("id", id);
  }
  for (const id of createdRunIds.splice(0)) {
    await db.from("monitoring_runs").delete().eq("id", id);
  }
});

/**
 * Runs `body` with only `eligibleIds` due for refresh.
 *
 * Auto-enrichment deliberately selects from the whole universe, so without
 * this a test asserting "exactly one of *my* companies was enriched" is really
 * asserting "the runner happened to pick mine" - it picks whichever companies
 * are due, and every seeded identity has a null `next_refresh_at`, which means
 * due now. That made this suite order-dependent and, worse, let it run real
 * research passes against the seeded universe with a fake fetcher, leaving
 * bootstrap companies marked `partial` in a shared database.
 *
 * Everything else is parked in the future for the duration and restored
 * afterwards, including on failure.
 */
async function withOnlyTheseCompaniesDue<T>(
  eligibleIds: string[],
  body: () => Promise<T>,
): Promise<T> {
  const db = client();
  const others = await db.from("companies").select("id, next_refresh_at");
  if (others.error) throw new Error(others.error.message);

  const parked = (others.data ?? []).filter((row) => !eligibleIds.includes(row.id));
  const parkUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  for (const row of parked) {
    await db.from("companies").update({ next_refresh_at: parkUntil }).eq("id", row.id);
  }

  try {
    return await body();
  } finally {
    for (const row of parked) {
      await db.from("companies").update({ next_refresh_at: row.next_refresh_at }).eq("id", row.id);
    }
  }
}

describe("entity resolution", () => {
  it("keeps Bit2C and B2C2 apart", async () => {
    const db = client();

    // The standing example, and not hypothetical: the assignment brief names
    // B2C2 while the public evidence supports a 2026 eToro transaction with
    // Bit2C, a different company. Any resolver measuring string similarity
    // merges them, and the merge is undetectable afterwards.
    const bit2c = await createDiscoveredCompany(db, {
      canonicalName: "Bit2C",
      discoveryReason: "Test fixture for the entity-resolution regression.",
      agentRunId: await newAgentRun(),
      entityRole: "operating_company",
    });
    if (!bit2c.ok) throw new Error(bit2c.reason);
    createdCompanyIds.push(bit2c.companyId);

    const resolvedSame = await resolveEntity(db, "Bit2C");
    expect(resolvedSame.outcome).toBe("matched");
    if (resolvedSame.outcome === "matched") {
      expect(resolvedSame.companyId).toBe(bit2c.companyId);
    }

    // The whole point: a name one character apart must not resolve to it.
    const resolvedOther = await resolveEntity(db, "B2C2");
    expect(resolvedOther.outcome).toBe("unresolved");
  });

  it("matches through a corporate suffix but not through a different name", async () => {
    const db = client();

    // "DFNS SAS" and "Dfns" are the same legal identity written two ways.
    const resolved = await resolveEntity(db, "DFNS SAS");
    expect(resolved.outcome).toBe("matched");
    if (resolved.outcome === "matched") {
      expect(resolved.slug).toBe("dfns");
    }

    const unrelated = await resolveEntity(db, "Dfinity");
    expect(unrelated.outcome).toBe("unresolved");
  });

  it("reports an unknown company rather than guessing", async () => {
    const resolution = await resolveEntity(client(), "A Company That Does Not Exist Ltd");
    expect(resolution.outcome).toBe("unresolved");
    if (resolution.outcome === "unresolved") {
      expect(resolution.ambiguous).toBe(false);
    }
  });
});

describe("discovered companies", () => {
  it("records identity only, with a discovery reason", async () => {
    const db = client();
    const created = await createDiscoveredCompany(db, {
      canonicalName: "Example Discovery Target",
      discoveryReason: "Named in a test article.",
      agentRunId: await newAgentRun(),
      entityRole: "operating_company",
    });
    if (!created.ok) throw new Error(created.reason);
    createdCompanyIds.push(created.companyId);

    const { data } = await db
      .from("companies")
      .select("lifecycle_status, record_origin, discovery_reason, description, path, ma_state")
      .eq("id", created.companyId)
      .single();

    // Separate from the reviewed universe until a human looks at it.
    expect(data?.lifecycle_status).toBe("discovered_unreviewed");
    expect(data?.record_origin).toBe("agent_generated");
    expect(data?.discovery_reason).toBe("Named in a test article.");
    // Identity only. A name in one article is not research, and writing a
    // guessed theme or path here would put an unevidenced judgement into a
    // controlled field.
    expect(data?.description).toBeNull();
    expect(data?.path).toBeNull();
    expect(data?.ma_state).toBeNull();
  });

  it("builds a schema-valid slug from an awkward name", () => {
    expect(slugFromName("Bit2C Ltd.")).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(slugFromName("  ***  ")).toBe("discovered");
    expect(slugFromName("Acme", "2")).toBe("acme-2");
  });
});

describe("pipeline resilience", () => {
  it("completes as partial_success when a source fetch aborts", async () => {
    // The rule the whole runner is shaped around. One unreachable host is the
    // steady state of reading the public web, not an exceptional condition, so a
    // run that dies on it is a run that never completes on a normal day.
    const failingFetch: typeof fetch = async () => {
      const error = new Error("The operation was aborted.");
      error.name = "AbortError";
      throw error;
    };

    const report = await runMonitoringPass({
      trigger: "manual",
      maxSources: 2,
      idempotencyKey: `test-abort-${crypto.randomUUID()}`,
      feeds: [{ name: "Test feed", url: "https://example.com/feed.xml" }],
      fetchImpl: failingFetch,
    });
    createdRunIds.push(report.runId);

    // The run finished and said so, rather than throwing.
    expect(report.status).toBe("partial_success");
    expect(report.warnings.length).toBeGreaterThan(0);

    const db = client();
    const { data } = await db
      .from("monitoring_runs")
      .select("status, warnings, finished_at")
      .eq("id", report.runId)
      .single();

    // Recorded, not just returned: an operator reading the dashboard has to be
    // able to see that something was missed.
    expect(data?.status).toBe("partial_success");
    expect(data?.finished_at).not.toBeNull();
    expect((data?.warnings ?? []).length).toBeGreaterThan(0);
  });

  it("reuses a run for a repeated idempotency key instead of starting a second", async () => {
    const key = `test-idempotent-${crypto.randomUUID()}`;
    const feeds = [{ name: "Test feed", url: "https://example.com/feed.xml" }];
    const failingFetch: typeof fetch = async () => {
      throw new Error("network disabled in test");
    };

    const first = await runMonitoringPass({
      trigger: "manual",
      maxSources: 1,
      idempotencyKey: key,
      feeds,
      fetchImpl: failingFetch,
    });
    createdRunIds.push(first.runId);

    const second = await runMonitoringPass({
      trigger: "manual",
      maxSources: 1,
      idempotencyKey: key,
      feeds,
      fetchImpl: failingFetch,
    });

    // An overlapping trigger joins the existing run rather than recording the
    // same day's monitoring twice with half the sources in each.
    expect(second.runId).toBe(first.runId);
    expect(second.reused).toBe(true);
  });
});

describe("auto-enrichment", () => {
  it("selects no more than the configured limit of eligible indexed companies", async () => {
    // Three fresh identities: all `indexed` (the default tier) and all
    // immediately due (`next_refresh_at` is null until something sets it) -
    // exactly the pool workstream E's auto-enrichment selects from.
    const db = client();
    const runId = await newAgentRun();
    const names = ["Enrich Candidate One", "Enrich Candidate Two", "Enrich Candidate Three"];
    for (const canonicalName of names) {
      const created = await createDiscoveredCompany(db, {
        canonicalName,
        discoveryReason: "Test fixture for auto-enrichment selection.",
        agentRunId: runId,
        entityRole: "operating_company",
      });
      if (!created.ok) throw new Error(created.reason);
      createdCompanyIds.push(created.companyId);
    }

    const failingFetch: typeof fetch = async () => {
      throw new Error("network disabled in test");
    };

    const report = await withOnlyTheseCompaniesDue(createdCompanyIds, () =>
      runMonitoringPass({
        trigger: "manual",
        maxSources: 1,
        idempotencyKey: `test-auto-enrich-${crypto.randomUUID()}`,
        feeds: [{ name: "Test feed", url: "https://example.com/feed.xml" }],
        fetchImpl: failingFetch,
        autoEnrichLimit: 1,
      }),
    );
    createdRunIds.push(report.runId);

    // Three companies were eligible; the configured limit of one is what
    // actually ran, not "however many happened to be due."
    expect(report.enrichedCompanies.length).toBe(1);

    const researchRuns = await db
      .from("company_research_runs")
      .select("company_id")
      .in("company_id", createdCompanyIds);
    expect(researchRuns.data?.length).toBe(1);
  });

  it("does not auto-enrich on a reused monitoring run", async () => {
    const key = `test-auto-enrich-reused-${crypto.randomUUID()}`;
    const failingFetch: typeof fetch = async () => {
      throw new Error("network disabled in test");
    };
    const options = {
      trigger: "manual" as const,
      maxSources: 1,
      idempotencyKey: key,
      feeds: [{ name: "Test feed", url: "https://example.com/feed.xml" }],
      fetchImpl: failingFetch,
      autoEnrichLimit: 1,
    };

    // No fixtures of its own, so nothing is eligible: this test is about the
    // reused run, and enriching an unrelated seeded company to prove it would
    // be a side effect, not a fixture.
    const { first, second } = await withOnlyTheseCompaniesDue([], async () => {
      const firstRun = await runMonitoringPass(options);
      const secondRun = await runMonitoringPass(options);
      return { first: firstRun, second: secondRun };
    });
    createdRunIds.push(first.runId);

    expect(second.reused).toBe(true);
    expect(second.enrichedCompanies).toEqual([]);
  });
});

describe("safe fetching", () => {
  it("refuses a private address without making a request", async () => {
    let called = false;
    const spy: typeof fetch = async () => {
      called = true;
      return new Response("should never happen");
    };

    const outcome = await fetchSource("http://127.0.0.1:54321/rest/v1/companies", {
      fetchImpl: spy,
    });

    expect(outcome.ok).toBe(false);
    // The guard must run before the request, not after: a blocked destination
    // that was still contacted has already leaked.
    expect(called).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toMatch(/private address/);
    }
  });

  it("refuses a non-http scheme", async () => {
    const outcome = await fetchSource("file:///etc/passwd");
    expect(outcome.ok).toBe(false);
  });
});

/** Events need an agent run to point at, so tests need one too. */
async function newAgentRun(): Promise<string> {
  const db = client();
  const { data, error } = await db
    .from("agent_runs")
    .insert({ purpose: "test", status: "running" })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "could not create agent run");
  }
  return data.id;
}
