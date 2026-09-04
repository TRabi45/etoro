import { z } from "zod";
import type { UIMessage } from "ai";
import { checkAiConfigured, streamAgentReply } from "@/src/ai/provider-adapter";
import { CONVERSATIONAL_AGENT_PROMPT_VERSION } from "@/src/ai/prompts/v1/conversational-agent";
import { createServiceClient } from "@/src/db/client";
import { finishAgentRun, startAgentRun } from "@/src/db/repositories/agent-runs";
import {
  appendChatMessage,
  CONVERSATION_HISTORY_LIMIT,
  ensureChatSession,
} from "@/src/db/repositories/chat";

/**
 * The chat endpoint.
 *
 * Responsibilities, in order: validate the request, persist the user's turn,
 * stream a grounded reply, and persist the assistant's turn. The AI SDK is never
 * imported here - only the provider adapter is - so the route stays a transport
 * concern rather than a provider integration.
 *
 * Conversation history is bounded to the last few turns. An unbounded transcript
 * would grow the prompt and the cost without limit, and older turns say
 * progressively less about what the user wants now.
 */

export const maxDuration = 60;

const pageContextSchema = z.object({
  selectedCompanySlug: z.string().min(1).nullable().optional(),
  selectedCompanyName: z.string().min(1).nullable().optional(),
});

const chatRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1),
  sessionId: z.uuid().nullable().optional(),
  pageContext: pageContextSchema.optional(),
});

function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "The request body was not valid JSON.");
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "invalid_request", parsed.error.issues[0]?.message ?? "Invalid request.");
  }

  // Checked before any work so an unconfigured deployment gives a clear answer
  // rather than a provider stack trace.
  const aiConfig = checkAiConfigured();
  if (!aiConfig.ok) {
    return jsonError(503, "ai_not_configured", aiConfig.problem.message);
  }

  const connection = createServiceClient();
  if (!connection.ok) {
    return jsonError(503, "database_not_configured", connection.problem.message);
  }
  const client = connection.client;

  const messages = parsed.data.messages as UIMessage[];
  const pageContext = parsed.data.pageContext ?? {};
  const selectedCompanySlug = pageContext.selectedCompanySlug ?? null;

  // Resolve the page context to a real company. An unknown slug is ignored
  // rather than passed through, so the agent is never told the user is looking
  // at something that does not exist.
  let currentCompanyId: string | null = null;
  let selectedCompanyName: string | null = pageContext.selectedCompanyName ?? null;
  if (selectedCompanySlug) {
    const company = await client
      .from("companies")
      .select("id, canonical_name")
      .eq("slug", selectedCompanySlug)
      .maybeSingle();
    if (company.data) {
      currentCompanyId = company.data.id;
      selectedCompanyName = company.data.canonical_name;
    }
  }

  let sessionId: string;
  let agentRunId: string;
  try {
    sessionId = await ensureChatSession(client, parsed.data.sessionId ?? null, currentCompanyId);
    agentRunId = await startAgentRun(client, {
      purpose: "conversational_agent",
      promptVersion: CONVERSATIONAL_AGENT_PROMPT_VERSION,
      modelName: aiConfig.config.model,
    });
  } catch (cause) {
    return jsonError(
      500,
      "session_unavailable",
      cause instanceof Error ? cause.message : "Could not start the conversation.",
    );
  }

  // Persist the user's turn before generating, so the transcript survives even
  // if generation fails.
  const latest = messages[messages.length - 1];
  const latestText = extractText(latest);
  if (latest?.role === "user" && latestText) {
    try {
      await appendChatMessage(client, sessionId, { role: "user", content: latestText });
    } catch {
      // A failure to log the turn must not deny the user an answer.
    }
  }

  try {
    const result = await streamAgentReply({
      // Only the last few turns reach the model.
      messages: messages.slice(-CONVERSATION_HISTORY_LIMIT),
      context: {
        selectedCompanySlug,
        selectedCompanyName,
        currentDate: new Date().toISOString().slice(0, 10),
      },
      onFinish: async ({ text, steps }) => {
        try {
          await appendChatMessage(client, sessionId, {
            role: "assistant",
            content: text,
            toolSummary: { steps, promptVersion: CONVERSATIONAL_AGENT_PROMPT_VERSION },
          });
          await finishAgentRun(client, agentRunId, "success");
        } catch {
          // Persistence problems are logged against the run, not surfaced to
          // the user, whose answer has already streamed successfully.
          await finishAgentRun(client, agentRunId, "partial_success", "persistence_failed");
        }
      },
    });

    return result.toUIMessageStreamResponse({
      headers: { "x-session-id": sessionId },
    });
  } catch (cause) {
    await finishAgentRun(client, agentRunId, "failed", "generation_failed");
    return jsonError(
      502,
      "generation_failed",
      cause instanceof Error ? cause.message : "The assistant could not generate a reply.",
    );
  }
}

/** Pulls plain text out of a UI message's parts for the transcript. */
function extractText(message: UIMessage | undefined): string {
  if (!message) {
    return "";
  }
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}
