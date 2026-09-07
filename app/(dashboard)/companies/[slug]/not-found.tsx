import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";

/**
 * No company with that slug.
 *
 * Deliberately worded as "not in the universe" rather than "not found". The
 * distinction matters in a monitoring product: the company may well exist in
 * the world, and saying so keeps the reader from concluding that eToro has
 * assessed and rejected it.
 */
export default function CompanyNotFound() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <EmptyState
        icon="search"
        title="No such company in the monitored universe"
        nextStep={
          <>
            Nothing is tracked under this identifier. That says the universe does not hold it, not
            that the company does not exist - a target eToro has never looked at looks exactly like
            this. Search for it by name, or check the target list for a different spelling.
          </>
        }
        action={
          <Link
            href="/targets"
            className="inline-flex h-10 items-center gap-1.5 rounded-control border border-border-strong bg-surface px-3.5 text-body font-medium text-primary motion-standard transition-colors hover:bg-surface-subtle"
          >
            Browse all targets
            <Icon name="chevron-right" size={16} />
          </Link>
        }
      />
    </div>
  );
}
