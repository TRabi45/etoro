"use client";

import { useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { TargetSummary } from "@/src/db/repositories/targets";
import type { Citation } from "@/src/ai/tools/envelope";
import { MarkdownLite } from "@/components/chat/markdown-lite";
import { ToolActivityRow, type ToolActivity } from "@/components/chat/tool-activity";
import { AgentContextLine, readAgentContext } from "@/components/agent/agent-context";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { formatDateTime } from "@/components/ui/format";

/**
 * The agent, as a persistent work surface.
 *
 * Not a chat bubble. It sits in the layout, knows what the analyst is looking
 * at without being told, and opens with what it found rather than asking how it
 * can help. The difference matters: a colleague who has already done the
 * morning research starts by reporting; an assistant waits to be asked.
 *
 * Three responsibilities beyond rendering text, inherited from the panel this
 * replaces and deliberately unchanged, because they are what make the answers
 * trustworthy:
 *
 *   - page context travels with every request, so "explain their score"
 *     resolves to the company on screen;
 *   - tool execution is shown as it happens, in the user's language, so an
 *     answer visibly comes from a database lookup rather than from the model's
 *     memory - internal tool names never reach the UI, only the labels in
 *     `TOOL_ACTIVITY_LABELS`;
 *   - citations returned by tools are collected and listed, so the markers in
 *     the reply resolve to something real.
 *
 * What is new is that the context now includes the screen, the active filters
 * and the comparison set, not just the selected company - so an answer given
 * while the analyst is looking at four German targets cannot silently range
 * over the whole universe.
 */

interface ToolPart {
  type: string;
  state?: string;
  output?: unknown;
  errorText?: string;
}

export interface AgentPanelProps {
  targets: readonly TargetSummary[];
  onClose: () => void;
  /** A drawer owns the full height and needs its own close affordance. */
  presentation: "panel" | "drawer";
}

/**
 * Turns a transport error into something worth reading.
 *
 * A non-streaming failure arrives with the raw response body as its message, so
 * without this the reader is shown a JSON blob - the same information with the
 * courtesy removed.
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

export function AgentPanel({ targets, onClose, presentation }: AgentPanelProps) {
  const [input, setInput] = useState("");
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const context = useMemo(
    () => readAgentContext({ pathname, searchParams, targets }),
    [pathname, searchParams, targets],
  );

  /**
   * The session id is minted once and reused for every turn, so a conversation
   * stays under one `chat_sessions` row. Sending null each time would scatter
   * the transcript across a session per message.
   */
  const [sessionId] = useState(() => crypto.randomUUID());

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        // Recomputed per request rather than captured, so a filter change or a
        // navigation is reflected on the very next turn.
        body: () => ({
          sessionId,
          pageContext: {
            selectedCompanySlug: context.companySlug,
            selectedCompanyName: context.companyName,
            screen: context.screen,
            activeFilters: context.filters,
            comparisonSlugs: context.comparisonSlugs,
          },
        }),
      }),
    [sessionId, context],
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
    <section
      aria-label="M&amp;A Intelligence"
      className="flex h-full min-h-0 flex-col bg-surface"
    >
      <header className="flex shrink-0 items-start gap-2.5 border-b border-border px-4 py-3">
        {/* An abstract aperture, not a face. The dot is a status indicator and
            is paired with text, never used as the only signal. */}
        <span className="relative mt-0.5 text-primary">
          <Icon name="agent" size={22} />
          <span
            className={`absolute -bottom-0.5 -right-0.5 block h-2.5 w-2.5 rounded-full border-2 border-surface ${
              busy ? "bg-warning" : "bg-brand"
            }`}
            aria-hidden="true"
          />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold text-primary">M&amp;A Intelligence</p>
          <p className="text-caption text-tertiary">
            {busy ? "Working…" : `Briefed as of ${formatDateTime(new Date().toISOString())}`}
          </p>
          <AgentContextLine context={context} />
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label={presentation === "drawer" ? "Close the panel" : "Hide the panel"}
          className="shrink-0 rounded-control p-1.5 text-tertiary motion-standard transition-colors hover:bg-surface-subtle hover:text-primary"
        >
          <Icon name={presentation === "drawer" ? "close" : "panel-right"} size={18} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <AgentOpening context={context} onAsk={submit} />
        ) : null}

        <div className="flex flex-col gap-4">
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

            if (message.role === "user") {
              return (
                <p
                  key={message.id}
                  className="ml-auto w-fit max-w-[88%] rounded-card rounded-br-sm bg-brand-soft px-3 py-2 text-body text-primary"
                >
                  {text}
                </p>
              );
            }

            return (
              <div key={message.id} className="flex flex-col gap-2">
                {toolActivities.map((activity, index) => (
                  <ToolActivityRow key={`${activity.toolName}-${index}`} activity={activity} />
                ))}

                {text ? (
                  <div className="text-body leading-relaxed text-primary">
                    <MarkdownLite text={text} />
                  </div>
                ) : null}

                {citations.size > 0 ? <CitationList citations={[...citations.values()]} /> : null}
              </div>
            );
          })}
        </div>

        {busy ? (
          <p className="mt-3 flex items-center gap-2 text-caption text-secondary" aria-live="polite">
            <Icon name="refresh" size={14} className="animate-spin" />
            Checking the record
          </p>
        ) : null}

        {error ? (
          <div
            className="mt-3 rounded-card border border-danger/30 bg-danger-soft px-3 py-2.5"
            role="alert"
          >
            <p className="text-body font-semibold text-primary">I could not answer that.</p>
            <p className="mt-1 text-caption leading-relaxed text-secondary">
              {readableError(error)}
            </p>
          </div>
        ) : null}
      </div>

      {!busy && messages.length > 0 ? (
        <div className="shrink-0 border-t border-border px-4 py-2">
          <QuickActions context={context} onAsk={submit} compact />
        </div>
      ) : null}

      <form
        className="flex shrink-0 gap-2 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit(input);
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about a target, a score, or what changed…"
          aria-label="Ask the intelligence panel"
          className="h-10 min-w-0 flex-1 rounded-control border border-border-control bg-surface px-3 text-body text-primary outline-none placeholder:text-tertiary focus:border-secondary"
        />
        {busy ? (
          <Button variant="secondary" onClick={() => stop()}>
            Stop
          </Button>
        ) : (
          <Button variant="primary" type="submit" disabled={input.trim() === ""} icon="arrow-up-right">
            Ask
          </Button>
        )}
      </form>
    </section>
  );
}

/**
 * The opening state.
 *
 * Says what the agent can do here and offers the questions worth asking on this
 * screen. It deliberately does not assert findings it has not looked up - the
 * brief on the page is where counted findings live, and repeating a number here
 * without a tool call behind it would be exactly the invented-fact failure the
 * whole product is built to avoid.
 */
function AgentOpening({
  context,
  onAsk,
}: {
  context: ReturnType<typeof readAgentContext>;
  onAsk: (question: string) => void;
}) {
  return (
    <div className="mb-4">
      <p className="text-body leading-relaxed text-secondary">
        I can read the target universe, scores, evidence and recent events, and I answer from the
        record rather than from memory. If something is not established, I will say so instead of
        filling the gap.
      </p>
      <div className="mt-3">
        <QuickActions context={context} onAsk={onAsk} />
      </div>
    </div>
  );
}

/**
 * Questions that make sense where the reader currently is.
 *
 * A company profile gets score and counter-case questions; a filtered list gets
 * questions about the set. Offering "Why did this score change?" on a screen
 * with no company selected would produce a clarifying question instead of an
 * answer, which wastes a turn.
 */
function QuickActions({
  context,
  onAsk,
  compact = false,
}: {
  context: ReturnType<typeof readAgentContext>;
  onAsk: (question: string) => void;
  compact?: boolean;
}) {
  const actions: string[] = [];

  if (context.companyName) {
    actions.push(
      `Why did ${context.companyName} get this score?`,
      "Show the strongest counter-case",
      "What evidence is missing?",
      `Refresh ${context.companyName}`,
    );
  } else if (context.comparisonSlugs.length >= 2) {
    actions.push("Compare the selected targets", "What evidence is missing across these?");
  } else {
    actions.push(
      "What changed since yesterday?",
      "Which targets need attention today?",
      context.filters.length > 0
        ? "Summarise the filtered list"
        : "Which companies should eToro look at first?",
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {actions.slice(0, compact ? 3 : 4).map((action) => (
        <button
          key={action}
          type="button"
          onClick={() => onAsk(action)}
          className="rounded-pill border border-border bg-surface-subtle px-2.5 py-1 text-caption text-secondary motion-standard transition-colors hover:border-border-strong hover:text-primary"
        >
          {action}
        </button>
      ))}
    </div>
  );
}

function CitationList({ citations }: { citations: Citation[] }) {
  return (
    <ol className="flex flex-col gap-1.5 rounded-card border border-border bg-surface-subtle px-3 py-2.5">
      <li className="text-caption font-semibold text-secondary">Sources</li>
      {citations
        .sort((left, right) => left.index - right.index)
        .map((citation) => (
          <li key={citation.sourceId} className="text-caption leading-relaxed text-secondary">
            <span className="tabular font-medium text-primary">[{citation.index}]</span>{" "}
            {citation.publisher ?? "Unattributed"}
            {citation.publishedAt ? (
              <span className="tabular text-tertiary"> · {citation.publishedAt}</span>
            ) : null}
            <br />
            <a
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 break-all text-info hover:underline"
            >
              {citation.url}
              <Icon name="external-link" size={12} />
            </a>
          </li>
        ))}
    </ol>
  );
}
