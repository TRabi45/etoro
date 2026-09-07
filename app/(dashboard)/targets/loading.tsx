import { Skeleton, SkeletonRegion, SkeletonTableRow } from "@/components/ui/skeleton";

/**
 * The target explorer, while it loads.
 *
 * Reserves the filter bar's height as well as the table's. Filters appearing
 * after the rows would shift the whole list down just as the reader starts
 * scanning it.
 */
export default function TargetsLoading() {
  return (
    <SkeletonRegion label="Loading the target universe">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-6">
        <Skeleton width="w-32" height="h-8" />
        <Skeleton width="w-2/3" />

        <div className="flex flex-wrap gap-2">
          <Skeleton width="w-64" height="h-10" className="rounded-control" />
          <Skeleton width="w-40" height="h-10" className="rounded-control" />
        </div>
        <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
          {[0, 1, 2, 3, 4, 5].map((chip) => (
            <Skeleton key={chip} width="w-20" height="h-8" className="rounded-control" />
          ))}
        </div>

        <div className="overflow-hidden rounded-card border border-border bg-surface">
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <SkeletonTableRow key={row} />
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}
