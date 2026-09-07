import { z } from "zod";
import { checkAiConfigured, streamAgentReply, type AgentTurn } from "@/src/ai/provider-adapter";
import { CONVERSATIONAL_AGENT_PROMPT_VERSION } from "@/src/ai/prompts/v1/conversational-agent";
import { createServiceClient } from "@/src/db/client";
import { finishAgentRun, startAgentRun } from "@/src/db/repositories/agent-runs";
import {
  appendChatMessage,
  CONVERSATION_HISTORY_LIMIT,
  ensureChatSession,
  loadRecentMessages,
} from "@/src/db/repositories/chat";
import {
  CHAT_IP_RULE,
  CHAT_SESSION_RULE,
  checkRateLimit,
  clientAddress,
  MAX_QUESTION_LENGTH,
} from "@/src/server/rate-limit";

/**
 * The chat endpoint.
 *
 * Responsibilities, in order: throttle, validate, establish an owned session,
 * rebuild the conversation from the server's own record, stream a grounded
 * reply, and persist the assistant's turn. The AI SDK is never imported here -
 * only the provider adapter is - so the route stays a transport concern rather
 * than a provider integration.
 *
 * ## Why history is rebuilt rather than accepted
 *
 * The obvious implementation posts the browser's message list and forwards it to
 * the model. That is what the SDK's client transport sends, and it was what this
 * route did. It is also a hole straight through the product's central promise.
 *
 * A UI message list contains tool parts, and a tool part carries the tool's
 * *output*. Forwarding the list verbatim means the request body decides what the
 * tools "returned". A crafted request could therefore hand the model a fabricated
 * profile - complete with score, recommendation and citation - for a company that
 * does not exist, and the model, working exactly as designed, would report it as
 * looked-up fact. Every guarantee in the prompt about never inventing data is
 * worth nothing if the evidence itself can be posted in.
 *
 * So the client's array is used for exactly one thing: the text of the newest
 * user turn. Everything else is discarded and the conversation is rebuilt from
 * `chat_messages`, which only ever contains text this server wrote. Tool results
 * come from tools that ran during this request, and from nowhere else.
 */

/**
 * Longer than a pure question needs, because `run_monitoring_quick` is now a
 * real pipeline pass rather than a stub: the agent may spend a fetch and an
 * extraction inside the turn before it has anything to say.
 */
export const maxDuration = 180;

/** Set on the browser once, then presented on every later turn of a session. */
const OWNER_COOKIE = "ma_chat_owner";

/**
 * The screens the agent may be told it is looking at.
 *
 * An enum rather than a free string, because this value is interpolated into
 * the system prompt. Everything below that reaches the prompt is validated by
 * allow-list for the same reason: the panel sends its own UI state, but this
 * route cannot distinguish the panel from a crafted request, and "the user is
 * on the Targets screen" must never be able to carry a sentence of its own.
 */
const screenSchema = z.enum([
  "Briefing",
  "Targets",
  "Market Map",
  "Competitors",
  "Monitoring",
  "Company profile",
]);

/**
 * Filter labels and values, constrained to characters a controlled vocabulary
 * actually produces. No newlines, no punctuation that could open a quoted
 * block - so an active filter cannot become an instruction.
 */
const safeFilterText = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9 ._\-/&+%]+$/, "Filter text contains unsupported characters.");

const pageContextSchema = z.object({
  selectedCompanySlug: z.string().min(1).nullable().optional(),
  selectedCompanyName: z.string().min(1).nullable().optional(),
  screen: screenSchema.nullable().optional(),
  activeFilters: z
    .array(z.object({ label: safeFilterText, value: safeFilterText }))
    .max(12)
    .optional(),
  /** Slugs the analyst has selected for comparison, if any. */
  comparisonSlugs: z
    .array(z.string().regex(/^[a-z0-9-]{1,80}$/))
    .max(4)
    .optional(),
});

/**
 * Only what the server is willing to act on.
 *
 * `messages` is typed loosely on purpose - the client sends the SDK's own
 * message shape, which is richer than anything used here - but only the final
 * user turn's text is ever read out of it.
 */
const chatRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1),
  sessionId: z.uuid().nullable().optional(),
  pageContext: pageContextSchema.optional(),
});

const clientMessageSchema = z.object({
  role: z.string(),
  parts: z.array(z.unknown()).optional(),
});

function jsonError(status: number, code: string, message: string, headers?: HeadersInit): Response {
  return Response.json({ error: { code, message } }, { status, headers });
}

/**
 * Extracts the user's question from the last message the client sent.
 *
 * Only `text` parts are read. Anything else in the message - tool calls, tool
 * results, files, reasoning - is ignored rather than sanitised, because there is
 * no legitimate reason for the browser to be telling the server what a tool
 * returned.
 */
function readLatestQuestion(messages: unknown[]): string | null {
  const latest = clientMessageSchema.safeParse(messages[messages.length - 1]);
  if (!latest.success || latest.data.role !== "user") {
    return null;
  }

  const text = (latest.data.parts ?? [])
    .flatMap((part) => {
      if (part === null || typeof part !== "object") {
        return [];
      }
      const candidate = part as { type?: unknown; text?: unknown };
      return candidate.type === "text" && typeof candidate.text === "string"
        ? [candidate.text]
        : [];
    })
    .join("\n")
    .trim();

  return text === "" ? null : text;
}

function readOwnerToken(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) {
    return null;
  }
  for (const entry of header.split(";")) {
    const [name, ...rest] = entry.trim().split("=");
    if (name === OWNER_COOKIE) {
      const value = rest.join("=").trim();
      return value === "" ? null : value;
    }
  }
  return null;
}

function ownerCookie(token: string): string {
  // HttpOnly so page scripts cannot read it; SameSite=Lax so it is not sent from
  // another site's forms. Local development is plain HTTP, while deployed
  // environments must never send the ownership token over an insecure channel.
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${OWNER_COOKIE}=${token}; Path=/api/chat; HttpOnly; SameSite=Lax${secure}; Max-Age=86400`;
}

export async function POST(request: Request): Promise<Response> {
  // Throttle before parsing: an abusive caller should cost as little as possible.
  const address = clientAddress(request);
  const addressVerdict = checkRateLimit(`ip:${address}`, CHAT_IP_RULE);
  if (!addressVerdict.allowed) {
    return jsonError(
      429,
      "rate_limited",
      "Too many questions from this client. Try again shortly.",
      {
        "retry-after": String(addressVerdict.retryAfterSeconds),
      },
    );
  }

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

  const question = readLatestQuestion(parsed.data.messages);
  if (question === null) {
    return jsonError(400, "no_question", "The request did not contain a user message to answer.");
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return jsonError(
      413,
      "question_too_long",
      `Questions are limited to ${MAX_QUESTION_LENGTH} characters.`,
    );
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

  // Same treatment for the comparison set: slugs are checked against the
  // database and the unknown ones are dropped, so a crafted request cannot
  // invent companies for the agent to reason about.
  let resolvedComparisonSlugs: string[] = [];
  const requestedComparison = pageContext.comparisonSlugs ?? [];
  if (requestedComparison.length > 0) {
    const found = await client.from("companies").select("slug").in("slug", requestedComparison);
    resolvedComparisonSlugs = (found.data ?? []).map((row) => row.slug);
  }

  let sessionId: string;
  let ownerToken: string;
  let history: AgentTurn[];
  let agentRunId: string;
  try {
    const session = await ensureChatSession(client, {
      sessionId: parsed.data.sessionId ?? null,
      ownerToken: readOwnerToken(request),
      currentCompanyId,
    });
    if (!session.ok) {
      return jsonError(
        403,
        "session_not_yours",
        "That conversation belongs to a different browser session.",
      );
    }
    sessionId = session.sessionId;
    ownerToken = session.ownerToken;

    const sessionVerdict = checkRateLimit(`session:${sessionId}`, CHAT_SESSION_RULE);
    if (!sessionVerdict.allowed) {
      return jsonError(429, "rate_limited", "Too many questions in this conversation just now.", {
        "retry-after": String(sessionVerdict.retryAfterSeconds),
      });
    }

    // Read before the new turn is written, so the reply is generated against the
    // preceding context plus exactly one copy of the current question. Only the
    // last few turns are replayed: an unbounded transcript grows the prompt and
    // the bill without limit, and the older a turn is the less it says about what
    // the user wants now.
    const stored = await loadRecentMessages(client, sessionId, CONVERSATION_HISTORY_LIMIT - 1);
    history = stored.map((message) => ({ role: message.role, content: message.content }));

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
  try {
    await appendChatMessage(client, sessionId, { role: "user", content: question });
  } catch {
    // A failure to log the turn must not deny the user an answer. The question
    // is still appended to `turns` below, so this request is unaffected; only
    // the stored record is.
  }

  try {
    const result = streamAgentReply({
      turns: [...history, { role: "user", content: question }],
      context: {
        selectedCompanySlug,
        selectedCompanyName,
        screen: pageContext.screen ?? null,
        activeFilters: pageContext.activeFilters ?? [],
        // Only slugs that resolved to a real company are forwarded, so the
        // agent is never told the analyst is comparing something that does not
        // exist.
        comparisonSlugs: resolvedComparisonSlugs,
        currentDate: new Date().toISOString().slice(0, 10),
      },
      onError: async () => {
        // Reached after the response has started streaming, where nothing else
        // can close the run.
        await finishAgentRun(client, agentRunId, "failed", "generation_failed");
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
      headers: {
        "x-session-id": sessionId,
        "set-cookie": ownerCookie(ownerToken),
      },
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
