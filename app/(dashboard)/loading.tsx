import { Skeleton, SkeletonCard, SkeletonRegion } from "@/components/ui/skeleton";

/**
 * The briefing, while it loads.
 *
 * Shaped like the real page - brief card, three attention rows, a five-row
 * table - so nothing moves when the data arrives. A centred spinner would be
 * less work and would tell the reader nothing about what is coming, and an
 * empty frame would read as "no findings today", which is a different and much
 * worse message than "not yet".
 */
export default function BriefingLoading() {
  return (
    <SkeletonRegion label="Loading the morning brief">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
        <Skeleton width="w-40" height="h-8" />
        <SkeletonCard lines={2} />

        <div>
          <Skeleton width="w-36" height="h-5" />
          <div className="mt-3 overflow-hidden rounded-card border border-border bg-surface">
            {[0, 1, 2].map((row) => (
              <div key={row} className="border-b border-border px-5 py-4 last:border-b-0">
                <Skeleton width="w-32" height="h-5" />
                <Skeleton width="w-3/4" className="mt-2.5" />
                <Skeleton width="w-1/2" className="mt-2" />
              </div>
            ))}
          </div>
        </div>

        <div>
          <Skeleton width="w-40" height="h-5" />
          <div className="mt-3 overflow-hidden rounded-card border border-border bg-surface">
            {[0, 1, 2, 3, 4].map((row) => (
              <div
                key={row}
                className="flex items-center gap-4 border-b border-border px-5 py-3.5 last:border-b-0"
              >
                <Skeleton width="w-7" height="h-7" className="rounded-control" />
                <Skeleton width="w-36" />
                <Skeleton width="w-56" className="hidden lg:block" />
                <Skeleton width="w-12" />
                <Skeleton width="w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonRegion>
  );
}
