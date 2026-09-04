import type { TypedSupabaseClient } from "@/src/db/client";
import { toJson } from "@/src/db/json";
import { RepositoryWriteError } from "@/src/db/repositories/result";

/**
 * Conversation persistence.
 *
 * Sessions and messages are the agent's only durable memory. Nothing the model
 * says is treated as fact on the way back in: history is replayed to give the
 * conversation continuity, while every factual claim in a new answer must come
 * from a fresh tool call against the database.
 *
 * History is deliberately bounded. An unbounded transcript would grow the prompt
 * (and the bill) without limit, and the older a turn is the less it says about
 * what the user wants now.
 */

/** How many past messages are replayed to the model. */
export const CONVERSATION_HISTORY_LIMIT = 10;

export interface StoredChatMessage {
  role: "user" | "assistant";
  content: string;
  citations: unknown;
  createdAt: string;
}

/**
 * Returns the existing session, or creates one.
 *
 * When the caller supplies an id that does not exist yet, the row is created
 * *with that id*. The client mints the id once per conversation, so honouring it
 * is what keeps every turn of a conversation under a single session row instead
 * of scattering the transcript across one row per message.
 */
export async function ensureChatSession(
  client: TypedSupabaseClient,
  sessionId: string | null,
  currentCompanyId: string | null,
): Promise<string> {
  if (sessionId) {
    const existing = await client
      .from("chat_sessions")
      .select("id")
      .eq("id", sessionId)
      .maybeSingle();

    if (existing.error) {
      throw new RepositoryWriteError(`could not read chat session: ${existing.error.message}`);
    }
    if (existing.data) {
      // Keep the page context current: the user may have navigated since the
      // session started.
      await client
        .from("chat_sessions")
        .update({ current_company_id: currentCompanyId })
        .eq("id", sessionId);
      return existing.data.id;
    }
  }

  const { data, error } = await client
    .from("chat_sessions")
    .insert(
      sessionId
        ? { id: sessionId, current_company_id: currentCompanyId }
        : { current_company_id: currentCompanyId },
    )
    .select("id")
    .single();

  if (error || !data) {
    throw new RepositoryWriteError(
      `could not create chat session: ${error?.message ?? "no row returned"}`,
    );
  }
  return data.id;
}

export async function appendChatMessage(
  client: TypedSupabaseClient,
  sessionId: string,
  message: {
    role: "user" | "assistant";
    content: string;
    citations?: unknown;
    toolSummary?: unknown;
  },
): Promise<void> {
  const { error } = await client.from("chat_messages").insert({
    session_id: sessionId,
    role: message.role,
    content: message.content,
    citations: toJson(message.citations ?? []),
    tool_summary: message.toolSummary === undefined ? null : toJson(message.toolSummary),
  });

  if (error) {
    throw new RepositoryWriteError(`could not append chat message: ${error.message}`);
  }
}

/**
 * Loads the most recent turns, oldest first.
 *
 * Queried newest-first so the limit keeps the *latest* messages, then reversed
 * for replay - taking the first N would hand the model the beginning of a long
 * conversation and none of its current context.
 */
export async function loadRecentMessages(
  client: TypedSupabaseClient,
  sessionId: string,
  limit: number = CONVERSATION_HISTORY_LIMIT,
): Promise<StoredChatMessage[]> {
  const { data, error } = await client
    .from("chat_messages")
    .select("role, content, citations, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new RepositoryWriteError(`could not read chat history: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => ({
      role: row.role,
      content: row.content,
      citations: row.citations,
      createdAt: row.created_at,
    }))
    .reverse();
}
