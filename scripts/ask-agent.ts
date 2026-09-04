import { config as loadEnv } from "dotenv";
import { askAgentOnce } from "@/src/ai/provider-adapter";
import { checkAiConfigured } from "@/src/ai/provider-adapter";

/**
 * Asks the agent one question from the terminal.
 *
 * The chat UI is the product, but a terminal harness makes the agent's
 * behaviour reviewable as text: which tools it chose, and whether the answer
 * stays inside the evidence. That turns the canonical assignment questions into
 * something re-runnable rather than something clicked through by hand.
 *
 * Usage:
 *   pnpm agent:ask "Which companies should eToro acquire in Germany?"
 *   pnpm agent:ask --company getquin "Explain their score."
 *   pnpm agent:ask --canonical      # runs the six assignment questions in order
 */

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

/** The six questions the assignment brief names. */
const CANONICAL_QUESTIONS: { question: string; company?: string }[] = [
  { question: "Which companies should eToro acquire in Germany?" },
  { question: "Show me fintech startups in LATAM." },
  { question: "Compare getquin and Dfns as acquisition targets." },
  { question: "What changed since yesterday?" },
  { question: "Why do you recommend getquin?", company: "getquin" },
  { question: "Explain your reasoning for their score.", company: "getquin" },
];

async function ask(question: string, companySlug: string | null): Promise<void> {
  console.log(`\n${"=".repeat(78)}`);
  console.log(`Q: ${question}`);
  if (companySlug) {
    console.log(`   (page context: ${companySlug})`);
  }
  console.log("=".repeat(78));

  const result = await askAgentOnce(question, {
    selectedCompanySlug: companySlug,
    selectedCompanyName: companySlug,
    currentDate: new Date().toISOString().slice(0, 10),
  });

  if (result.toolCalls.length === 0) {
    // Worth flagging loudly: a factual answer with no tool call means the model
    // answered from its own memory, which is the failure this design exists to
    // prevent.
    console.log("\n[tools] none called");
  } else {
    console.log("\n[tools]");
    for (const call of result.toolCalls) {
      console.log(`  - ${call.toolName}(${JSON.stringify(call.input)})`);
    }
  }

  console.log(`\n[answer] (after ${result.steps} step(s))\n`);
  console.log(result.text);
}

async function main(): Promise<void> {
  const configured = checkAiConfigured();
  if (!configured.ok) {
    console.error(configured.problem.message);
    process.exit(1);
  }

  const argv = process.argv.slice(2);

  if (argv.includes("--canonical")) {
    for (const entry of CANONICAL_QUESTIONS) {
      await ask(entry.question, entry.company ?? null);
    }
    return;
  }

  const companyIndex = argv.indexOf("--company");
  const companySlug = companyIndex >= 0 ? (argv[companyIndex + 1] ?? null) : null;
  const question = argv
    .filter((argument, index) => {
      if (argument === "--company") return false;
      if (companyIndex >= 0 && index === companyIndex + 1) return false;
      return true;
    })
    .join(" ")
    .trim();

  if (question === "") {
    console.error(
      'Usage: pnpm agent:ask "<question>" [--company <slug>]\n       pnpm agent:ask --canonical',
    );
    process.exit(1);
  }

  await ask(question, companySlug);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
