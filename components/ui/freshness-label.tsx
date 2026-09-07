import { STALE_AFTER_DAYS } from "@/src/db/repositories/company-profile";
import { Icon } from "@/components/ui/icon";
import { ageInDays, formatDateTime, formatRelative } from "@/components/ui/format";

/**
 * How old the underlying research is, and whether that is a problem yet.
 *
 * Freshness is a first-class field in a monitoring product: a profile that was
 * accurate six months ago and has not been revisited is not the same object as
 * one confirmed this morning, and the difference has to be visible without the
 * reader opening anything.
 *
 * The staleness threshold is imported from the profile mapper rather than
 * restated, so "stale" means one thing across the product.
 *
 * A company with no research at all returns "Never researched" - which is not a
 * stale state. Nothing has gone off; nothing has been done.
 */

export interface FreshnessLabelProps {
  /** ISO timestamp of the last research pass, or null if never researched. */
  lastResearchedAt: string | null;
  /** Renders the exact timestamp beside the relative age. */
  showExact?: boolean;
}

export function FreshnessLabel({ lastResearchedAt, showExact = false }: FreshnessLabelProps) {
  if (!lastResearchedAt) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-caption text-tertiary"
        title="No research run has ever completed for this company. It is an identity record only."
      >
        <Icon name="minus" size={14} />
        Never researched
      </span>
    );
  }

  const days = ageInDays(lastResearchedAt);
  const relative = formatRelative(lastResearchedAt);
  const exact = formatDateTime(lastResearchedAt);
  const stale = days !== null && days > STALE_AFTER_DAYS;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-caption ${
        stale ? "font-medium text-warning" : "text-secondary"
      }`}
      title={
        stale
          ? `Last verified ${exact}, more than ${STALE_AFTER_DAYS} days ago. Treat these figures as unconfirmed until a refresh runs.`
          : `Last verified ${exact}.`
      }
    >
      <Icon name={stale ? "alert-circle" : "clock"} size={14} />
      {/* The word "Stale" is present in the text, so the amber is reinforcement
          rather than the only signal that something is wrong. */}
      {stale ? `Stale - verified ${relative}` : `Verified ${relative}`}
      {showExact && exact ? <span className="tabular text-tertiary">({exact})</span> : null}
    </span>
  );
}
