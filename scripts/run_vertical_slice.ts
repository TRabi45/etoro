import { config as loadEnv } from "dotenv";
import { VERTICAL_SLICE_STUB_PAYLOAD } from "@/data/stub/vertical-slice-payload";
import { createServiceClient } from "@/src/db/client";
import { runVerticalSlice } from "@/src/research/pipeline/vertical-slice";

/**
 * Runs the evidence-backed vertical slice for one bootstrap company.
 *
 * This proves the whole data path end to end without an LLM: a validated
 * extraction payload becomes sources, claims, linked evidence, metrics,
 * fundamentals and an assessment, and the deterministic engine turns the
 * recorded inputs into a persisted score.
 *
 * Idempotent in the way that matters: the score is keyed on its input hash, so
 * re-running with unchanged inputs will not produce a second score. Claims are
 * append-only by design - a claim is an observation made at a point in time, and
 * re-running the pipeline genuinely is a new observation - so run this against a
 * reset database (`pnpm db:reset && pnpm db:seed`) when you want a clean slice.
 *
 * Usage: pnpm slice:run
 */

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

async function main(): Promise<void> {
  const connection = createServiceClient();
  if (!connection.ok) {
    throw new Error(connection.problem.message);
  }

  const summary = await runVerticalSlice(connection.client, VERTICAL_SLICE_STUB_PAYLOAD);
  const { result } = summary;

  console.log(`Vertical slice complete for "${summary.companySlug}".`);
  console.log(`  agent run:      ${summary.agentRunId}`);
  console.log(
    `  written:        ${summary.sourcesWritten} sources, ${summary.claimsWritten} claims, ${summary.metricsWritten} metrics`,
  );
  console.log(`  fundamentals:   ${summary.fundamentalAnalysisId}`);
  console.log(`  assessment:     ${summary.assessmentId}`);
  console.log(
    `  score:          ${summary.scoreId}${summary.scoreCreated ? "" : " (unchanged inputs, existing score reused)"}`,
  );
  console.log("");
  console.log(`  model version:  ${result.modelVersion} (${result.path})`);
  console.log(`  positive:       ${result.positiveNormalized}`);
  console.log(`  coverage:       ${(result.weightedCoverage * 100).toFixed(2)}%`);
  console.log(`  risk penalty:   ${result.riskPenalty}`);
  console.log(`  evidence pen.:  ${result.evidencePenalty}`);
  console.log(`  final score:    ${result.finalScore ?? "none (research only)"}`);
  console.log(`  state:          ${result.scoreState}`);
  console.log(`  recommendation: ${result.recommendation}`);
  if (result.acquireBlockers.length > 0) {
    console.log("  acquire blocked by:");
    for (const blocker of result.acquireBlockers) {
      console.log(`    - ${blocker}`);
    }
  }
  console.log("");
  console.log(`  view it at:     /companies/${summary.companySlug}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
