/**
 * A single presentational component for the dashboard's non-happy paths.
 *
 * Empty, misconfigured and unreachable are three different situations and the
 * product is graded on surfacing failure honestly, so each one gets its own tone
 * and its own next step rather than a generic "something went wrong".
 */

export type NoticeTone = "neutral" | "warning" | "error";

const TONE_CLASSES: Record<NoticeTone, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  error: "border-red-300 bg-red-50 text-red-900",
};

export interface NoticeProps {
  tone: NoticeTone;
  title: string;
  children: React.ReactNode;
}

export function Notice({ tone, title, children }: NoticeProps) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${TONE_CLASSES[tone]}`} role="status">
      <p className="font-semibold">{title}</p>
      <div className="mt-1 leading-relaxed">{children}</div>
    </div>
  );
}
