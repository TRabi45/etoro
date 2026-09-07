import { Icon, type IconName } from "@/components/ui/icon";

/**
 * A short, inline advisory attached to content that is otherwise fine.
 *
 * Distinct from `ErrorState` (something failed) and `EmptyState` (there is
 * nothing yet): a notice qualifies content that rendered successfully - stub
 * data, a superseded model version, a caveat on a comparison. Keeping the three
 * apart is what stops every non-happy path from flattening into one generic
 * "something went wrong" box.
 */

export type NoticeTone = "neutral" | "info" | "warning" | "error";

const TONE_CLASSES: Record<NoticeTone, string> = {
  neutral: "border-border bg-surface-subtle text-primary",
  info: "border-info/25 bg-info-soft text-primary",
  warning: "border-warning/30 bg-warning-soft text-primary",
  error: "border-danger/30 bg-danger-soft text-primary",
};

const TONE_ICONS: Record<NoticeTone, IconName> = {
  neutral: "info",
  info: "info",
  warning: "alert-circle",
  error: "alert-triangle",
};

const TONE_ICON_CLASSES: Record<NoticeTone, string> = {
  neutral: "text-secondary",
  info: "text-info",
  warning: "text-warning",
  error: "text-danger",
};

export interface NoticeProps {
  tone: NoticeTone;
  title: string;
  children: React.ReactNode;
}

export function Notice({ tone, title, children }: NoticeProps) {
  return (
    <div className={`rounded-card border px-4 py-3 text-body ${TONE_CLASSES[tone]}`} role="status">
      <p className="flex items-center gap-2 font-semibold">
        <Icon name={TONE_ICONS[tone]} size={16} className={TONE_ICON_CLASSES[tone]} />
        {title}
      </p>
      <div className="mt-1 max-w-prose leading-relaxed text-secondary">{children}</div>
    </div>
  );
}
