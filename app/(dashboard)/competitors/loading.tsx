import { Skeleton, SkeletonRegion, SkeletonTableRow } from "@/components/ui/skeleton";

/** Competitor transactions, while they load. */
export default function CompetitorsLoading() {
  return (
    <SkeletonRegion label="Loading competitor transactions">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6">
        <Skeleton width="w-40" height="h-8" />
        <Skeleton width="w-2/3" />
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          {[0, 1, 2, 3].map((row) => (
            <SkeletonTableRow key={row} />
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}
