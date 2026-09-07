import { Skeleton, SkeletonCard, SkeletonRegion } from "@/components/ui/skeleton";

/**
 * The company profile, while it loads.
 *
 * Reserves the header, the decision summary and the tab strip, because those
 * three arrive together and the reader's eye goes to the recommendation first.
 * A profile that renders the header, then pushes it up when the summary lands,
 * moves the one thing they were reading.
 */
export default function CompanyProfileLoading() {
  return (
    <SkeletonRegion label="Loading the company profile">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-6 py-6">
        <div className="rounded-card border border-border bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Skeleton width="w-48" height="h-8" />
              <Skeleton width="w-56" className="mt-2" />
              <div className="mt-3 flex gap-1.5">
                {[0, 1, 2].map((tag) => (
                  <Skeleton key={tag} width="w-24" height="h-5" className="rounded-pill" />
                ))}
              </div>
            </div>
            <div className="flex flex-col items-end gap-3">
              <Skeleton width="w-32" height="h-6" className="rounded-pill" />
              <Skeleton width="w-28" height="h-9" />
            </div>
          </div>
        </div>

        <SkeletonCard lines={5} />

        <div className="flex gap-4 border-b border-border pb-2.5">
          {[0, 1, 2, 3].map((tab) => (
            <Skeleton key={tab} width="w-20" height="h-5" />
          ))}
        </div>

        <SkeletonCard lines={4} />
      </div>
    </SkeletonRegion>
  );
}
