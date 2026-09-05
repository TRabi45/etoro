import type { TypedSupabaseClient } from "@/src/db/client";
import { normalizeEntityName } from "@/src/validation/identity";

/**
 * Entity resolution.
 *
 * The question this answers is "is the company this article names one we already
 * track?" - and the expensive mistake is answering yes when the answer is no.
 *
 * A false merge is not recoverable by looking harder later. It writes one
 * company's funding round, licences and risk events onto another company's
 * record, and every downstream artefact - the evidence packet, the score, the
 * recommendation, the analyst's read of it - inherits the error with no visible
 * seam. A false *split* costs a duplicate row that a human can merge in a minute.
 * The asymmetry is total, so the resolver is built to under-match.
 *
 * `B2C2` and `Bit2C` are the standing example, and they are not hypothetical:
 * the assignment brief names B2C2 while the public evidence supports a 2026
 * eToro transaction with Bit2C, a different company. Any resolver that measures
 * string similarity merges them. This one never measures similarity - it
 * compares normalised strings for equality, which is a different operation with
 * a different failure mode.
 */

export type IdentityMatchMethod = "domain" | "canonical_name" | "alias";

export interface ResolvedIdentity {
  outcome: "matched";
  companyId: string;
  slug: string;
  canonicalName: string;
  method: IdentityMatchMethod;
}

export interface UnresolvedIdentity {
  outcome: "unresolved";
  /** Why no confident match was made, recorded as a run warning. */
  reason: string;
  /** True when several companies matched and choosing would be a coin toss. */
  ambiguous: boolean;
}

export type IdentityResolution = ResolvedIdentity | UnresolvedIdentity;

interface CompanyRow {
  id: string;
  slug: string;
  canonical_name: string;
  legal_entity_name: string | null;
}

/** Extracts a registrable hostname from a name that is really a domain. */
function domainFromName(name: string): string | null {
  const trimmed = name.trim().toLowerCase();
  const candidate = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const host = new URL(candidate).hostname.replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

/**
 * Resolves one extracted entity name against the companies already recorded.
 *
 * Evidence is tried strongest first and the search stops at the first level that
 * answers, so a domain match is never overridden by a weaker name match.
 */
export async function resolveEntity(
  client: TypedSupabaseClient,
  entityName: string,
): Promise<IdentityResolution> {
  const normalized = normalizeEntityName(entityName);
  if (normalized === "") {
    return {
      outcome: "unresolved",
      reason: `"${entityName}" normalises to an empty string`,
      ambiguous: false,
    };
  }

  // --- 1. Domain, when the name is actually a domain -----------------------
  // The strongest evidence available: a registered domain identifies one
  // operator, where a brand name may not.
  const domain = domainFromName(entityName);
  if (domain) {
    const byDomain = await client
      .from("company_domains")
      .select("company_id, companies(id, slug, canonical_name, legal_entity_name)")
      .eq("domain", domain)
      .limit(2);

    const rows = (byDomain.data ?? []).flatMap((row) =>
      row.companies ? [row.companies as unknown as CompanyRow] : [],
    );
    if (rows.length === 1) {
      return {
        outcome: "matched",
        companyId: rows[0].id,
        slug: rows[0].slug,
        canonicalName: rows[0].canonical_name,
        method: "domain",
      };
    }
    if (rows.length > 1) {
      return {
        outcome: "unresolved",
        reason: `domain ${domain} is registered against more than one company`,
        ambiguous: true,
      };
    }
  }

  // --- 2. Exact match on a normalised canonical or legal name --------------
  // Equality after normalisation, never similarity. "DFNS SAS" and "Dfns" both
  // normalise to "dfns" and match; "b2c2" and "bit2c" do not, and no amount of
  // resemblance will make them.
  const candidates = await client
    .from("companies")
    .select("id, slug, canonical_name, legal_entity_name");

  if (candidates.error) {
    return {
      outcome: "unresolved",
      reason: `could not read companies: ${candidates.error.message}`,
      ambiguous: false,
    };
  }

  const nameMatches = (candidates.data ?? []).filter(
    (row) =>
      normalizeEntityName(row.canonical_name) === normalized ||
      (row.legal_entity_name !== null && normalizeEntityName(row.legal_entity_name) === normalized),
  );

  if (nameMatches.length === 1) {
    return {
      outcome: "matched",
      companyId: nameMatches[0].id,
      slug: nameMatches[0].slug,
      canonicalName: nameMatches[0].canonical_name,
      method: "canonical_name",
    };
  }
  if (nameMatches.length > 1) {
    // Two tracked companies normalise identically. Picking one would be a coin
    // toss recorded as a fact, so the pipeline records the collision instead and
    // leaves it for a human.
    return {
      outcome: "unresolved",
      reason: `"${entityName}" matches ${nameMatches.length} companies by name (${nameMatches
        .map((row) => row.slug)
        .join(", ")})`,
      ambiguous: true,
    };
  }

  // --- 3. Aliases ----------------------------------------------------------
  // Former names, brands and legal entities recorded deliberately by research.
  // An alias is curated evidence, which is why it is trusted at all - and why it
  // is still matched by equality.
  const aliases = await client
    .from("company_aliases")
    .select("company_id, alias, companies(id, slug, canonical_name, legal_entity_name)");

  if (!aliases.error) {
    const aliasMatches = (aliases.data ?? []).filter(
      (row) => normalizeEntityName(row.alias) === normalized,
    );
    const distinct = new Map<string, CompanyRow>();
    for (const row of aliasMatches) {
      const company = row.companies as unknown as CompanyRow | null;
      if (company) {
        distinct.set(company.id, company);
      }
    }

    if (distinct.size === 1) {
      const company = [...distinct.values()][0];
      return {
        outcome: "matched",
        companyId: company.id,
        slug: company.slug,
        canonicalName: company.canonical_name,
        method: "alias",
      };
    }
    if (distinct.size > 1) {
      return {
        outcome: "unresolved",
        reason: `"${entityName}" is an alias of ${distinct.size} companies`,
        ambiguous: true,
      };
    }
  }

  return {
    outcome: "unresolved",
    reason: `"${entityName}" does not match any recorded company`,
    ambiguous: false,
  };
}
