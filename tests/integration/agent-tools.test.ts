import { beforeAll, describe, expect, it } from "vitest";
import {
  executeCompareCompanies,
  executeExplainScore,
  executeGetCompanyFundamentals,
  executeGetCompanyProfile,
  executeGetMarketMap,
  executeGetRecentEvents,
  executeRefreshCompany,
  executeRunMonitoringQuick,
  executeSearchTargets,
} from "@/src/ai/tools/executors";
import { guardTool } from "@/src/ai/tools/envelope";
import { createServiceClient } from "@/src/db/client";
import {
  appendChatMessage,
  ensureChatSession,
  loadRecentMessages,
} from "@/src/db/repositories/chat";

/**
 * The agent tools against a real database.
 *
 * These prove the half of the milestone that a language model is not needed for:
 * that every tool returns a well-formed envelope, that an empty result is
 * reported as empty rather than dressed up, that a failure comes back as data
 * instead of an exception, and that conversation memory persists and is bounded.
 *
 * Requires a running local Supabase with the bootstrap seed and the vertical
 * slice applied: pnpm db:start && pnpm db:reset && pnpm db:seed && pnpm slice:run
 */

beforeAll(async () => {
  const connection = createServiceClient();
  if (!connection.ok) {
    throw new Error(`${connection.problem.message} - run pnpm db:start first`);
  }
  const company = await connection.client
    .from("companies")
    .select("id")
    .eq("slug", "getquin")
    .maybeSingle();
  if (!company.data) {
    throw new Error("bootstrap company 'getquin' is missing - run pnpm db:seed first");
  }
});

describe("company tools", () => {
  it("returns a researched profile with an evidence packet and citations", async () => {
    const result = await executeGetCompanyProfile({ slug: "getquin" });

    expect(result.ok).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.citations.length).toBeGreaterThan(0);
    // Every citation the model may quote must carry a real, resolvable source.
    for (const citation of result.citations) {
      expect(citation.url).toMatch(/^https?:\/\//);
      expect(citation.index).toBeGreaterThan(0);
    }
  });

  it("reports an unresearched company as identity-only instead of inventing one", async () => {
    const result = await executeGetCompanyProfile({ slug: "swan" });

    expect(result.ok).toBe(true);
    expect(result.confidence).toBe("low");
    expect(result.warnings.join(" ")).toMatch(/bootstrap identity only/i);
  });

  it("says a company is absent rather than describing it from memory", async () => {
    // The slug is deliberately one no publisher will ever name. This test used
    // "stripe", which worked until the monitoring pipeline read a real article
    // about Stripe and added it - at which point the assertion started failing
    // for the best possible reason. A test for "absent" must not name a company
    // that could plausibly become present.
    const result = await executeGetCompanyProfile({ slug: "definitely-not-a-real-company-xyzzy" });

    expect(result.ok).toBe(true);
    expect(result.data).toBeNull();
    expect(result.warnings.join(" ")).toMatch(/not in the monitored universe|does not exist/i);
  });

  it("returns fundamentals with unknown measures intact", async () => {
    const result = await executeGetCompanyFundamentals({ slug: "getquin" });
    expect(result.ok).toBe(true);

    const payload = result.data as {
      observations: { valueStatus: string; valueNumeric: number | null }[];
    };
    const unknowns = payload.observations.filter(
      (observation) => observation.valueStatus === "unknown",
    );
    expect(unknowns.length).toBeGreaterThan(0);
    // The single most important property: an unknown never arrives as a zero.
    for (const observation of unknowns) {
      expect(observation.valueNumeric).toBeNull();
    }
  });

  it("returns the deterministic score breakdown with its blockers", async () => {
    const result = await executeExplainScore({ slug: "getquin" });
    expect(result.ok).toBe(true);

    const payload = result.data as {
      calculation: { finalScore: number; positiveNormalized: number };
      recommendation: string;
      acquireBlockers: string[];
    };
    expect(payload.calculation.finalScore).toBe(73.78);
    expect(payload.calculation.positiveNormalized).toBe(79.78);
    expect(payload.recommendation).toBe("partner");
    expect(payload.acquireBlockers.length).toBeGreaterThan(0);
  });

  it("refuses a comparison when fewer than two companies exist", async () => {
    const result = await executeCompareCompanies({ slugs: ["getquin", "not-a-company"] });

    expect(result.ok).toBe(true);
    expect(result.data).toBeNull();
    expect(result.warnings.join(" ")).toMatch(/at least two/i);
  });

  it("aligns a real comparison and flags the unassessed side", async () => {
    const result = await executeCompareCompanies({ slugs: ["getquin", "dfns"] });
    expect(result.ok).toBe(true);

    const payload = result.data as { companies: { slug: string; finalScore: number | null }[] };
    expect(payload.companies).toHaveLength(2);
    // Dfns has no assessment; its blank score must read as "not researched".
    expect(result.warnings.join(" ")).toMatch(/no assessment exists/i);
    expect(payload.companies.find((row) => row.slug === "dfns")?.finalScore).toBeNull();
  });
});

describe("discovery tools", () => {
  it("returns an empty result for a geography nothing is recorded under", async () => {
    const result = await executeSearchTargets({ geography: "Germany", limit: 10 });

    expect(result.ok).toBe(true);
    expect(result.data).toBeNull();
    // The warning has to explain *why* it is empty, or the agent cannot tell
    // "no such company" from "we never recorded geography".
    expect(result.warnings.join(" ")).toMatch(/geography is not yet recorded/i);
  });

  it("ranks the universe with the scored company first", async () => {
    const result = await executeSearchTargets({ limit: 10 });
    expect(result.ok).toBe(true);

    const payload = result.data as { matches: { slug: string; finalScore: number | null }[] };
    // Asserted as a floor, not an exact count. The monitoring pipeline adds
    // companies as it discovers them, so pinning the size would tie this test
    // to a moment in the data's life rather than to the behaviour it exists to
    // protect - which is the ordering.
    expect(payload.matches.length).toBeGreaterThanOrEqual(6);
    // The scored company ranks first; unscored ones follow rather than vanish.
    expect(payload.matches[0].slug).toBe("getquin");
    expect(payload.matches.filter((match) => match.finalScore === null).length).toBeGreaterThan(0);
  });

  it("builds a market map that admits its geography coverage is empty", async () => {
    const result = await executeGetMarketMap({});
    expect(result.ok).toBe(true);
    expect(result.data?.totalCompanies).toBeGreaterThanOrEqual(6);
    // Geography stays unpopulated: the extractor records what a document says
    // about a company, and an article rarely states a headquarters country.
    expect(result.warnings.join(" ")).toMatch(/no recorded headquarters/i);
  });

  it("returns recorded events with their sources attached", async () => {
    // Milestone 3 asserted the opposite - that this returned nothing, because
    // the events table could only be empty. Milestone 4 fills it, so the
    // meaningful check moved from "is it empty" to "is what came back usable":
    // every event carries a category, and any event claiming a source resolves
    // to a real one.
    const result = await executeGetRecentEvents({ since_date: "2026-01-01", limit: 20 });
    expect(result.ok).toBe(true);

    if (result.data === null) {
      // A legitimate state on a database that has never run the pipeline, and
      // the warning has to say which of the two situations this is.
      expect(result.warnings.join(" ")).toMatch(/no events are recorded/i);
      return;
    }

    const payload = result.data as {
      events: { eventCategory: string; summary: string; source: { url: string } | null }[];
    };
    expect(payload.events.length).toBeGreaterThan(0);
    for (const event of payload.events) {
      expect(event.eventCategory).toBeTruthy();
      expect(event.summary.length).toBeGreaterThan(0);
      if (event.source) {
        expect(event.source.url).toMatch(/^https?:\/\//);
      }
    }
    for (const citation of result.citations) {
      expect(citation.url).toMatch(/^https?:\/\//);
      expect(citation.index).toBeGreaterThan(0);
    }
  });
});

describe("monitoring from the chat", () => {
  it("accepts a company refresh but states plainly that nothing ran", async () => {
    // Still a genuine stub: there is no per-company research pass, only the
    // feed-driven monitoring run. Saying so is accurate rather than stale.
    const result = await executeRefreshCompany({ slug: "getquin", source_limit: 5 });

    expect(result.ok).toBe(true);
    expect((result.data as { status: string }).status).toBe("not_implemented");
    expect(result.warnings.join(" ")).toMatch(/no sources were fetched/i);
  });

  it("runs the real pipeline instead of reporting itself unimplemented", async () => {
    // This tool reported `not_implemented` with zero counts for a whole
    // milestone after the pipeline behind it started working - the endpoint and
    // the CLI were wired up and the chat tool was not. An analyst asking the
    // agent to check for news was told the capability did not exist while the
    // scheduled job was writing to the same database.
    //
    // Fetching is stubbed out so this costs no network and no model call. Every
    // document therefore fails, which is the point: what is under test is that a
    // real run happened and reported itself honestly, not what it found.
    const failingFetch: typeof fetch = async () => {
      throw new Error("network disabled in test");
    };

    const result = await executeRunMonitoringQuick(
      { strict_limits: true },
      {
        fetchImpl: failingFetch,
      },
    );

    expect(result.ok).toBe(true);

    const payload = result.data as {
      runId: string;
      status: string;
      counts: Record<string, number>;
    };
    // A real run id, from a real row.
    expect(payload.runId).toMatch(/^[0-9a-f-]{36}$/);
    // The word that used to be here.
    expect(JSON.stringify(payload)).not.toMatch(/not_implemented/);
    expect(result.warnings.join(" ")).not.toMatch(/is a stub|not implemented yet/i);
    // Nothing could be fetched, and the envelope says so rather than implying
    // fresh information arrived.
    expect(payload.status).toBe("partial_success");
    expect(payload.counts.claimsWritten).toBe(0);
    expect(result.warnings.join(" ")).toMatch(/no new documents were read/i);

    const connection = createServiceClient();
    if (connection.ok) {
      await connection.client.from("monitoring_runs").delete().eq("id", payload.runId);
    }
  });
});

describe("tool failure handling", () => {
  it("returns a database failure inside the envelope instead of crashing", async () => {
    // The scenario the guard exists for: if this threw, the streamed answer
    // would be aborted and the user would see nothing at all. Instead the
    // agent receives the failure as data and can apologise and explain.
    const result = await guardTool("explain_score", async () => {
      throw new Error('relation "scores" does not exist');
    });

    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe("tool_execution_failed");
    expect(result.error?.retryable).toBe(true);
    expect(result.error?.message).toContain("scores");
  });

  it("keeps every tool's contract even when the lookup finds nothing", async () => {
    // Whatever happens, the envelope shape is stable, so the model never has to
    // guess how to read a result.
    const results = [
      await executeGetCompanyProfile({ slug: "does-not-exist" }),
      await executeExplainScore({ slug: "does-not-exist" }),
      await executeGetCompanyFundamentals({ slug: "does-not-exist" }),
    ];

    for (const result of results) {
      expect(result).toHaveProperty("ok");
      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("citations");
      expect(result).toHaveProperty("asOf");
      expect(result).toHaveProperty("confidence");
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(result.data).toBeNull();
    }
  });
});

describe("conversation memory", () => {
  it("persists a session with its turns and replays them bounded and in order", async () => {
    const connection = createServiceClient();
    if (!connection.ok) {
      throw new Error(connection.problem.message);
    }
    const client = connection.client;

    const created = await ensureChatSession(client, {
      sessionId: null,
      ownerToken: null,
      currentCompanyId: null,
    });
    if (!created.ok) {
      throw new Error("a brand new session should never be owned by someone else");
    }
    const sessionId = created.sessionId;
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);

    // Twelve turns, so the ten-message bound actually has something to trim.
    for (let index = 0; index < 12; index += 1) {
      await appendChatMessage(client, sessionId, {
        role: index % 2 === 0 ? "user" : "assistant",
        content: `message ${index}`,
      });
    }

    const history = await loadRecentMessages(client, sessionId);
    expect(history).toHaveLength(10);
    // The *latest* ten, oldest first - not the first ten, which would hand the
    // model the start of the conversation and none of its current context.
    expect(history[0].content).toBe("message 2");
    expect(history[history.length - 1].content).toBe("message 11");

    const reused = await ensureChatSession(client, {
      sessionId,
      ownerToken: created.ownerToken,
      currentCompanyId: null,
    });
    expect(reused).toEqual({ ok: true, sessionId, ownerToken: created.ownerToken });

    await client.from("chat_messages").delete().eq("session_id", sessionId);
    await client.from("chat_sessions").delete().eq("id", sessionId);
  });

  it("refuses to continue a session that belongs to a different browser", async () => {
    const connection = createServiceClient();
    if (!connection.ok) {
      throw new Error(connection.problem.message);
    }
    const client = connection.client;

    const owner = await ensureChatSession(client, {
      sessionId: null,
      ownerToken: null,
      currentCompanyId: null,
    });
    if (!owner.ok) {
      throw new Error("a brand new session should never be owned by someone else");
    }

    // A second client presenting the same session id but its own token. Session
    // ids travel in the request body, so this is exactly what an attacker who
    // observed one would send - and because history is now replayed to the
    // model, being allowed in would mean writing into what the owner is told.
    const intruder = await ensureChatSession(client, {
      sessionId: owner.sessionId,
      ownerToken: "0123456789abcdef0123456789abcdef0123456789abcdef",
      currentCompanyId: null,
    });
    expect(intruder).toEqual({ ok: false, reason: "owned_by_another_client" });

    await client.from("chat_sessions").delete().eq("id", owner.sessionId);
  });

  it("survives two concurrent first turns for the same new session", async () => {
    const connection = createServiceClient();
    if (!connection.ok) {
      throw new Error(connection.problem.message);
    }
    const client = connection.client;

    // The race the previous check-then-insert version lost: both requests saw no
    // row and both inserted, and the loser's question died on a duplicate key.
    const sessionId = crypto.randomUUID();
    const token = "fedcba9876543210fedcba9876543210fedcba9876543210";
    const [first, second] = await Promise.all([
      ensureChatSession(client, { sessionId, ownerToken: token, currentCompanyId: null }),
      ensureChatSession(client, { sessionId, ownerToken: token, currentCompanyId: null }),
    ]);

    expect(first).toEqual({ ok: true, sessionId, ownerToken: token });
    expect(second).toEqual({ ok: true, sessionId, ownerToken: token });

    await client.from("chat_sessions").delete().eq("id", sessionId);
  });
});
