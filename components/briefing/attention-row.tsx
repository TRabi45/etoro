import Link from "next/link";
import type { AttentionItem } from "@/src/db/repositories/briefing";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Icon, type IconName } from "@/components/ui/icon";
import { RecommendationBadge } from "@/components/ui/recommendation-badge";
import { formatRelative } from "@/components/ui/format";

/**
 * One row of "needs attention".
 *
 * The columns are the analyst's actual question order: what happened, which
 * target, why it matters to eToro, how confident the system is, and what to do
 * next. The row is a link to the target when there is one, because the next
 * action is almost always "open it" and making the reader hunt for a small
 * chevron wastes the most valuable three seconds on the page.
 *
 * `whyItMatters` is never the article's summary. When the pipeline has not
 * recorded an eToro-specific implication, the brief says the implication is
 * unassessed rather than passing a description off as an analysis.
 */

const REASON_PRESENTATION: Record<
  AttentionItem["reason"],
  { label: string; tone: BadgeTone; icon: IconName }
> = {
  blocked_gate: { label: "Blocked by a gate", tone: "danger", icon: "alert-triangle" },
  material_event: { label: "Material event", tone: "info", icon: "spark" },
  priority_ready: { label: "Ready for diligence", tone: "brand", icon: "check-circle" },
  thin_evidence: { label: "Thin evidence", tone: "warning", icon: "alert-circle" },
};

export function AttentionRow({ item }: { item: AttentionItem }) {
  const presentation = REASON_PRESENTATION[item.reason];
  const eventDate = item.event?.eventDate ?? item.event?.publishedAt ?? null;
  const relative = formatRelative(eventDate);

  const body = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={presentation.tone} icon={presentation.icon}>
          {presentation.label}
        </Badge>
        {item.target ? <RecommendationBadge recommendation={item.target.recommendation} /> : null}
        {relative ? <span className="tabular text-caption text-tertiary">{relative}</span> : null}
        {item.event && !eventDate ? (
          <span
            className="text-caption text-tertiary"
            title="No source established when this happened. It is recorded, but undated."
          >
            Undated
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-body font-medium leading-relaxed text-primary">{item.headline}</p>

      <p className="mt-1 text-body leading-relaxed text-secondary">
        <span className="font-medium text-primary">Why it matters: </span>
        {item.whyItMatters}
      </p>

      <p className="mt-2 flex items-center gap-1.5 text-body text-primary">
        <Icon name="arrow-up-right" size={15} className="text-brand" />
        {item.recommendedAction}
      </p>
    </>
  );

  if (!item.target) {
    return <li className="border-b border-border px-5 py-4 last:border-b-0">{body}</li>;
  }

  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        href={`/companies/${item.target.slug}`}
        className="block px-5 py-4 motion-standard transition-colors hover:bg-surface-subtle"
      >
        {body}
      </Link>
    </li>
  );
}
