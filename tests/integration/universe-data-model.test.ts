import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { BOOTSTRAP_COMPANIES } from "@/data/seed/bootstrap";
import { createServiceClient } from "@/src/db/client";
import type { Database } from "@/src/db/types.generated";
import {
  COMPANY_STAGES,
  companyDiscoveryObservationContractSchema,
  companyExternalIdContractSchema,
} from "@/tests/specifications/universe-data-model";

/**
 * Milestone 19A.1 - the Universe data model acceptance contract.
 *
 * These tests are written and run BEFORE any production schema, repository or
 * type exists. They are the specification; phase 19A.2 has to move them from
 * RED to GREEN without weakening them. The order matters: an implementation
 * that writes its own tests afterwards only proves that it agrees with itself.
 *
 * Everything is asserted at the persistence boundary rather than through a
 * repository, for two reasons. The generated database types cannot describe
 * tables that do not exist yet, so a repository-shaped test would fail to
 * resolve a module rather than fail on the missing behavior; and the contract
 * is deliberately about what the database guarantees, not about the shape of
 * the TypeScript API that 19A.2 chooses to put in front of it.
 *
 * Consequently the new-model reads and writes go through a schema-agnostic
 * client and are validated with the Zod contract schemas in
 * `tests/specifications/universe-data-model.ts`. Tables that already exist are
 * still read through the typed client.
 */

const EXTERNAL_IDS_TABLE = "company_external_ids";
const OBSERVATIONS_TABLE = "company_discovery_observations";
const STAGE_COLUMN = "company_stage";

function typedServiceClient() {
  const connection = createServiceClient();
  if (!connection.ok) {
    throw new Error(connection.problem.message);
  }
  return connection.client;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set for the Universe acceptance suite`);
  }
  return value;
}

/**
 * Service-role client with no compile-time schema.
 *
 * Deliberately untyped: `Database` is generated from the current database, so
 * naming a table it does not contain would be a TypeScript error rather than
 * the runtime "relation does not exist" that this phase exists to observe.
 */
function schemalessServiceClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
}

/** Anon client: the ordinary user-facing privilege level, constrained by RLS. */
function schemalessAnonClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false } },
  );
}

function typedAnonClient() {
  return createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false } },
  );
}

const suffix = `${Date.now()}${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
const alphaSlug = `universe-alpha-${suffix}`;
const betaSlug = `universe-beta-${suffix}`;
const stubOwnedSlug = `universe-stub-owned-${suffix}`;

/** Every provider namespace this suite writes, so cleanup can find its rows. */
const fixtureProviders = [
  `test-registry-a-${suffix}`,
  `test-registry-b-${suffix}`,
  `test-discovery-a-${suffix}`,
  `test-discovery-b-${suffix}`,
];

let alphaCompanyId: string;
let betaCompanyId: string;
let stubOwnedCompanyId: string;
let stubRunId: string;

/** Company slugs that existed before this suite created anything. */
let preExistingSlugs: string[] = [];

async function createIdentity(slug: string): Promise<string> {
  const { data, error } = await typedServiceClient()
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

beforeAll(async () => {
  const existing = await typedServiceClient().from("companies").select("slug");
  if (existing.error) throw new Error(existing.error.message);
  preExistingSlugs = existing.data.map((row) => row.slug).sort();

  alphaCompanyId = await createIdentity(alphaSlug);
  betaCompanyId = await createIdentity(betaSlug);

  const run = await typedServiceClient()
    .from("agent_runs")
    .insert({ purpose: "universe-19a-acceptance", status: "success", is_stub: true })
    .select("id")
    .single();
  if (run.error || !run.data) throw new Error(run.error?.message ?? "no agent run returned");
  stubRunId = run.data.id;

  const stubOwned = await typedServiceClient()
    .from("companies")
    .insert({
      slug: stubOwnedSlug,
      canonical_name: stubOwnedSlug,
      record_origin: "agent_generated",
      entity_role: "operating_company",
      agent_run_id: stubRunId,
    })
    .select("id")
    .single();
  if (stubOwned.error || !stubOwned.data) {
    throw new Error(stubOwned.error?.message ?? "no stub-owned company returned");
  }
  stubOwnedCompanyId = stubOwned.data.id;
});

afterAll(async () => {
  // The new tables may not exist yet, so their cleanup is best-effort. The
  // companies and the agent run always exist and must always be removed.
  const schemaless = schemalessServiceClient();
  for (const table of [EXTERNAL_IDS_TABLE, OBSERVATIONS_TABLE]) {
    await schemaless.from(table).delete().in("provider", fixtureProviders);
  }

  const db = typedServiceClient();
  await db.from("companies").delete().in("id", [alphaCompanyId, betaCompanyId, stubOwnedCompanyId]);
  await db.from("agent_runs").delete().eq("id", stubRunId);
});

describe("Universe data model - company identity compatibility", () => {
  it("A: preserves the six bootstrap company identities exactly as seeded", async () => {
    const { data, error } = await typedServiceClient()
      .from("companies")
      .select(
        "slug, canonical_name, legal_entity_name, primary_domain, record_origin, lifecycle_status",
      )
      .in(
        "slug",
        BOOTSTRAP_COMPANIES.map((company) => company.slug),
      );

    expect(error).toBeNull();
    expect(data).toHaveLength(BOOTSTRAP_COMPANIES.length);

    for (const seeded of BOOTSTRAP_COMPANIES) {
      const stored = data?.find((row) => row.slug === seeded.slug);
      expect(stored, `bootstrap identity ${seeded.slug} must still exist`).toBeDefined();
      expect(stored).toMatchObject({
        canonical_name: seeded.canonicalName,
        legal_entity_name: seeded.legalEntityName,
        primary_domain: seeded.primaryDomain,
        record_origin: "bootstrap_identity",
        lifecycle_status: "research_pending",
      });
    }
  });

  it("A2: contains no company beyond the six bootstrap identities", () => {
    // Snapshotted before this suite inserted its own fixtures, so it measures
    // the real universe rather than the test's own leftovers.
    const expected = BOOTSTRAP_COMPANIES.map((company) => company.slug).sort();
    expect(preExistingSlugs).toEqual(expected);
  });

  it("B: gives every existing company a truthful, unfabricated stage", async () => {
    const { data, error } = await schemalessServiceClient()
      .from("companies")
      .select(`slug, ${STAGE_COLUMN}`);

    expect(error, "companies must expose a canonical stage column").toBeNull();
    expect(data).not.toBeNull();

    const rows: Array<Record<string, unknown>> = data ?? [];
    for (const row of rows) {
      expect(COMPANY_STAGES, `${row.slug} has a stage outside the vocabulary`).toContain(
        row[STAGE_COLUMN],
      );
    }

    for (const seeded of BOOTSTRAP_COMPANIES) {
      const stored = rows.find((row) => row.slug === seeded.slug);
      expect(stored, `bootstrap identity ${seeded.slug} must still exist`).toBeDefined();
      // No bootstrap identity has been researched, so any stage other than
      // `unknown` would be a value the migration invented.
      expect(stored?.[STAGE_COLUMN], `${seeded.slug} must not receive a fabricated stage`).toBe(
        "unknown",
      );
    }
  });
});

describe("Universe data model - company external identifiers", () => {
  it("C: stores an external identifier against a canonical company", async () => {
    const provider = fixtureProviders[0];
    const externalId = `c-${suffix}`;

    const inserted = await schemalessServiceClient()
      .from(EXTERNAL_IDS_TABLE)
      .insert({ company_id: alphaCompanyId, provider, external_id: externalId })
      .select("company_id, provider, external_id")
      .single();

    expect(inserted.error, "an external identifier must be storable").toBeNull();

    const parsed = companyExternalIdContractSchema.safeParse({
      companyId: inserted.data?.company_id,
      provider: inserted.data?.provider,
      externalId: inserted.data?.external_id,
    });
    expect(parsed.success, JSON.stringify(parsed.error?.issues ?? [])).toBe(true);
    expect(inserted.data?.company_id).toBe(alphaCompanyId);
  });

  it("D: lets one company hold identifiers from several providers", async () => {
    const db = schemalessServiceClient();
    const first = { provider: fixtureProviders[1], external_id: `d1-${suffix}` };
    const second = { provider: fixtureProviders[2], external_id: `d2-${suffix}` };

    const inserted = await db
      .from(EXTERNAL_IDS_TABLE)
      .insert([
        { company_id: alphaCompanyId, ...first },
        { company_id: alphaCompanyId, ...second },
      ])
      .select("provider, external_id");

    expect(inserted.error, "a company must accept identifiers from many providers").toBeNull();

    const listed = await db
      .from(EXTERNAL_IDS_TABLE)
      .select("provider, external_id")
      .eq("company_id", alphaCompanyId)
      .in("external_id", [first.external_id, second.external_id]);

    expect(listed.error).toBeNull();
    expect(listed.data).toHaveLength(2);
    expect(new Set((listed.data ?? []).map((row) => row.provider))).toEqual(
      new Set([first.provider, second.provider]),
    );
  });

  it("E: refuses to map one provider identity to two canonical companies", async () => {
    const db = schemalessServiceClient();
    const provider = fixtureProviders[0];
    const externalId = `e-${suffix}`;

    const claimed = await db
      .from(EXTERNAL_IDS_TABLE)
      .insert({ company_id: alphaCompanyId, provider, external_id: externalId })
      .select("company_id")
      .single();
    expect(claimed.error, "the first company must be able to claim the identity").toBeNull();

    const ambiguous = await db
      .from(EXTERNAL_IDS_TABLE)
      .insert({ company_id: betaCompanyId, provider, external_id: externalId })
      .select("company_id");
    expect(
      ambiguous.error,
      "a second company must not be able to claim the same provider identity",
    ).not.toBeNull();

    const resolved = await db
      .from(EXTERNAL_IDS_TABLE)
      .select("company_id")
      .eq("provider", provider)
      .eq("external_id", externalId);
    expect(resolved.error).toBeNull();
    expect(resolved.data).toHaveLength(1);
    expect(resolved.data?.[0]?.company_id).toBe(alphaCompanyId);
  });

  it("F: resolves a canonical company from provider and external id", async () => {
    const db = schemalessServiceClient();
    const provider = fixtureProviders[1];
    const externalId = `f-${suffix}`;

    const inserted = await db
      .from(EXTERNAL_IDS_TABLE)
      .insert({ company_id: betaCompanyId, provider, external_id: externalId })
      .select("company_id")
      .single();
    expect(inserted.error).toBeNull();

    const lookup = await db
      .from(EXTERNAL_IDS_TABLE)
      .select("company_id")
      .eq("provider", provider)
      .eq("external_id", externalId)
      .maybeSingle();

    expect(lookup.error, "lookup by provider and external id must be possible").toBeNull();
    expect(lookup.data?.company_id).toBe(betaCompanyId);

    const company = await typedServiceClient()
      .from("companies")
      .select("slug")
      .eq("id", lookup.data?.company_id ?? "")
      .maybeSingle();
    expect(company.error).toBeNull();
    expect(company.data?.slug).toBe(betaSlug);
  });

  it("F2: keeps the provider namespace open rather than a closed enum", async () => {
    // A provider nobody has heard of must be storable without a schema change,
    // because the point of the namespace is that Universe expansion will add
    // sources the data model was never told about.
    const provider = `test-registry-unforeseen-${suffix}`;
    fixtureProviders.push(provider);

    const inserted = await schemalessServiceClient()
      .from(EXTERNAL_IDS_TABLE)
      .insert({ company_id: alphaCompanyId, provider, external_id: `f2-${suffix}` })
      .select("provider")
      .single();

    expect(inserted.error, "an unforeseen provider must not require a migration").toBeNull();
    expect(inserted.data?.provider).toBe(provider);
  });
});

describe("Universe data model - discovery observations", () => {
  it("G: records an observation before any canonical company is known", async () => {
    const provider = fixtureProviders[2];
    const now = new Date().toISOString();

    const inserted = await schemalessServiceClient()
      .from(OBSERVATIONS_TABLE)
      .insert({
        company_id: null,
        provider,
        observed_name: `Unresolved Discovery ${suffix}`,
        observed_domain: `unresolved-${suffix}.test`,
        observed_geography: "DE",
        source_record_id: `g-${suffix}`,
        source_url: `https://unresolved-${suffix}.test/record`,
        first_seen_at: now,
        last_seen_at: now,
        raw_metadata: { note: "unresolved observation" },
      })
      .select(
        "company_id, provider, observed_name, observed_domain, observed_geography, source_record_id, source_url, first_seen_at, last_seen_at, raw_metadata",
      )
      .single();

    expect(inserted.error, "an observation must be storable before entity resolution").toBeNull();
    expect(inserted.data?.company_id).toBeNull();

    const parsed = companyDiscoveryObservationContractSchema.safeParse({
      companyId: inserted.data?.company_id ?? null,
      provider: inserted.data?.provider,
      observedName: inserted.data?.observed_name,
      observedDomain: inserted.data?.observed_domain ?? null,
      observedGeography: inserted.data?.observed_geography ?? null,
      sourceRecordId: inserted.data?.source_record_id ?? null,
      sourceUrl: inserted.data?.source_url ?? null,
      firstSeenAt: inserted.data?.first_seen_at,
      lastSeenAt: inserted.data?.last_seen_at,
      rawMetadata: inserted.data?.raw_metadata ?? null,
    });
    expect(parsed.success, JSON.stringify(parsed.error?.issues ?? [])).toBe(true);
  });

  it("H: lets an unresolved observation later reference a canonical company", async () => {
    const db = schemalessServiceClient();
    const provider = fixtureProviders[2];
    const now = new Date().toISOString();

    const inserted = await db
      .from(OBSERVATIONS_TABLE)
      .insert({
        company_id: null,
        provider,
        observed_name: `Resolvable Discovery ${suffix}`,
        source_record_id: `h-${suffix}`,
        first_seen_at: now,
        last_seen_at: now,
      })
      .select("id, company_id")
      .single();
    expect(inserted.error, "an unresolved observation must be storable").toBeNull();
    expect(inserted.data?.company_id).toBeNull();

    const resolvedRow = await db
      .from(OBSERVATIONS_TABLE)
      .update({ company_id: alphaCompanyId })
      .eq("id", inserted.data?.id)
      .select("id, company_id")
      .single();

    expect(resolvedRow.error, "resolution must be an update, not a new record").toBeNull();
    expect(resolvedRow.data?.id).toBe(inserted.data?.id);
    expect(resolvedRow.data?.company_id).toBe(alphaCompanyId);
  });

  it("I: re-observing a stable source record updates it instead of duplicating it", async () => {
    const db = schemalessServiceClient();
    const provider = fixtureProviders[3];
    const sourceRecordId = `i-${suffix}`;
    const firstSeen = new Date(Date.now() - 86_400_000).toISOString();
    const secondSeen = new Date().toISOString();

    const first = await db
      .from(OBSERVATIONS_TABLE)
      .upsert(
        {
          company_id: null,
          provider,
          observed_name: `Repeatedly Observed ${suffix}`,
          source_record_id: sourceRecordId,
          first_seen_at: firstSeen,
          last_seen_at: firstSeen,
        },
        { onConflict: "provider,source_record_id" },
      )
      .select("first_seen_at, last_seen_at");
    expect(first.error, "the first observation must be storable").toBeNull();

    // A second sighting reports its own "first seen" naively, as a provider
    // replay would. Provenance must keep the earliest sighting rather than the
    // most recent claim about it.
    const second = await db
      .from(OBSERVATIONS_TABLE)
      .upsert(
        {
          company_id: null,
          provider,
          observed_name: `Repeatedly Observed ${suffix}`,
          source_record_id: sourceRecordId,
          first_seen_at: secondSeen,
          last_seen_at: secondSeen,
        },
        { onConflict: "provider,source_record_id" },
      )
      .select("first_seen_at, last_seen_at");
    expect(second.error, "re-observing the same record must not be rejected").toBeNull();

    const stored = await db
      .from(OBSERVATIONS_TABLE)
      .select("first_seen_at, last_seen_at")
      .eq("provider", provider)
      .eq("source_record_id", sourceRecordId);

    expect(stored.error).toBeNull();
    expect(stored.data, "a stable source record must not accumulate duplicates").toHaveLength(1);
    expect(
      new Date(stored.data?.[0]?.first_seen_at ?? 0).toISOString(),
      "first_seen_at must remain the earliest sighting",
    ).toBe(new Date(firstSeen).toISOString());
    expect(
      new Date(stored.data?.[0]?.last_seen_at ?? 0).toISOString(),
      "last_seen_at must advance to the newest sighting",
    ).toBe(new Date(secondSeen).toISOString());
  });

  it("J: lets independent sources observe the same canonical company", async () => {
    const db = schemalessServiceClient();
    const now = new Date().toISOString();

    const inserted = await db
      .from(OBSERVATIONS_TABLE)
      .insert([
        {
          company_id: alphaCompanyId,
          provider: fixtureProviders[2],
          observed_name: `Alpha As Seen By A ${suffix}`,
          source_record_id: `j-a-${suffix}`,
          first_seen_at: now,
          last_seen_at: now,
        },
        {
          company_id: alphaCompanyId,
          provider: fixtureProviders[3],
          observed_name: `Alpha As Seen By B ${suffix}`,
          source_record_id: `j-b-${suffix}`,
          first_seen_at: now,
          last_seen_at: now,
        },
      ])
      .select("id, provider");
    expect(inserted.error, "two providers must be able to observe one company").toBeNull();

    const stored = await db
      .from(OBSERVATIONS_TABLE)
      .select("id, provider")
      .eq("company_id", alphaCompanyId)
      .in("source_record_id", [`j-a-${suffix}`, `j-b-${suffix}`]);

    expect(stored.error).toBeNull();
    expect(stored.data, "both observations must be preserved as distinct records").toHaveLength(2);
    expect(new Set((stored.data ?? []).map((row) => row.provider)).size).toBe(2);
  });

  it("K: keeps raw discovery metadata out of ordinary user-facing access", async () => {
    const sentinel = `raw-metadata-sentinel-${suffix}`;
    const provider = fixtureProviders[3];
    const now = new Date().toISOString();

    const inserted = await schemalessServiceClient()
      .from(OBSERVATIONS_TABLE)
      .insert({
        company_id: alphaCompanyId,
        provider,
        observed_name: `Metadata Carrier ${suffix}`,
        source_record_id: `k-${suffix}`,
        first_seen_at: now,
        last_seen_at: now,
        raw_metadata: { providerPayload: sentinel },
      })
      .select("raw_metadata")
      .single();

    // The internal path must genuinely hold the payload, otherwise the privacy
    // assertion below would pass simply because nothing was ever stored.
    expect(inserted.error, "raw metadata must be retained for internal use").toBeNull();
    expect(JSON.stringify(inserted.data?.raw_metadata)).toContain(sentinel);

    const anon = schemalessAnonClient();
    const wholeRow = await anon.from(OBSERVATIONS_TABLE).select("*");
    const metadataOnly = await anon.from(OBSERVATIONS_TABLE).select("raw_metadata");

    // Any mechanism is acceptable - no public policy, a restricted view, column
    // privileges - as long as the payload never reaches an ordinary reader.
    for (const attempt of [wholeRow, metadataOnly]) {
      if (attempt.error) continue;
      expect(
        JSON.stringify(attempt.data ?? []),
        "raw provider metadata must not be publicly readable",
      ).not.toContain(sentinel);
    }
  });
});

describe("Universe data model - Milestone 18 isolation", () => {
  it("L: still hides a company introduced by a synthetic run from public reads", async () => {
    const service = await typedServiceClient()
      .from("companies")
      .select("slug")
      .eq("id", stubOwnedCompanyId)
      .maybeSingle();
    expect(service.error).toBeNull();
    expect(service.data?.slug, "the service role must still see synthetic fixtures").toBe(
      stubOwnedSlug,
    );

    const anon = await typedAnonClient()
      .from("companies")
      .select("slug")
      .eq("id", stubOwnedCompanyId)
      .maybeSingle();
    expect(anon.error).toBeNull();
    expect(anon.data, "a stub-owned identity must remain invisible to public reads").toBeNull();
  });

  it("L2: does not let an external identifier expose a stub-isolated company", async () => {
    const provider = fixtureProviders[0];
    const externalId = `l2-${suffix}`;

    const inserted = await schemalessServiceClient()
      .from(EXTERNAL_IDS_TABLE)
      .insert({ company_id: stubOwnedCompanyId, provider, external_id: externalId })
      .select("company_id")
      .single();
    expect(inserted.error, "the internal path must be able to store the identifier").toBeNull();

    const anon = await schemalessAnonClient()
      .from(EXTERNAL_IDS_TABLE)
      .select("company_id, provider, external_id")
      .eq("provider", provider)
      .eq("external_id", externalId);

    // The new table must not become a side channel that reveals an identity the
    // production universe has deliberately hidden.
    if (!anon.error) {
      expect(anon.data ?? [], "a stub-isolated company must not surface here").toHaveLength(0);
    }
  });
});
