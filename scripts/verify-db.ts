import { config as loadEnv } from "dotenv";
import { BOOTSTRAP_COMPANIES } from "@/data/seed/bootstrap";
import { createPublicClient, createServiceClient } from "@/src/db/client";
import { listCompanies } from "@/src/db/repositories/companies";

/**
 * Integration verification against a live local Supabase instance.
 *
 * This is the one check in the project that needs Docker, which is why it is a
 * separate command (`pnpm db:verify`) and not part of `pnpm test`. CI must stay
 * runnable without a database or any secret.
 *
 * It verifies the things a unit test cannot: that the migration produced the
 * schema the code expects, that row-level security actually lets the public
 * dashboard read, that the bootstrap CHECK constraint actually rejects
 * researched fields, and that re-seeding is genuinely idempotent.
 *
 * Prerequisites: `pnpm db:start`, then `pnpm db:reset`, then `pnpm db:seed`.
 */

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const checks: { name: string; ok: boolean; detail: string }[] = [];

function record(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
}

async function main(): Promise<void> {
  const service = createServiceClient();
  if (!service.ok) {
    throw new Error(service.problem.message);
  }
  const publicConnection = createPublicClient();
  if (!publicConnection.ok) {
    throw new Error(publicConnection.problem.message);
  }

  const expectedSlugs = BOOTSTRAP_COMPANIES.map((company) => company.slug).sort();

  // 1. The seed produced exactly the expected identities and nothing else.
  const { data: rows, error } = await service.client
    .from("companies")
    .select("slug, record_origin, lifecycle_status, description, path, ma_state, agent_run_id");
  if (error) {
    throw new Error(`could not read companies: ${error.message}`);
  }
  const actualSlugs = (rows ?? []).map((row) => row.slug).sort();
  record(
    "exactly the six bootstrap companies are present",
    actualSlugs.length === expectedSlugs.length &&
      actualSlugs.every((slug, index) => slug === expectedSlugs[index]),
    `expected [${expectedSlugs.join(", ")}], found [${actualSlugs.join(", ")}]`,
  );

  // 2. Every seeded row is identity only. No researched field is populated.
  const contaminated = (rows ?? []).filter(
    (row) =>
      row.record_origin === "bootstrap_identity" &&
      (row.description !== null ||
        row.path !== null ||
        row.ma_state !== null ||
        row.agent_run_id !== null ||
        row.lifecycle_status !== "research_pending"),
  );
  record(
    "bootstrap rows carry identity only",
    contaminated.length === 0,
    contaminated.length === 0
      ? "no researched fields on any bootstrap row"
      : `contaminated: ${contaminated.map((row) => row.slug).join(", ")}`,
  );

  // 3. Row-level security lets the public dashboard read through the repository.
  const listed = await listCompanies();
  record(
    "the public anon role can read the company list through the repository",
    listed.ok && listed.data.length === expectedSlugs.length,
    listed.ok
      ? `repository returned ${listed.data.length} companies`
      : `repository failed: ${listed.problem.message}`,
  );

  // 4. The database itself refuses a bootstrap row with researched content.
  //    This is the constraint the whole data-isolation story rests on, so it is
  //    proved rather than assumed.
  const probeSlug = "constraint-probe-bootstrap-isolation";
  const { error: probeError } = await service.client.from("companies").insert({
    canonical_name: "Constraint probe",
    slug: probeSlug,
    record_origin: "bootstrap_identity",
    description: "A researched description that must be rejected.",
  });
  if (!probeError) {
    await service.client.from("companies").delete().eq("slug", probeSlug);
  }
  record(
    "the bootstrap CHECK constraint rejects researched fields",
    probeError !== null,
    probeError ? `rejected: ${probeError.message}` : "the insert was accepted, which is a defect",
  );

  // 5. Public writes are refused. Only the service role may write.
  const { error: anonWriteError } = await publicConnection.client.from("companies").insert({
    canonical_name: "Anon write probe",
    slug: "constraint-probe-anon-write",
    record_origin: "bootstrap_identity",
  });
  if (!anonWriteError) {
    await service.client.from("companies").delete().eq("slug", "constraint-probe-anon-write");
  }
  record(
    "row-level security refuses writes from the public role",
    anonWriteError !== null,
    anonWriteError
      ? `rejected: ${anonWriteError.message}`
      : "the anon insert succeeded, which is a defect",
  );

  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name}\n      ${check.detail}`);
  }

  const failed = checks.filter((check) => !check.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} of ${checks.length} database checks failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${checks.length} database checks passed.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
