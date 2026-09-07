import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject, generateText, stepCountIs, streamText, type ModelMessage } from "ai";
import { readAiConfig, type AiConfigResult } from "@/src/ai/config";
import { agentTools } from "@/src/ai/tools";
import { repairToolInput } from "@/src/ai/tools/repair";
import {
  buildExtractorRequest,
  EMPTY_EXTRACTION,
  extractedPayloadSchema,
  EXTRACTOR_PROMPT_VERSION,
  EXTRACTOR_SYSTEM_PROMPT,
  type ExtractedPayload,
  type ExtractorSourceContext,
} from "@/src/ai/prompts/v1/extractor";
import {
  buildConversationalAgentPrompt,
  CONVERSATIONAL_AGENT_PROMPT_VERSION,
  type ConversationalAgentContext,
} from "@/src/ai/prompts/v1/conversational-agent";
import {
  analystOutputSchema,
  ANALYST_PROMPT_VERSION,
  ANALYST_SYSTEM_PROMPT,
  buildAnalystRequest,
  EMPTY_ANALYST_OUTPUT,
  type AnalystCompanyContext,
  type AnalystDocumentContext,
  type AnalystOutput,
} from "@/src/ai/prompts/v1/analyst";

/**
 * The AI provider adapter.
 *
 * This is the only module in the application that imports an AI SDK. Routes,
 * components and tools all talk to the functions below, so replacing the
 * provider - or the SDK itself - is a change to one file rather than a change
 * spread through the codebase. Milestone 1 locked that requirement in, and it is
 * cheap to honour now and expensive to retrofit later.
 *
 * The adapter also owns the two settings that keep an agentic loop bounded:
 * which tools exist, and how many reasoning steps are allowed before the model
 * must produce a final answer.
 */

/**
 * How many tool-calling round trips the model may take before it has to answer.
 *
 * Enough for a realistic chain - resolve a company, fetch its score, fetch a
 * comparison - without letting a confused model loop until it exhausts the
 * budget. The SDK stops the loop and returns whatever has been produced.
 */
export const MAX_AGENT_STEPS = 8;

/**
 * One turn of conversation, in provider-neutral terms.
 *
 * Deliberately plain text rather than the SDK's own message type. The
 * conversation replayed to the model is rebuilt on the server from the stored
 * transcript, and this shape is what the store can honestly produce: a role and
 * what was said. There is no place in it for a tool result, which is the point -
 * tool outputs must come from tools actually running during this request, never
 * from replayed or client-supplied history.
 */
export interface AgentTurn {
  role: "user" | "assistant";
  content: string;
}

export interface StreamAgentReplyArgs {
  turns: AgentTurn[];
  context: ConversationalAgentContext;
  /** Called with the assistant's final text once the stream completes. */
  onFinish?: (result: { text: string; steps: number }) => Promise<void> | void;
  /**
   * Called when generation fails after the response has already been returned.
   *
   * Once streaming has begun the caller's try/catch is out of scope, so without
   * this a mid-stream failure - a rate limit, an exhausted balance, an
   * unrepairable tool call - would leave the run row open forever and record
   * nothing about what went wrong.
   */
  onError?: (error: unknown) => Promise<void> | void;
}

export interface AgentRunMetadata {
  promptVersion: string;
  model: string;
  maxSteps: number;
}

export function getAgentRunMetadata(config: { model: string }): AgentRunMetadata {
  return {
    promptVersion: CONVERSATIONAL_AGENT_PROMPT_VERSION,
    model: config.model,
    maxSteps: MAX_AGENT_STEPS,
  };
}

/** Surfaces configuration state without exposing the key itself. */
export function checkAiConfigured(): AiConfigResult {
  return readAiConfig();
}

/**
 * Streams a grounded reply, running the tool loop as needed.
 *
 * Returns the SDK's streaming response object. The caller turns it into an HTTP
 * response; it does not need to know which provider produced it.
 */
export function streamAgentReply({ turns, context, onFinish, onError }: StreamAgentReplyArgs) {
  const configResult = readAiConfig();
  if (!configResult.ok) {
    // Callers are expected to check configuration first and render a friendly
    // state. Reaching here is a programming error, not a user-facing one.
    throw new Error(configResult.problem.message);
  }

  const anthropic = createAnthropic({ apiKey: configResult.config.apiKey });

  return streamText({
    model: anthropic(configResult.config.model),
    system: buildConversationalAgentPrompt(context),
    messages: turns satisfies ModelMessage[],
    tools: agentTools,
    // The agentic loop: the model may call tools, read the envelopes, and call
    // more tools, until it either answers or hits the step ceiling.
    stopWhen: stepCountIs(MAX_AGENT_STEPS),
    repairToolCall,
    onError: async ({ error }) => {
      await onError?.(error);
    },
    onFinish: async (event) => {
      await onFinish?.({ text: event.text, steps: event.steps.length });
    },
  });
}

/**
 * Gives a malformed tool call one deterministic chance to be corrected.
 *
 * Only shape is repaired, never meaning - see `repairToolInput`. Returning null
 * lets the SDK raise the original error, which `onError` then records.
 */
const repairToolCall: NonNullable<Parameters<typeof streamText>[0]["repairToolCall"]> = async ({
  toolCall,
}) => {
  const outcome = repairToolInput(toolCall.toolName, toolCall.input);
  if (!outcome.repaired) {
    return null;
  }
  return { ...toolCall, input: JSON.stringify(outcome.input) };
};

export interface ExtractionOutcome {
  payload: ExtractedPayload;
  /** Set when the model could not produce a valid payload. */
  problem: string | null;
  model: string;
  promptVersion: string;
}

/**
 * Runs the Extractor role over one document.
 *
 * Never throws. An extraction that fails - a provider error, output that will
 * not parse, a page of navigation furniture with nothing in it - costs the run
 * one source, not the run. The caller records the problem as a warning and moves
 * to the next document, which is what "one failed source must not abort the run"
 * requires in practice.
 *
 * `generateObject` is used rather than free text plus a parse: the schema is
 * given to the provider, so malformed output is largely prevented rather than
 * detected afterwards. It is still validated on return, because prevention that
 * is not checked is an assumption.
 */
export async function extractFromSource(
  source: ExtractorSourceContext,
  bodyText: string,
): Promise<ExtractionOutcome> {
  const configResult = readAiConfig();
  if (!configResult.ok) {
    return {
      payload: EMPTY_EXTRACTION,
      problem: configResult.problem.message,
      model: "unconfigured",
      promptVersion: EXTRACTOR_PROMPT_VERSION,
    };
  }

  const anthropic = createAnthropic({ apiKey: configResult.config.apiKey });
  const model = configResult.config.model;

  try {
    const result = await generateObject({
      model: anthropic(model),
      schema: extractedPayloadSchema,
      system: EXTRACTOR_SYSTEM_PROMPT,
      prompt: buildExtractorRequest(source, bodyText),
      // One retry, for a transient provider failure. A document that will not
      // extract twice is a fact about the document.
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(EXTRACTION_TIMEOUT_MS),
    });

    return {
      payload: result.object,
      problem: null,
      model,
      promptVersion: EXTRACTOR_PROMPT_VERSION,
    };
  } catch (cause) {
    return {
      payload: EMPTY_EXTRACTION,
      problem: cause instanceof Error ? cause.message : "extraction failed",
      model,
      promptVersion: EXTRACTOR_PROMPT_VERSION,
    };
  }
}

/**
 * How long one extraction may take before the run gives up on it.
 *
 * Measured rather than guessed, after the guess cost real data. The first value
 * was 60s, chosen because it sounded generous. A 10KB news article actually
 * takes ~73s to extract - the cost is generating the structured output, not the
 * provider being slow, since a plain call to the same model answers in 1.6s - so
 * every extraction in a five-source run hit the ceiling and was discarded. The
 * pipeline reported five honest warnings and wrote nothing, which is the
 * failure mode this design is meant to make visible and did: the warnings were
 * right there, saying "aborted due to timeout" five times.
 *
 * Paired with the smaller output caps in the extractor schema, which cut the
 * generation itself rather than just waiting longer for it.
 */
export const EXTRACTION_TIMEOUT_MS = 180_000;

export interface AnalysisOutcome {
  output: AnalystOutput;
  /** Set when the model could not produce a valid output. */
  problem: string | null;
  model: string;
  promptVersion: string;
}

/**
 * How long one company's analysis may take before the run gives up on it.
 *
 * Longer than the Extractor's per-document budget (`EXTRACTION_TIMEOUT_MS`)
 * because this call reasons over several documents at once and produces a
 * much larger structured output - eight dimensions, five gates, five routes,
 * fundamentals and assessment narrative, all cross-referencing a claims list
 * it is generating in the same call.
 */
export const ANALYSIS_TIMEOUT_MS = 240_000;

/**
 * Runs the Analyst role over one company's gathered documents.
 *
 * Never throws, for the same reason `extractFromSource` never throws: a
 * failed analysis costs this company's research run, not the caller. The
 * orchestrator records the problem as a warning and finishes the run as
 * `failed` rather than crashing whatever triggered it.
 */
export async function analyzeCompanyEvidence(
  company: AnalystCompanyContext,
  documents: { context: AnalystDocumentContext; bodyText: string }[],
): Promise<AnalysisOutcome> {
  const configResult = readAiConfig();
  if (!configResult.ok) {
    return {
      output: EMPTY_ANALYST_OUTPUT,
      problem: configResult.problem.message,
      model: "unconfigured",
      promptVersion: ANALYST_PROMPT_VERSION,
    };
  }

  const anthropic = createAnthropic({ apiKey: configResult.config.apiKey });
  const model = configResult.config.model;

  try {
    const result = await generateObject({
      model: anthropic(model),
      schema: analystOutputSchema,
      system: ANALYST_SYSTEM_PROMPT,
      prompt: buildAnalystRequest(company, documents),
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
      providerOptions: {
        anthropic: {
          // The Analyst asks for a company's whole evidence consolidation in
          // one object - claims, eight dimensions, five gates, five routes,
          // fundamentals and the assessment. Under the default mode the
          // provider compiles that schema into a constrained grammar and
          // rejects it outright ("the compiled grammar is too large"), which
          // silently reduced every live run to zero claims while every
          // fixture test stayed green.
          //
          // `jsonTool` passes the same schema as an ordinary tool instead of
          // a grammar-constrained one. The schema is unchanged and Zod still
          // validates the result at the boundary, so nothing is loosened on
          // our side; only the provider stops pre-compiling it.
          structuredOutputMode: "jsonTool",
        },
      },
    });

    return { output: result.object, problem: null, model, promptVersion: ANALYST_PROMPT_VERSION };
  } catch (cause) {
    return {
      output: EMPTY_ANALYST_OUTPUT,
      problem: cause instanceof Error ? cause.message : "analysis failed",
      model,
      promptVersion: ANALYST_PROMPT_VERSION,
    };
  }
}

export interface AskAgentResult {
  text: string;
  toolCalls: { toolName: string; input: unknown }[];
  steps: number;
}

/**
 * Runs one question to completion, without streaming.
 *
 * Used by the `agent:ask` script so the agent's behaviour can be checked from a
 * terminal - which makes the answers reviewable as text, and lets the canonical
 * assignment questions be re-run as a regression check rather than clicked
 * through by hand.
 */
export async function askAgentOnce(
  question: string,
  context: ConversationalAgentContext,
): Promise<AskAgentResult> {
  const configResult = readAiConfig();
  if (!configResult.ok) {
    throw new Error(configResult.problem.message);
  }

  const anthropic = createAnthropic({ apiKey: configResult.config.apiKey });

  const result = await generateText({
    model: anthropic(configResult.config.model),
    system: buildConversationalAgentPrompt(context),
    prompt: question,
    tools: agentTools,
    stopWhen: stepCountIs(MAX_AGENT_STEPS),
    // Same repair behaviour as the streaming path, so the terminal harness
    // exercises what the product actually does.
    repairToolCall,
  });

  return {
    text: result.text,
    toolCalls: result.steps.flatMap((step) =>
      step.toolCalls.map((call) => ({ toolName: call.toolName, input: call.input })),
    ),
    steps: result.steps.length,
  };
}
