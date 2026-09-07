import { Skeleton, SkeletonCard, SkeletonRegion } from "@/components/ui/skeleton";

/** Pipeline health, while it loads: one run card and the three review groups. */
export default function MonitoringLoading() {
  return (
    <SkeletonRegion label="Loading monitoring status">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
        <Skeleton width="w-40" height="h-8" />
        <Skeleton width="w-2/3" />
        <SkeletonCard lines={2} />
        <div className="grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((group) => (
            <div key={group} className="rounded-card border border-border bg-surface p-4">
              <Skeleton width="w-28" height="h-5" />
              <Skeleton width="w-full" className="mt-2" />
              <Skeleton width="w-3/4" className="mt-2" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}
