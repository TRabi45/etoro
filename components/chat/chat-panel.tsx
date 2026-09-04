"use client";

import { useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MarkdownLite } from "@/components/chat/markdown-lite";
import { ToolActivityRow, type ToolActivity } from "@/components/chat/tool-activity";
import type { Citation } from "@/src/ai/tools/envelope";

/**
 * The contextual chat panel.
 *
 * Three things this component is responsible for beyond rendering text:
 *
 *   - it sends the current page context with every request, so "explain their
 *     score" resolves to the company the analyst is looking at;
 *   - it shows tool execution as it happens, so an answer visibly comes from
 *     database lookups rather than from the model's memory;
 *   - it collects the citations the tools returned and renders them as a source
 *     list, so the `[1]` markers in the reply resolve to something real.
 */

interface ToolPart {
  type: string;
  state?: string;
  output?: unknown;
  errorText?: string;
}

const SUGGESTED_QUESTIONS = [
  "Which companies should eToro acquire in Germany?",
  "Why do you recommend getquin?",
  "Explain getquin's score.",
  "Compare getquin and Dfns.",
  "What changed since yesterday?",
];

/**
 * Turns a transport error into something worth reading.
 *
 * A non-streaming failure arrives with the raw response body as its message, so
 * without this the user is shown `{"error":{"code":"ai_not_configured",...}}`.
 * Showing someone a JSON blob is not a graceful failure - it is the same
 * information with the courtesy removed.
 */
function readableError(error: Error): string {
  const raw = error.message?.trim() ?? "";
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string } };
      if (parsed.error?.message) {
        return parsed.error.message;
      }
    } catch {
      // Not JSON after all; fall through to the original text.
    }
  }
  return raw === "" ? "The request failed before a reply could be generated." : raw;
}

/** Pulls the envelope out of a tool result part, if it looks like one. */
function readEnvelope(output: unknown): {
  ok?: boolean;
  warnings?: string[];
  citations?: Citation[];
  error?: { message?: string };
} | null {
  if (output === null || typeof output !== "object") {
    return null;
  }
  return output as { ok?: boolean; warnings?: string[]; citations?: Citation[] };
}

export function ChatPanel({
  selectedCompanySlug = null,
  selectedCompanyName = null,
}: {
  selectedCompanySlug?: string | null;
  selectedCompanyName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");

  /**
   * The session id is minted once on the client and reused for every turn.
   *
   * Generating it here rather than reading it back from the first response
   * keeps all of a conversation's messages under one `chat_sessions` row.
   * Sending null each time would create a fresh session per turn and scatter
   * the transcript, which would make the stored history useless for review.
   */
  const [sessionId] = useState(() => crypto.randomUUID());

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        // Page context travels with every turn, so implicit references stay
        // resolvable even many messages into a conversation.
        body: () => ({
          sessionId,
          pageContext: { selectedCompanySlug, selectedCompanyName },
        }),
      }),
    [sessionId, selectedCompanySlug, selectedCompanyName],
  );

  const { messages, sendMessage, status, error, stop } = useChat({ transport });

  const busy = status === "submitted" || status === "streaming";

  function submit(text: string) {
    const trimmed = text.trim();
    if (trimmed === "" || busy) {
      return;
    }
    setInput("");
    void sendMessage({ text: trimmed });
  }

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg hover:bg-slate-700"
        >
          Ask the agent
        </button>
      ) : (
        <section
          className="fixed bottom-5 right-5 z-40 flex h-[min(38rem,80vh)] w-[min(28rem,92vw)] flex-col rounded-xl border border-slate-300 bg-white shadow-2xl"
          aria-label="M&A intelligence agent chat"
        >
          <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
            <div>
              <p className="text-sm font-semibold text-slate-900">M&amp;A Intelligence Agent</p>
              <p className="text-xs text-slate-500">
                {selectedCompanyName
                  ? `Context: ${selectedCompanyName}`
                  : "Context: monitored universe"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
              aria-label="Close chat"
            >
              ✕
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <div className="text-sm text-slate-600">
                <p className="leading-relaxed">
                  Ask about the monitored universe. Every factual answer is looked up in the
                  database and cited; if something is not recorded, the agent will say so rather
                  than guess.
                </p>
                <div className="mt-3 space-y-1.5">
                  {SUGGESTED_QUESTIONS.map((question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => submit(question)}
                      className="block w-full rounded border border-slate-200 px-2.5 py-1.5 text-left text-xs text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {messages.map((message) => {
              const toolActivities: ToolActivity[] = [];
              const citations = new Map<number, Citation>();

              for (const part of message.parts as ToolPart[]) {
                if (!part.type.startsWith("tool-") && part.type !== "dynamic-tool") {
                  continue;
                }
                const envelope = readEnvelope(part.output);
                if (envelope?.citations) {
                  for (const citation of envelope.citations) {
                    citations.set(citation.index, citation);
                  }
                }
                toolActivities.push({
                  toolName: part.type.replace(/^tool-/, ""),
                  state: (part.state ?? "input-available") as ToolActivity["state"],
                  warnings: envelope?.warnings,
                  ok: envelope?.ok,
                  errorMessage: part.errorText ?? envelope?.error?.message,
                });
              }

              const text = (message.parts as { type: string; text?: string }[])
                .filter((part) => part.type === "text")
                .map((part) => part.text ?? "")
                .join("");

              return (
                <div key={message.id} className="space-y-2">
                  {message.role === "user" ? (
                    <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">
                      {text}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {toolActivities.map((activity, index) => (
                        <ToolActivityRow
                          key={`${activity.toolName}-${index}`}
                          activity={activity}
                        />
                      ))}

                      {text ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          <MarkdownLite text={text} />
                        </div>
                      ) : null}

                      {citations.size > 0 ? (
                        <ol className="space-y-1 rounded-lg border border-slate-200 px-3 py-2">
                          <li className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Sources
                          </li>
                          {[...citations.values()]
                            .sort((left, right) => left.index - right.index)
                            .map((citation) => (
                              <li
                                key={citation.sourceId}
                                id={`chat-source-${citation.index}`}
                                className="scroll-mt-4 text-xs text-slate-600"
                              >
                                <span className="font-mono">[{citation.index}]</span>{" "}
                                {citation.publisher ?? "Unattributed"} —{" "}
                                <a
                                  href={citation.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="break-all text-blue-700 hover:underline"
                                >
                                  {citation.url}
                                </a>
                                {citation.publishedAt ? (
                                  <span className="text-slate-400"> ({citation.publishedAt})</span>
                                ) : null}
                              </li>
                            ))}
                        </ol>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}

            {busy ? <p className="text-xs text-slate-500">Thinking…</p> : null}

            {error ? (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                <p className="font-medium">The agent could not answer.</p>
                <p className="mt-1 leading-relaxed">{readableError(error)}</p>
              </div>
            ) : null}
          </div>

          <form
            className="flex gap-2 border-t border-slate-200 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              submit(input);
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about a target, a score, or what changed…"
              className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              aria-label="Message"
            />
            {busy ? (
              <button
                type="button"
                onClick={() => stop()}
                className="rounded bg-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={input.trim() === ""}
                className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
              >
                Send
              </button>
            )}
          </form>
        </section>
      )}
    </>
  );
}
