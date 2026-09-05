import { createServiceClient, type TypedSupabaseClient } from "@/src/db/client";
import { finishAgentRun, startAgentRun } from "@/src/db/repositories/agent-runs";
import { insertClaim } from "@/src/db/repositories/claims";
import {
  finishMonitoringRun,
  startMonitoringRun,
  type RunStatus,
  type RunTrigger,
} from "@/src/db/repositories/monitoring-runs";
import { upsertSource } from "@/src/db/repositories/sources";
import { extractFromSource } from "@/src/ai/provider-adapter";
import { EXTRACTOR_PROMPT_VERSION, type ExtractedPayload } from "@/src/ai/prompts/v1/extractor";
import { resolveEntity } from "@/src/research/pipeline/identity";
import { normalizeEntityName } from "@/src/validation/identity";
import { createDiscoveredCompany } from "@/src/research/pipeline/discovery";
import { fetchSource, type FetchOutcome } from "@/src/research/sources/fetcher";
import {
  DEFAULT_FEEDS,
  discoverCandidates,
  type FeedDefinition,
} from "@/src/research/sources/feeds";
import { createHash } from "node:crypto";

/**
 * The monitoring pipeline.
 *
 * Eight steps, run in order, with one property that shapes everything else: a
 * failure inside the per-source section costs that source and nothing more. The
 * `try/catch` is around the individual document, not around the loop, because a
 * run that aborts on the first unreachable host is a run that never completes on
 * a normal day - unreachable hosts, paywalls, malformed feeds and rate limits
 * are the steady state of reading the public web, not exceptional conditions.
 *
 * The counterpart of that tolerance is that failures must be visible. Every
 * caught failure becomes a warning stored on the run, the run finishes as
 * `partial_success` rather than `success`, and the dashboard shows both. Silent
 * recovery would leave a monitoring system that appears to work while reading
 * nothing.
 */

export interface MonitoringRunOptions {
  trigger: RunTrigger;
  /** Hard ceiling on documents fetched, so a run cannot become unbounded. */
  maxSources?: number;
  /** Reusing a key returns the existing run instead of starting a second. */
  idempotencyKey?: string;
  feeds?: FeedDefinition[];
  /** Injected by tests to simulate an unreachable host without a network. */
  fetchImpl?: typeof fetch;
}

export interface MonitoringRunReport {
  runId: string;
  reused: boolean;
  status: RunStatus;
  sourcesDiscovered: number;
  sourcesFetched: number;
  sourcesSkipped: number;
  claimsWritten: number;
  eventsWritten: number;
  companiesDiscovered: number;
  warnings: string[];
}

export const DEFAULT_MAX_SOURCES = 5;
const PER_FEED_LIMIT = 8;

/**
 * How many documents may be tried per document successfully fetched.
 *
 * Paywalls, blocked crawlers and dead links are ordinary, so a run needs slack
 * to reach its target - but not unlimited slack, or one bad day of feeds turns
 * into an unbounded crawl.
 */
const ATTEMPTS_PER_SOURCE = 4;

/** One run per calendar day per trigger, unless the caller says otherwise. */
export function dailyIdempotencyKey(trigger: RunTrigger, now = new Date()): string {
  return `${trigger}:${now.toISOString().slice(0, 10)}`;
}

/**
 * A stable identity for an event, so the same happening reported twice is stored
 * once.
 *
 * Keyed on the company, the category, the date and a normalised summary rather
 * than on the source, because the point is to recognise the *event* across two
 * articles about it. Without this the "what changed?" feed repeats itself every
 * time a story is picked up elsewhere.
 */
function eventDedupeKey(
  companyId: string | null,
  category: string,
  eventDate: string | null,
  summary: string,
): string {
  const normalizedSummary = summary.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 160);
  return createHash("sha256")
    .update(
      `${companyId ?? "unattributed"}|${category}|${eventDate ?? "undated"}|${normalizedSummary}`,
    )
    .digest("hex");
}

interface SourceOutcome {
  fetched: boolean;
  claimsWritten: number;
  eventsWritten: number;
  companiesDiscovered: number;
  warnings: string[];
}

/**
 * Processes one document end to end.
 *
 * Returns rather than throws for every expected failure, and its caller wraps it
 * in a catch for the unexpected ones. Both paths lead to the same place: a
 * warning on the run and the next document.
 */
async function processOneSource(
  client: TypedSupabaseClient,
  agentRunId: string,
  candidate: { url: string; normalizedUrl: string; title: string | null; feedName: string },
  fetchImpl?: typeof fetch,
): Promise<SourceOutcome> {
  const empty: SourceOutcome = {
    fetched: false,
    claimsWritten: 0,
    eventsWritten: 0,
    companiesDiscovered: 0,
    warnings: [],
  };

  // --- Step 4: fetch, bounded and guarded --------------------------------
  const outcome: FetchOutcome = await fetchSource(candidate.url, { fetchImpl });
  if (!outcome.ok) {
    return { ...empty, warnings: [`Fetch failed for ${candidate.url}: ${outcome.reason}`] };
  }
  const document = outcome.document;

  // Content-level deduplication, after the URL check. A syndicated article
  // reaches several domains under different URLs; storing it twice would look
  // like two independent sources agreeing.
  const duplicate = await client
    .from("sources")
    .select("id, url")
    .eq("content_hash", document.contentHash)
    .limit(1)
    .maybeSingle();

  if (duplicate.data) {
    return {
      ...empty,
      warnings: [`Skipped ${candidate.url}: same content already stored as ${duplicate.data.url}`],
    };
  }

  // --- Step 5: extract, then validate ------------------------------------
  const extraction = await extractFromSource(
    {
      url: document.finalUrl,
      title: document.title ?? candidate.title,
      publisher: candidate.feedName,
      publishedAt: document.publishedAt,
    },
    document.text,
  );

  if (extraction.problem) {
    return {
      ...empty,
      fetched: true,
      warnings: [`Extraction failed for ${candidate.url}: ${extraction.problem}`],
    };
  }

  const payload: ExtractedPayload = extraction.payload;
  if (payload.claims.length === 0 && payload.events.length === 0) {
    return {
      ...empty,
      fetched: true,
      warnings: [`No claims or events found in ${candidate.url}.`],
    };
  }

  // --- Step 7: write ------------------------------------------------------
  // The source is written first and deliberately. A claim cannot exist without
  // it, and `insertClaim` rolls its own row back if the link to this source
  // fails - so the failure modes are "no source", "source with no claims" and
  // "source with claims", never "claim with no source".
  const sourceId = await upsertSource(client, {
    url: document.finalUrl,
    urlNormalized: document.normalizedUrl,
    title: document.title ?? candidate.title,
    publisher: candidate.feedName,
    sourceType: "trade_press",
    trustTier: "secondary",
    publishedAt: document.publishedAt,
    contentHash: document.contentHash,
    agentRunId,
  });

  const warnings: string[] = [];
  let claimsWritten = 0;
  let eventsWritten = 0;
  let companiesDiscovered = 0;

  // --- Step 6a: the relevance gate ---------------------------------------
  //
  // Workflow 10.2 puts a classifier between "this name is unknown" and "create a
  // company", and the first implementation skipped it. The cost was immediate
  // and visible: one article about Halloween retail spending added Fanta, Bran
  // Castle, Home Depot and the publisher itself to the monitored universe. A
  // target list that grows by every proper noun in the news is not a target
  // list.
  //
  // Two gates, and the second is not redundant. The model decides what the
  // document establishes as a financial-services business; the deterministic
  // check below refuses the publisher regardless, because an article always
  // describes its own outlet and a model asked "is this a fintech" about a
  // fintech news site can reasonably say yes.
  const publisherNames = new Set(
    [candidate.feedName, new URL(document.finalUrl).hostname.replace(/^www\./, "").split(".")[0]]
      .map(normalizeEntityName)
      .filter((name) => name !== ""),
  );

  const eligibleForDiscovery = new Set(
    payload.fintech_entities
      .filter((name) => !publisherNames.has(normalizeEntityName(name)))
      .map((name) => normalizeEntityName(name)),
  );

  const rejected = payload.fintech_entities.filter((name) =>
    publisherNames.has(normalizeEntityName(name)),
  );
  if (rejected.length > 0) {
    warnings.push(`Refused to record the publisher as a target: ${rejected.join(", ")}.`);
  }

  // --- Step 6b: resolve identities ---------------------------------------
  // Resolved once per distinct name, then reused, so the same article does not
  // re-run the resolver for every claim about the same company.
  const resolutionByName = new Map<string, string | null>();

  async function resolveOrDiscover(entityName: string): Promise<string | null> {
    const cached = resolutionByName.get(entityName);
    if (cached !== undefined) {
      return cached;
    }

    const resolution = await resolveEntity(client, entityName);
    if (resolution.outcome === "matched") {
      resolutionByName.set(entityName, resolution.companyId);
      return resolution.companyId;
    }

    // An ambiguous name is left unresolved on purpose: choosing between two
    // candidates would write one company's news onto another's record, which is
    // the one error this pipeline cannot detect afterwards.
    if (resolution.ambiguous) {
      warnings.push(`Identity ambiguous: ${resolution.reason}. Left unattributed.`);
      resolutionByName.set(entityName, null);
      return null;
    }

    // Unknown *and* not established as a financial-services business: the name
    // is recorded in the source text and goes no further. Nothing is lost -
    // whatever was said about it stays in the article - and the universe stays
    // a list of plausible targets.
    if (!eligibleForDiscovery.has(normalizeEntityName(entityName))) {
      resolutionByName.set(entityName, null);
      return null;
    }

    const created = await createDiscoveredCompany(client, {
      canonicalName: entityName,
      discoveryReason: `Named in ${document.finalUrl} during monitoring as a financial-services company.`,
      agentRunId,
    });

    if (!created.ok) {
      warnings.push(`Could not record "${entityName}": ${created.reason}`);
      resolutionByName.set(entityName, null);
      return null;
    }

    companiesDiscovered += 1;
    resolutionByName.set(entityName, created.companyId);
    return created.companyId;
  }

  for (const claim of payload.claims) {
    try {
      const companyId = await resolveOrDiscover(claim.subject_entity_name);
      if (!companyId) {
        continue;
      }

      await insertClaim(client, {
        companyId,
        subject: claim.subject_entity_name,
        // The extractor produces one statement rather than a subject/predicate
        // split, so the predicate records what kind of statement it is and the
        // statement itself is the value.
        predicate: "reported_statement",
        valueText: claim.statement,
        valueStatus: "disclosed",
        asOfDate: claim.asOf_date,
        claimKind: claim.kind,
        aiConfidence: claim.confidence,
        agentRunId,
        sources: [
          {
            sourceId,
            relation: "supports",
            // The excerpt is the extractor's statement, not raw page text: it is
            // what this system asserts the source says, and it is short.
            excerpt: claim.statement.slice(0, 500),
          },
        ],
      });
      claimsWritten += 1;
    } catch (cause) {
      warnings.push(
        `Claim from ${candidate.url} rejected: ${cause instanceof Error ? cause.message : "unknown error"}`,
      );
    }
  }

  for (const event of payload.events) {
    try {
      // Attributed to the entity the extractor says the event is about, and to
      // nothing otherwise. The first version used the first name in the
      // article, which filed a Home Depot product launch under the National
      // Retail Federation and a Microsoft outage under TechCrunch - records that
      // read exactly like correct ones. An unattributed event is still worth
      // keeping: a competitor's move matters even when the competitor is not in
      // the universe.
      const companyId = event.subject_entity_name
        ? await resolveOrDiscover(event.subject_entity_name)
        : null;

      // Only events about a company in the universe are stored.
      //
      // The same relevance gate that governs company creation has to govern the
      // change feed, or the gate only half works: the first version admitted no
      // irrelevant companies and then filed six Apple product rumours into "what
      // changed" as unattributed rows. An analyst opening that feed is asking
      // what moved among the targets, and an unanswerable row is worse than a
      // shorter list.
      //
      // Nothing relevant is lost. A competitor that matters is a financial
      // services company, so the gate admits it and its events arrive attached
      // to it. What gets dropped is what was never about a target.
      if (companyId === null) {
        continue;
      }

      const dedupeKey = eventDedupeKey(companyId, event.type, event.event_date, event.summary);

      const inserted = await client
        .from("events")
        .upsert(
          {
            company_id: companyId,
            event_category: event.type,
            // The precise subtype stays null. The extractor works in the coarse
            // vocabulary on purpose; narrowing `regulatory` to
            // `license_suspension` needs evidence a single article rarely gives.
            event_type: null,
            event_date: event.event_date,
            published_at: document.publishedAt,
            summary: event.summary,
            materiality: event.materiality,
            etoro_relevance: event.etoro_relevance_explanation,
            primary_source_id: sourceId,
            agent_run_id: agentRunId,
            dedupe_key: dedupeKey,
          },
          { onConflict: "dedupe_key", ignoreDuplicates: true },
        )
        .select("id");

      if (inserted.error) {
        warnings.push(`Event from ${candidate.url} rejected: ${inserted.error.message}`);
        continue;
      }
      if ((inserted.data ?? []).length > 0) {
        eventsWritten += 1;
      }
    } catch (cause) {
      warnings.push(
        `Event from ${candidate.url} failed: ${cause instanceof Error ? cause.message : "unknown error"}`,
      );
    }
  }

  return { fetched: true, claimsWritten, eventsWritten, companiesDiscovered, warnings };
}

/**
 * Runs one monitoring pass.
 *
 * Throws only when the run itself cannot be recorded - if the database is
 * unreachable there is nowhere to write a warning to, and pretending otherwise
 * would be the silent failure this design exists to avoid.
 */
export async function runMonitoringPass(
  options: MonitoringRunOptions,
): Promise<MonitoringRunReport> {
  const connection = createServiceClient();
  if (!connection.ok) {
    throw new Error(connection.problem.message);
  }
  const client = connection.client;

  const maxSources = options.maxSources ?? DEFAULT_MAX_SOURCES;
  const idempotencyKey = options.idempotencyKey ?? dailyIdempotencyKey(options.trigger);

  // --- Step 1: initialise -------------------------------------------------
  const { runId, reused } = await startMonitoringRun(client, options.trigger, idempotencyKey);
  if (reused) {
    return {
      runId,
      reused: true,
      status: "success",
      sourcesDiscovered: 0,
      sourcesFetched: 0,
      sourcesSkipped: 0,
      claimsWritten: 0,
      eventsWritten: 0,
      companiesDiscovered: 0,
      warnings: [`A run already exists for "${idempotencyKey}". Nothing was fetched again.`],
    };
  }

  const agentRunId = await startAgentRun(client, {
    purpose: "extractor",
    promptVersion: EXTRACTOR_PROMPT_VERSION,
    modelName: process.env.ANTHROPIC_MODEL ?? "unset",
    monitoringRunId: runId,
  });

  const warnings: string[] = [];
  let sourcesDiscovered = 0;
  let sourcesFetched = 0;
  let sourcesSkipped = 0;
  let claimsWritten = 0;
  let eventsWritten = 0;
  let companiesDiscovered = 0;
  let fatal: string | null = null;

  try {
    // --- Step 2: discover -------------------------------------------------
    const discovery = await discoverCandidates(options.feeds ?? DEFAULT_FEEDS, PER_FEED_LIMIT);
    warnings.push(...discovery.warnings);
    sourcesDiscovered = discovery.items.length;

    // --- Steps 3 to 7: deduplicate, then process, each source isolated ----
    //
    // `maxSources` bounds documents *fetched*, not candidates attempted. That
    // distinction is the difference between a pipeline that works and one that
    // silently does nothing: pre-truncating the candidate list to the budget
    // meant a publisher that blocks crawlers could consume every slot with
    // failures while the feeds that do answer were never reached. Attempts get
    // their own, looser ceiling so a completely broken candidate list still
    // terminates.
    const maxAttempts = maxSources * ATTEMPTS_PER_SOURCE;
    let attempts = 0;

    for (const candidate of discovery.items) {
      if (sourcesFetched >= maxSources || attempts >= maxAttempts) {
        break;
      }

      const seen = await client
        .from("sources")
        .select("id")
        .eq("url_normalized", candidate.normalizedUrl)
        .maybeSingle();
      if (seen.data) {
        // Already stored. Not an attempt: skipping known material is the
        // deduplication working, and it should not count against the budget.
        sourcesSkipped += 1;
        continue;
      }

      attempts += 1;
      try {
        const outcome = await processOneSource(client, agentRunId, candidate, options.fetchImpl);
        if (outcome.fetched) {
          sourcesFetched += 1;
        }
        claimsWritten += outcome.claimsWritten;
        eventsWritten += outcome.eventsWritten;
        companiesDiscovered += outcome.companiesDiscovered;
        warnings.push(...outcome.warnings);
      } catch (cause) {
        // The outer net. `processOneSource` returns its expected failures; this
        // catches the ones nobody predicted, and it is the difference between
        // losing one document and losing the run.
        warnings.push(
          `Unhandled failure on ${candidate.url}: ${cause instanceof Error ? cause.message : "unknown error"}`,
        );
      }
    }
  } catch (cause) {
    // Discovery or deduplication failed outright: nothing was read, but whatever
    // did get written stays written and the run says so.
    fatal = cause instanceof Error ? cause.message : "monitoring run failed";
    warnings.push(fatal);
  }

  // --- Step 8: finalise ---------------------------------------------------
  const status: RunStatus = fatal
    ? "failed"
    : warnings.length > 0
      ? // Warnings mean something was missed, so the run did not fully succeed.
        // Reporting it as `success` would hide exactly what an operator needs.
        "partial_success"
      : "success";

  await finishMonitoringRun(client, runId, {
    status,
    sourcesDiscovered,
    sourcesFetched,
    claimsWritten,
    eventsWritten,
    warnings,
    errorSummary: fatal,
  });

  await finishAgentRun(
    client,
    agentRunId,
    status === "failed" ? "failed" : status === "success" ? "success" : "partial_success",
    fatal ?? undefined,
  );

  return {
    runId,
    reused: false,
    status,
    sourcesDiscovered,
    sourcesFetched,
    sourcesSkipped,
    claimsWritten,
    eventsWritten,
    companiesDiscovered,
    warnings,
  };
}
