import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, stepCountIs, streamText, type ModelMessage } from "ai";
import { readAiConfig, type AiConfigResult } from "@/src/ai/config";
import { agentTools } from "@/src/ai/tools";
import { repairToolInput } from "@/src/ai/tools/repair";
import {
  buildConversationalAgentPrompt,
  CONVERSATIONAL_AGENT_PROMPT_VERSION,
  type ConversationalAgentContext,
} from "@/src/ai/prompts/v1/conversational-agent";

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
