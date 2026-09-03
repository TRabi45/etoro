import { config as loadEnv } from "dotenv";
import { BOOTSTRAP_COMPANIES } from "@/data/seed/bootstrap";
import { createServiceClient, type TypedSupabaseClient } from "@/src/db/client";
import { bootstrapUniverseSchema } from "@/src/validation/bootstrap";

/**
 * Seeds the minimal bootstrap universe.
 *
 * Idempotent by construction: companies are upserted on their slug, and child
 * rows are inserted only when an equivalent row is absent. Running this script
 * twice leaves the database in exactly the state one run leaves it in, which
 * matters because `db:reset` and a manual re-seed are both normal operations.
 *
 * The data is validated against the strict bootstrap schema before a single
 * write is attempted, so a record carrying researched fields fails here rather
 * than reaching the database - and the database would reject it anyway.
 */

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

interface SeedCounts {
  companies: number;
  aliases: number;
  domains: number;
  searchLeads: number;
}

async function seedCompany(
  client: TypedSupabaseClient,
  company: (typeof BOOTSTRAP_COMPANIES)[number],
  counts: SeedCounts,
): Promise<void> {
  const { data: upserted, error: companyError } = await client
    .from("companies")
    .upsert(
      {
        canonical_name: company.canonicalName,
        slug: company.slug,
        legal_entity_name: company.legalEntityName,
        primary_domain: company.primaryDomain,
        // Identity, not research. The matching CHECK constraint on `companies`
        // enforces that everything else stays null.
        record_origin: "bootstrap_identity",
        lifecycle_status: "research_pending",
        theme_tags: company.themeTags,
        enabling_layers: company.enablingLayers,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();

  if (companyError || !upserted) {
    throw new Error(
      `failed to seed ${company.slug}: ${companyError?.message ?? "no row returned"}`,
    );
  }
  counts.companies += 1;
  const companyId = upserted.id;

  // Aliases: insert the ones that are not already recorded. Comparison is
  // case-insensitive, matching the unique index on the table.
  const { data: existingAliases, error: aliasReadError } = await client
    .from("company_aliases")
    .select("alias")
    .eq("company_id", companyId);
  if (aliasReadError) {
    throw new Error(`failed to read aliases for ${company.slug}: ${aliasReadError.message}`);
  }
  const knownAliases = new Set((existingAliases ?? []).map((row) => row.alias.toLowerCase()));
  const newAliases = company.aliases.filter(
    (alias) => !knownAliases.has(alias.alias.toLowerCase()),
  );
  if (newAliases.length > 0) {
    const { error } = await client.from("company_aliases").insert(
      newAliases.map((alias) => ({
        company_id: companyId,
        alias: alias.alias,
        alias_kind: alias.aliasKind,
        is_exact_legal_entity: alias.isExactLegalEntity,
        notes: alias.notes ?? null,
      })),
    );
    if (error) {
      throw new Error(`failed to seed aliases for ${company.slug}: ${error.message}`);
    }
    counts.aliases += newAliases.length;
  }

  // Domains are globally unique, so an existing row may belong to this company
  // already; only insert when nothing owns the domain yet.
  const { data: existingDomain, error: domainReadError } = await client
    .from("company_domains")
    .select("id")
    .eq("domain", company.primaryDomain)
    .maybeSingle();
  if (domainReadError) {
    throw new Error(`failed to read domain for ${company.slug}: ${domainReadError.message}`);
  }
  if (!existingDomain) {
    const { error } = await client.from("company_domains").insert({
      company_id: companyId,
      domain: company.primaryDomain,
      is_primary: true,
    });
    if (error) {
      throw new Error(`failed to seed domain for ${company.slug}: ${error.message}`);
    }
    counts.domains += 1;
  }

  const { data: existingLeads, error: leadReadError } = await client
    .from("company_search_leads")
    .select("label")
    .eq("company_id", companyId);
  if (leadReadError) {
    throw new Error(`failed to read search leads for ${company.slug}: ${leadReadError.message}`);
  }
  const knownLeads = new Set((existingLeads ?? []).map((row) => row.label.toLowerCase()));
  const newLeads = company.searchLeads.filter((lead) => !knownLeads.has(lead.label.toLowerCase()));
  if (newLeads.length > 0) {
    const { error } = await client.from("company_search_leads").insert(
      newLeads.map((lead) => ({
        company_id: companyId,
        label: lead.label,
        query: lead.query ?? null,
      })),
    );
    if (error) {
      throw new Error(`failed to seed search leads for ${company.slug}: ${error.message}`);
    }
    counts.searchLeads += newLeads.length;
  }
}

async function main(): Promise<void> {
  const universe = bootstrapUniverseSchema.parse(BOOTSTRAP_COMPANIES);

  const connection = createServiceClient();
  if (!connection.ok) {
    throw new Error(connection.problem.message);
  }

  const counts: SeedCounts = { companies: 0, aliases: 0, domains: 0, searchLeads: 0 };
  for (const company of universe) {
    await seedCompany(connection.client, company, counts);
  }

  console.log(
    `Bootstrap seed complete: ${counts.companies} companies upserted, ` +
      `${counts.aliases} aliases, ${counts.domains} domains, ${counts.searchLeads} search leads inserted.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
