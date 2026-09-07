/**
 * The product's masthead.
 *
 * ---------------------------------------------------------------------------
 * REPLACEMENT NOTE - READ BEFORE SHIPPING
 *
 * This is a TEMPORARY plain-text wordmark, not eToro's logo.
 *
 * The repository contains no licensed copy of the current (2026) eToro brand
 * asset, and the brand direction is explicit that the logo must not be redrawn
 * or reproduced from memory - an approximation is worse than an honest
 * placeholder, because it looks official enough that nobody fixes it.
 *
 * To replace: drop the official SVG into `public/brand/`, then swap the
 * `<span>` below for it. Nothing else in the product references the mark, so
 * that single edit is the whole change.
 * ---------------------------------------------------------------------------
 *
 * The product label beside it stays neutral - `Corp Dev Intelligence` - because
 * the tool has no approved product name yet.
 */

export interface WordmarkProps {
  /** Collapsed navigation shows the mark alone, without the product label. */
  showLabel?: boolean;
}

export function Wordmark({ showLabel = true }: WordmarkProps) {
  return (
    <span className="flex items-center gap-2.5 min-w-0">
      {/*
       * Lowercase, tight tracking: the closest an unstyled text node gets to
       * the real mark without pretending to be it. `select-none` so a stray
       * drag on the nav header does not highlight the brand.
       */}
      <span
        aria-label="eToro"
        className="select-none text-[17px] font-semibold lowercase leading-none tracking-[-0.03em] text-brand"
      >
        etoro
      </span>
      {showLabel ? (
        <span className="min-w-0 truncate border-l border-border pl-2.5 text-caption font-medium leading-none text-secondary">
          Corp Dev Intelligence
        </span>
      ) : null}
    </span>
  );
}
