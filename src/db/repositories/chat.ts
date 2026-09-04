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

export interface EnsureChatSessionArgs {
  /** The conversation the client claims to be continuing, if any. */
  sessionId: string | null;
  /** The ownership secret this browser presented, if it has one yet. */
  ownerToken: string | null;
  currentCompanyId: string | null;
}

export type EnsureChatSessionResult =
  | { ok: true; sessionId: string; ownerToken: string }
  /** The session exists and belongs to a different browser. */
  | { ok: false; reason: "owned_by_another_client" };

/** Long enough that guessing is not a strategy; the schema enforces the floor. */
function mintOwnerToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
}

/**
 * Returns the caller's session, creating it if this is the first turn.
 *
 * Two properties matter here and neither is obvious from the happy path.
 *
 * **It is race-free.** The previous version read the row and then inserted if it
 * was absent, so two requests arriving together for a new conversation both saw
 * nothing and both inserted, and the loser got a duplicate-key error surfaced to
 * the user as a failed question. Writing first with `ignoreDuplicates` and
 * reading afterwards collapses that: exactly one insert wins, the other is a
 * no-op, and both requests then read the same committed row.
 *
 * **It enforces ownership.** Session ids travel in the request body, so without
 * a check any caller could append turns to someone else's conversation - and
 * because history is now rebuilt on the server, injected turns would be replayed
 * to the model on the victim's next question. The first request to create a
 * session claims it with a server-minted token held in an HttpOnly cookie; later
 * requests must present the same token.
 *
 * Rows created before the owner column existed carry no token. They are claimed
 * by the next caller rather than being rejected, which keeps old conversations
 * usable without pretending they were verified.
 */
export async function ensureChatSession(
  client: TypedSupabaseClient,
  { sessionId, ownerToken, currentCompanyId }: EnsureChatSessionArgs,
): Promise<EnsureChatSessionResult> {
  const id = sessionId ?? crypto.randomUUID();
  const presentedToken = ownerToken ?? mintOwnerToken();

  // Write first, read second. If the row already exists this is a no-op, which
  // is what makes concurrent first turns safe.
  const inserted = await client.from("chat_sessions").upsert(
    { id, owner_token: presentedToken, current_company_id: currentCompanyId },
    {
      onConflict: "id",
      ignoreDuplicates: true,
    },
  );

  if (inserted.error) {
    throw new RepositoryWriteError(`could not create chat session: ${inserted.error.message}`);
  }

  const existing = await client
    .from("chat_sessions")
    .select("id, owner_token")
    .eq("id", id)
    .maybeSingle();

  if (existing.error) {
    throw new RepositoryWriteError(`could not read chat session: ${existing.error.message}`);
  }
  if (!existing.data) {
    throw new RepositoryWriteError("chat session disappeared immediately after it was written");
  }

  const storedToken = existing.data.owner_token;
  if (storedToken !== null && storedToken !== presentedToken) {
    return { ok: false, reason: "owned_by_another_client" };
  }

  // Claim a legacy row, and keep the page context current: the user may have
  // navigated to a different company since the session started.
  const update = await client
    .from("chat_sessions")
    .update({ owner_token: presentedToken, current_company_id: currentCompanyId })
    .eq("id", id);

  if (update.error) {
    // Not fatal to the answer, but it is a real inconsistency rather than
    // something to swallow: the stored context would silently stop matching the
    // page the analyst is on.
    throw new RepositoryWriteError(`could not update chat session: ${update.error.message}`);
  }

  return { ok: true, sessionId: id, ownerToken: presentedToken };
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
