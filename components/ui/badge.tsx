import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";

/**
 * The one pill primitive.
 *
 * Every status, tag and label in the product renders through this component so
 * that "status is never colour alone" holds structurally: a badge always has a
 * text label, and colour is an additional channel on top of it, never the
 * message. Anything that needs a status shape imports this rather than
 * assembling its own rounded span, which is how the twelve slightly different
 * pills you find in most dashboards get avoided.
 *
 * Tones map to semantic tokens, never to raw hues, so the palette can move
 * without touching call sites.
 */

export type BadgeTone = "neutral" | "brand" | "info" | "warning" | "danger" | "muted";

const TONE_CLASSES: Record<BadgeTone, string> = {
  // Default: a fact with no valence.
  neutral: "border-border-strong bg-surface-subtle text-primary",
  // Reserved for the product's own affirmative states. Near-black text on the
  // soft green tint, never white on brand green - that pairing fails AA.
  brand: "border-brand/35 bg-brand-soft text-primary",
  info: "border-info/25 bg-info-soft text-info",
  warning: "border-warning/25 bg-warning-soft text-warning",
  danger: "border-danger/25 bg-danger-soft text-danger",
  // For values that are deliberately quiet: "not applicable", inactive tags.
  muted: "border-border bg-surface-subtle text-tertiary",
};

export interface BadgeProps {
  tone?: BadgeTone;
  /** Optional leading glyph. Decorative - the label carries the meaning. */
  icon?: IconName;
  children: ReactNode;
  /**
   * Explanatory text on hover and focus. Used for M&A vocabulary that an
   * executive reader may not know ("Tuck-in", "coverage").
   */
  title?: string;
  className?: string;
}

export function Badge({ tone = "neutral", icon, children, title, className = "" }: BadgeProps) {
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-pill border px-2 py-0.5 text-caption font-medium whitespace-nowrap ${TONE_CLASSES[tone]} ${className}`}
    >
      {icon ? <Icon name={icon} size={13} /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}
