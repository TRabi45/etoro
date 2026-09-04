import { createAnthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, generateText, stepCountIs, streamText, type UIMessage } from "ai";
import { readAiConfig, type AiConfigResult } from "@/src/ai/config";
import { agentTools } from "@/src/ai/tools";
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

export interface StreamAgentReplyArgs {
  messages: UIMessage[];
  context: ConversationalAgentContext;
  /** Called with the assistant's final text once the stream completes. */
  onFinish?: (result: { text: string; steps: number }) => Promise<void> | void;
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
export async function streamAgentReply({ messages, context, onFinish }: StreamAgentReplyArgs) {
  const configResult = readAiConfig();
  if (!configResult.ok) {
    // Callers are expected to check configuration first and render a friendly
    // state. Reaching here is a programming error, not a user-facing one.
    throw new Error(configResult.problem.message);
  }

  const anthropic = createAnthropic({ apiKey: configResult.config.apiKey });

  // Conversion is asynchronous in this SDK version: parts such as files are
  // resolved before the messages reach the model.
  const modelMessages = await convertToModelMessages(messages);

  return streamText({
    model: anthropic(configResult.config.model),
    system: buildConversationalAgentPrompt(context),
    messages: modelMessages,
    tools: agentTools,
    // The agentic loop: the model may call tools, read the envelopes, and call
    // more tools, until it either answers or hits the step ceiling.
    stopWhen: stepCountIs(MAX_AGENT_STEPS),
    onFinish: async (event) => {
      await onFinish?.({ text: event.text, steps: event.steps.length });
    },
  });
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
  });

  return {
    text: result.text,
    toolCalls: result.steps.flatMap((step) =>
      step.toolCalls.map((call) => ({ toolName: call.toolName, input: call.input })),
    ),
    steps: result.steps.length,
  };
}
