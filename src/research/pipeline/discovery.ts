import type { TypedSupabaseClient } from "@/src/db/client";

/**
 * Recording a company the pipeline has never seen before.
 *
 * Workflow 10.2: an event names a company outside the monitored universe, so a
 * row is created for it. Two constraints shape what that row may contain.
 *
 * First, it is `discovered_unreviewed` and stays that way until a human looks at
 * it. The dashboard is expected to keep these separate from the reviewed
 * universe, because a name pulled out of one article is not a screened target
 * and presenting it as one would quietly inflate the universe with whatever the
 * press happened to mention.
 *
 * Second, it is identity only - name, slug, discovery reason. No theme, no path,
 * no M&A state, no description. Those are research conclusions, and the pipeline
 * has done no research: it has read one article. Writing a guessed theme here
 * would put an unevidenced judgement into a controlled field, where everything
 * downstream would treat it as established.
 */

export type CreateDiscoveredCompanyResult =
  { ok: true; companyId: string; slug: string } | { ok: false; reason: string };

export interface CreateDiscoveredCompanyInput {
  canonicalName: string;
  discoveryReason: string;
  agentRunId: string;
}

/** Builds a slug the schema will accept, with a suffix if the name collides. */
export function slugFromName(name: string, suffix = ""): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");

  const safe = base === "" ? "discovered" : base;
  return suffix === "" ? safe : `${safe}-${suffix}`;
}

export async function createDiscoveredCompany(
  client: TypedSupabaseClient,
  input: CreateDiscoveredCompanyInput,
): Promise<CreateDiscoveredCompanyResult> {
  const trimmed = input.canonicalName.trim();
  if (trimmed === "") {
    return { ok: false, reason: "entity name was empty" };
  }

  // A slug collision means a *different* company already owns the readable slug.
  // Two attempts, then give up: silently inventing `acme-4` for the fifth
  // collision suggests a resolution problem worth a warning rather than a
  // workaround.
  for (const suffix of ["", "2", "3"]) {
    const slug = slugFromName(trimmed, suffix);
    const { data, error } = await client
      .from("companies")
      .insert({
        canonical_name: trimmed,
        slug,
        record_origin: "agent_generated",
        lifecycle_status: "discovered_unreviewed",
        discovery_reason: input.discoveryReason,
        agent_run_id: input.agentRunId,
      })
      .select("id, slug")
      .single();

    if (!error && data) {
      return { ok: true, companyId: data.id, slug: data.slug };
    }
    // 23505 is a unique violation - here, the slug. Anything else is a real
    // failure and retrying with a different slug would not help.
    if (error && error.code !== "23505") {
      return { ok: false, reason: error.message };
    }
  }

  return { ok: false, reason: `could not find a free slug for "${trimmed}"` };
}
