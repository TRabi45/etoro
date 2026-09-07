import type { PacketContradiction } from "@/src/validation/evidence-packet";
import { CitationChip } from "@/components/company/citation-chip";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { formatDate, humanizeToken } from "@/components/ui/format";

/**
 * Sources that disagree, shown disagreeing.
 *
 * The requirement is that a contradiction shows *both* claims, and the layout
 * enforces it: the two sides sit side by side with equal weight, equal styling
 * and their own citations. There is no "primary" side and no resolution,
 * because the pipeline has not made one - preferring the more convenient figure
 * silently is the failure this component exists to prevent.
 *
 * The claim kind stays on each side, since that is usually what settles it. A
 * company-reported figure disagreeing with a regulator filing is not a
 * fifty-fifty split, and the reader can only see that if both labels survive.
 */

export function ContradictionCallout({ contradiction }: { contradiction: PacketContradiction }) {
  return (
    <div className="rounded-card border border-warning/30 bg-surface">
      <div className="flex items-center gap-2 border-b border-warning/25 bg-warning-soft px-4 py-2.5">
        <Icon name="alert-circle" size={16} className="text-warning" />
        <p className="text-body font-semibold text-primary">
          Sources disagree on {humanizeToken(contradiction.topic)?.toLowerCase()}
        </p>
      </div>

      <ul className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {contradiction.claims.map((claim) => (
          <li key={claim.claimId} className="px-4 py-3">
            <p className="text-body leading-relaxed text-primary">
              {claim.statement}
              <CitationChip numbers={claim.citations.map((citation) => citation.index)} />
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone={claim.kind === "verified_fact" ? "brand" : "neutral"}>
                {humanizeToken(claim.kind)}
              </Badge>
              <span className="tabular text-caption text-tertiary">
                {formatDate(claim.asOf) ?? "Undated"}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <p className="border-t border-border px-4 py-2.5 text-caption leading-relaxed text-secondary">
        Neither figure has been preferred. Both are kept until an analyst establishes which source
        is right, and any conclusion drawn from this measure should say which side it used.
      </p>
    </div>
  );
}
