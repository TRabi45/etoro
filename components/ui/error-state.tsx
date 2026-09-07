import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";

/**
 * Something failed, said in the reader's terms.
 *
 * The contract here is `impact` before `detail`: an analyst needs to know what
 * they can no longer trust on this screen before they need the error message.
 * "The target list may be incomplete" is actionable; "PGRST301" is not, so the
 * technical text is present but secondary.
 *
 * Two failure shapes reach this component and they are not the same thing:
 *
 *   - a hard failure, where nothing usable rendered;
 *   - a *partial* failure, where some results are on screen and the reader has
 *     to know the set is incomplete. `tone="partial"` keeps the surrounding
 *     content visible rather than replacing it, because throwing away good rows
 *     to report a bad one is a worse answer.
 *
 * Retry is offered only where retrying is safe and cheap. A bounded, expensive
 * action gets a confirmation flow instead, not a button that quietly spends.
 */

export interface ErrorStateProps {
  /** `error` replaces the content; `partial` sits above surviving results. */
  tone?: "error" | "partial";
  title: string;
  /** Plain-language consequence: what is unreliable or missing right now. */
  impact: ReactNode;
  /** The underlying message, kept out of the way but never hidden entirely. */
  detail?: string | null;
  /** A retry control, supplied only when retrying is safe to repeat. */
  action?: ReactNode;
}

export function ErrorState({ tone = "error", title, impact, detail, action }: ErrorStateProps) {
  const isPartial = tone === "partial";

  return (
    <div
      className={`rounded-card border px-4 py-3.5 ${
        isPartial
          ? "border-warning/30 bg-warning-soft text-warning"
          : "border-danger/30 bg-danger-soft text-danger"
      }`}
      // `alert` interrupts a screen reader; a partial result is important but
      // not an interruption, so it announces politely instead.
      role={isPartial ? "status" : "alert"}
    >
      <p className="flex items-center gap-2 text-body font-semibold">
        <Icon name={isPartial ? "alert-circle" : "alert-triangle"} size={18} />
        {title}
      </p>
      <div className="mt-1.5 max-w-prose text-body leading-relaxed text-primary">{impact}</div>
      {detail ? (
        <p className="mt-2 font-mono text-caption break-words text-secondary">{detail}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
