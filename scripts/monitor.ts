import { config as loadEnv } from "dotenv";
import { dailyIdempotencyKey, runMonitoringPass } from "@/src/research/pipeline/runner";

/**
 * Runs one monitoring pass from the command line.
 *
 * This is what the scheduled workflow executes, and it is deliberately the same
 * code path as the API route rather than a parallel implementation - a
 * scheduled job that drifts from the manual one is a job whose failures nobody
 * reproduces.
 *
 * Usage:
 *   pnpm monitor                 # scheduled trigger, one run per day
 *   pnpm monitor --max 3         # fewer sources
 *   pnpm monitor --manual        # record it as a manual run
 *   pnpm monitor --key <value>   # override the idempotency key
 */

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const maxIndex = argv.indexOf("--max");
  const maxSources = maxIndex >= 0 ? Number(argv[maxIndex + 1]) : undefined;
  const trigger = argv.includes("--manual") ? "manual" : "scheduled";

  if (maxSources !== undefined && !Number.isFinite(maxSources)) {
    console.error("--max expects a number");
    process.exitCode = 1;
    return;
  }

  // The daily key is what makes an overlapping or retried schedule harmless, so
  // it is the default. Overriding it is for the cases where re-reading the same
  // day is the point: verifying a fix, or a second dispatch after the feeds have
  // moved on.
  const keyIndex = argv.indexOf("--key");
  const idempotencyKey =
    keyIndex >= 0
      ? (argv[keyIndex + 1] ?? dailyIdempotencyKey(trigger))
      : dailyIdempotencyKey(trigger);

  const report = await runMonitoringPass({ trigger, maxSources, idempotencyKey });

  console.log(`\nRun ${report.runId} - ${report.status}`);
  if (report.reused) {
    console.log("A run already existed for today's key; nothing was fetched again.");
  }
  console.log(
    `  discovered ${report.sourcesDiscovered}, skipped ${report.sourcesSkipped} already stored, fetched ${report.sourcesFetched}`,
  );
  console.log(
    `  wrote ${report.claimsWritten} claim(s), ${report.eventsWritten} event(s), ${report.companiesDiscovered} new compan(ies)`,
  );

  if (report.warnings.length > 0) {
    console.log(`\n  ${report.warnings.length} warning(s):`);
    for (const warning of report.warnings) {
      console.log(`   - ${warning}`);
    }
  }

  // A partial run is a successful run that reported its gaps, so it must not
  // fail the scheduled workflow. Only a run that produced nothing at all does.
  //
  // Set rather than called: `process.exit()` tears the loop down while the
  // Supabase client's sockets are still closing, which on Windows aborts the
  // process with a libuv assertion and a garbage exit code - a green run
  // reported as a failed workflow. Setting the code lets Node exit on its own
  // once the handles are done.
  process.exitCode = report.status === "failed" ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
