/**
 * Loading placeholders shaped like the content that replaces them.
 *
 * The point of a skeleton is that the page does not jump when data arrives, so
 * these are built from the same measurements as the real components - a target
 * row skeleton is one table row high, a brief skeleton is the brief's height.
 * A generic centred spinner would be less work and would tell the reader
 * nothing about what is coming.
 *
 * The pulse is a CSS animation, which the global reduced-motion rule collapses
 * to a static tint. Every skeleton block is `aria-hidden` and its container
 * carries the announcement, so assistive technology hears "Loading targets"
 * once rather than reading out two dozen empty boxes.
 */

export interface SkeletonProps {
  /** Tailwind width class, e.g. `w-32` or `w-full`. */
  width?: string;
  /** Tailwind height class. Defaults to a single line of body text. */
  height?: string;
  className?: string;
}

export function Skeleton({ width = "w-full", height = "h-4", className = "" }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded bg-border/70 ${width} ${height} ${className}`}
    />
  );
}

export interface SkeletonRegionProps {
  /** Announced to screen readers, e.g. "Loading the morning brief". */
  label: string;
  children: React.ReactNode;
}

/** Wraps a group of skeletons so the whole region announces once. */
export function SkeletonRegion({ label, children }: SkeletonRegionProps) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** A stand-in for one row of the target table, matched to its column rhythm. */
export function SkeletonTableRow() {
  return (
    <div className="flex items-center gap-4 border-b border-border px-4 py-3.5">
      <Skeleton width="w-7" height="h-7" className="rounded-control" />
      <Skeleton width="w-40" />
      <Skeleton width="w-64" className="hidden lg:block" />
      <Skeleton width="w-16" className="hidden md:block" />
      <Skeleton width="w-10" />
      <Skeleton width="w-24" />
    </div>
  );
}

/** A stand-in for a card of prose, such as the brief or a decision summary. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <Skeleton width="w-48" height="h-5" />
      <div className="mt-4 flex flex-col gap-2.5">
        {Array.from({ length: lines }, (_, index) => (
          <Skeleton
            key={index}
            // The last line is short, the way a real paragraph ends.
            width={index === lines - 1 ? "w-2/3" : "w-full"}
          />
        ))}
      </div>
    </div>
  );
}
