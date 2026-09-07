import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";

/** The matrix, while it loads: four theme rows, exactly as the real grid has. */
export default function MarketMapLoading() {
  return (
    <SkeletonRegion label="Loading the market map">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-6">
        <Skeleton width="w-44" height="h-8" />
        <Skeleton width="w-2/3" />
        <div className="flex gap-1.5">
          {[0, 1, 2].map((tab) => (
            <Skeleton key={tab} width="w-28" height="h-8" className="rounded-control" />
          ))}
        </div>
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          {[0, 1, 2, 3].map((row) => (
            <div
              key={row}
              className="flex items-center gap-6 border-b border-border px-4 py-4 last:border-b-0"
            >
              <Skeleton width="w-36" />
              <Skeleton width="w-20" height="h-12" className="rounded-control" />
              <Skeleton width="w-20" height="h-12" className="rounded-control" />
              <Skeleton width="w-10" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}
