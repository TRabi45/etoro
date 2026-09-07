import type { TargetSummary } from "@/src/db/repositories/targets";

/**
 * The identity cell: who this company actually is.
 *
 * Brand name and legal entity are shown as two different facts, because in M&A
 * they routinely are - the thing you read about is rarely the thing you sign
 * with. When the legal entity has not been established the cell says `Unknown`
 * in as many words rather than leaving the line blank, since a blank reads as
 * "same as the brand name" and that assumption is how the wrong entity ends up
 * in a term sheet.
 *
 * The avatar is an initial on a tinted square, not a fetched favicon: a
 * third-party image request per row would leak the watchlist to every target's
 * CDN, which is not a thing an internal corp-dev tool should do.
 */

export function TargetCell({ target }: { target: TargetSummary }) {
  const initial = target.canonicalName.trim().charAt(0).toUpperCase() || "?";

  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control border border-border bg-surface-subtle text-caption font-semibold text-secondary"
      >
        {initial}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-body font-medium text-primary">
          {target.canonicalName}
        </span>
        {target.legalEntityName ? (
          <span
            className="block truncate text-caption text-tertiary"
            title={target.legalEntityName}
          >
            {target.legalEntityName}
          </span>
        ) : (
          <span
            className="block text-caption text-tertiary"
            title="No legal entity has been established for this company. It is not assumed to match the brand name."
          >
            Legal entity unknown
          </span>
        )}
      </span>
    </span>
  );
}
