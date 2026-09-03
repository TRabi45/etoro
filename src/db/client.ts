import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/src/db/types.generated";

/**
 * Database clients.
 *
 * Two clients, two privilege levels, and nothing in between:
 *
 *   - the public client uses the anon key and is constrained by row-level
 *     security to reading the dashboard tables;
 *   - the service client uses the service-role key, bypasses RLS, and is the
 *     only way anything is ever written. It must never be constructed in code
 *     that can reach the browser.
 *
 * Missing configuration is returned as a value rather than thrown. A deployed
 * dashboard with an unset environment variable should render an honest
 * configuration error, not a stack trace - and `next build` has to succeed in CI
 * where no credentials exist at all.
 */

export type TypedSupabaseClient = SupabaseClient<Database>;

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .min(1)
    .regex(/^https?:\/\//, "must be an absolute URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serviceEnvironmentSchema = publicEnvironmentSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export interface ConfigurationProblem {
  kind: "configuration";
  message: string;
  missing: string[];
}

export type ClientResult =
  { ok: true; client: TypedSupabaseClient } | { ok: false; problem: ConfigurationProblem };

function describeMissing(issues: z.core.$ZodIssue[]): ConfigurationProblem {
  const missing = [...new Set(issues.map((issue) => issue.path.join(".")))];
  return {
    kind: "configuration",
    message: `Supabase is not configured. Set ${missing.join(", ")} in .env.local (see .env.example).`,
    missing,
  };
}

/**
 * Reads are never served from a build-time cache: this dashboard exists to show
 * the current state of the database, and a stale snapshot would misrepresent
 * freshness, which the product is specifically supposed to surface.
 */
const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

/** Read-only client for server-rendered dashboard queries. */
export function createPublicClient(env: NodeJS.ProcessEnv = process.env): ClientResult {
  const parsed = publicEnvironmentSchema.safeParse(env);
  if (!parsed.success) {
    return { ok: false, problem: describeMissing(parsed.error.issues) };
  }
  return {
    ok: true,
    client: createClient<Database>(
      parsed.data.NEXT_PUBLIC_SUPABASE_URL,
      parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: { persistSession: false },
        global: { fetch: noStoreFetch },
      },
    ),
  };
}

/**
 * Write client. Server-side only - it bypasses row-level security, so exposing
 * it to the browser would hand every visitor full write access.
 */
export function createServiceClient(env: NodeJS.ProcessEnv = process.env): ClientResult {
  const parsed = serviceEnvironmentSchema.safeParse(env);
  if (!parsed.success) {
    return { ok: false, problem: describeMissing(parsed.error.issues) };
  }
  return {
    ok: true,
    client: createClient<Database>(
      parsed.data.NEXT_PUBLIC_SUPABASE_URL,
      parsed.data.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false },
        global: { fetch: noStoreFetch },
      },
    ),
  };
}
