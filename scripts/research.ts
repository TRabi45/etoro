import { config as loadEnv } from "dotenv";
import { researchCompany } from "@/src/research/pipeline/company-research";

/**
 * Runs one company's research pass from the command line.
 *
 * The same shared pipeline the chat tool and automated monitoring use -
 * `researchCompany` - not a parallel implementation, for the same reason
 * `scripts/monitor.ts` calls `runMonitoringPass` directly instead of hitting
 * the HTTP endpoint: a CLI path that drifts from the real one is a path whose
 * failures nobody reproduces.
 *
 * Usage:
 *   pnpm research --slug getquin
 *   pnpm research --slug getquin --key custom-rerun   # bypass today's idempotency key
 */

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const slugIndex = argv.indexOf("--slug");
  const slug = slugIndex >= 0 ? argv[slugIndex + 1] : undefined;

  if (!slug) {
    console.error("Usage: pnpm research --slug <slug> [--key <idempotency-key>]");
    process.exitCode = 1;
    return;
  }

  const keyIndex = argv.indexOf("--key");
  const idempotencyKey = keyIndex >= 0 ? argv[keyIndex + 1] : undefined;

  const report = await researchCompany({ slug, trigger: "manual", idempotencyKey });

  console.log(`\nRun ${report.runId} - ${report.status}`);
  if (report.reused) {
    console.log(
      "A run already existed for this key; returning its recorded result instead of researching again.",
    );
  }
  console.log(`  sources planned ${report.sourcesPlanned}, fetched ${report.sourcesFetched}`);
  console.log(`  claims written  ${report.claimsWritten}`);
  console.log(`  scored:         ${report.scored}`);
  console.log(`  research tier:  ${report.tier}`);
  console.log(`  next refresh:   ${report.nextRefreshAt}`);
  console.log(`  view it at:     /companies/${report.companySlug}`);

  if (report.warnings.length > 0) {
    console.log(`\n  ${report.warnings.length} warning(s):`);
    for (const warning of report.warnings) {
      console.log(`   - ${warning}`);
    }
  }

  // A partial or blocked run reported its own gap honestly and must not fail
  // the process; only an outright failure should. Set rather than called -
  // `process.exit()` tears the loop down before the Supabase client's sockets
  // finish closing, which aborts the process with a libuv assertion on
  // Windows instead of a clean exit.
  process.exitCode = report.status === "failed" ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
