import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";

/**
 * Nothing here yet - and what to do about it.
 *
 * An empty state that only says "no results" wastes the one moment the reader
 * is definitely looking for guidance. Every use of this component has to supply
 * a `nextStep`, because the difference between an empty screen and a useful one
 * is whether it names the action that would fill it.
 *
 * Deliberately small and quiet: no oversized illustration, no centred hero.
 * This is a working tool, and an empty table is a normal Tuesday.
 */

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  /** What the reader can do to change this. Required by design, not optional. */
  nextStep: ReactNode;
  /** An affordance that performs the next step, when one exists in the UI. */
  action?: ReactNode;
}

export function EmptyState({ icon = "search", title, nextStep, action }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-start gap-3 rounded-card border border-dashed border-border-strong bg-surface-subtle px-5 py-6"
      role="status"
    >
      <span className="flex items-center gap-2 text-secondary">
        <Icon name={icon} size={18} />
        <span className="text-body font-semibold text-primary">{title}</span>
      </span>
      <div className="max-w-prose text-body leading-relaxed text-secondary">{nextStep}</div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
